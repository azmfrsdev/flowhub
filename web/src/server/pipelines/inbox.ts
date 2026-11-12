import "server-only";
import {
  type CatalogueOffering,
  type KnownDeal,
  checkMatches,
  checkReasons,
  companyOf,
  decideVerdict,
  domainOf,
  emailText,
  findKnownDeal,
  findPartner,
  hostOf,
  inboxCatalogue,
  inboxRuleConflicts,
  isFreeMail,
  parseSender,
  sameDomain,
  scoreEmail,
} from "@/lib/inbox/triage";
import { AuditEvent, type Constraint, INBOX_DAILY_LIMIT, type InboxEmail, InboxItem, InboxReading, InboxSettings, Opportunity, type Partner, type Workspace } from "@/lib/schema";
import { type Usage, generateJson, withModelScope } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { inboxActor, openDealFromItem } from "@/server/inbox/deal";
import { prompt } from "@/server/prompts";
import { UsageError, chargeInboxEmail } from "@/server/workspace/usage";

/**
 * Gmail inbox leads (PRD 7.27, ADR-0020). One Flash call reads the email with
 * structured output; code then checks every quote word for word, finds the
 * company from the sender's address, keeps only live offerings, looks for a
 * deal already open, applies the selling rules and calculates the score. A
 * clear lead opens a deal and starts intake, which stops at Gate A.
 *
 * Like every pipeline it reads its inputs from Firestore and keeps nothing in
 * memory (invariant 8). The workspace comes from the key, never from the email
 * (invariant 7).
 */

export class InboxError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "InboxError";
  }
}

/** The page doesn't wait on this, but the script does: retries stop after 90 seconds. */
const TRIAGE_DEADLINE_MS = 90_000;

export type Assessment = Omit<InboxItem, "id" | "messageId" | "threadId" | "subject" | "receivedAt" | "triagedAt" | "status" | "opportunityId" | "dealName" | "decidedBy" | "decidedAt"> & {
  knownDeal: KnownDeal | null;
};

/**
 * Reads one email and checks the reading. No Firestore: the eval runs it with
 * the sample catalogue in memory. Never sees a price, a cost or a partner's
 * buy price: the catalogue is names and summaries only (invariant 2).
 */
export async function assessEmail(input: {
  seller: string;
  offerings: CatalogueOffering[];
  rules: Constraint[];
  partners: Pick<Partner, "name" | "contacts">[];
  deals: KnownDeal[];
  threadDeals: Map<string, string>;
  email: InboxEmail;
  override?: boolean;
  usage?: Usage;
}): Promise<Assessment> {
  const sender = parseSender(input.email.from);
  if (!sender) throw new InboxError(400, "The sender's address couldn't be read.");
  const text = emailText(input.email.subject, input.email.body);
  const catalogue = inboxCatalogue(input.offerings);

  const reading = await generateJson({
    tier: "flash",
    system: prompt("inbox-triage", { seller: input.seller, catalogue: catalogue.map((entry) => entry.line).join("\n") || "(nothing listed yet)" }),
    prompt: `<email>\nFrom: ${sender.name} <${sender.email}>\nSubject: ${input.email.subject}\n\n${input.email.body}\n</email>`,
    schema: InboxReading,
    usage: input.usage,
  });

  const { kept, dropped } = checkReasons(text, reading.reasons);
  const company = companyOf(sender.email, reading.company, text);
  const matches = checkMatches(reading.matches, catalogue);
  const knownDeal = findKnownDeal({ senderEmail: sender.email, threadId: input.email.threadId, deals: input.deals, threadDeals: input.threadDeals });
  const partner = findPartner(sender.email, input.partners);
  const rules = inboxRuleConflicts(input.rules, { text, company });
  const { score, breakdown } = scoreEmail({ matches: matches.length, kinds: new Set(kept.map((reason) => reason.kind)), company });
  const verdict = decideVerdict({ model: reading.verdict, knownDeal: Boolean(knownDeal), partner: Boolean(partner), score, companyKnown: company.name !== null, matches: matches.length, rulesBroken: rules.length, override: input.override });
  return {
    from: sender,
    body: input.email.body,
    verdict,
    modelVerdict: reading.verdict,
    summary: reading.summary.trim(),
    reasons: kept,
    dropped,
    company,
    matches,
    rules,
    partner,
    score: verdict === "not_a_lead" ? 0 : score,
    breakdown,
    knownDeal,
  };
}

export type TriageResult =
  | { kind: "skipped"; reason: "internal" }
  | { kind: "item"; item: InboxItem; fresh: boolean };

/** The company's own addresses: its website's domain and the mailbox's own domain, unless that is free mail. */
function isInternal(senderEmail: string, workspace: Workspace, mailbox: string | null): boolean {
  if (mailbox && senderEmail === mailbox.toLowerCase()) return true;
  const domain = domainOf(senderEmail);
  const own = [hostOf(workspace.website), mailbox ? domainOf(mailbox) : null].filter((value): value is string => Boolean(value) && !isFreeMail(value!));
  return own.some((host) => sameDomain(host, domain));
}

/**
 * FR-INBOX-3 to FR-INBOX-10: one email from the script, for the workspace its
 * key belongs to. An email already read returns its item without another
 * model call, so the script can send it twice and "Send to FlowHub now" is
 * safe to press again.
 */
export async function triageEmail(workspace: Workspace, email: InboxEmail): Promise<TriageResult> {
  const base = db().collection("workspaces").doc(workspace.id);
  const itemRef = base.collection("inbox").doc(`gm_${email.messageId}`);
  const settings = InboxSettings.parse(workspace.inbox ?? {});
  const sender = parseSender(email.from);
  if (!sender) throw new InboxError(400, "The sender's address couldn't be read.");
  if (isInternal(sender.email, workspace, settings.mailbox)) return { kind: "skipped", reason: "internal" };

  const existing = await itemRef.get();
  const previous = existing.exists ? InboxItem.safeParse(existing.data()) : null;
  if (previous?.success && previous.data.status !== "reread") return { kind: "item", item: previous.data, fresh: false };
  const override = previous?.success === true && previous.data.status === "reread";

  try {
    await chargeInboxEmail(workspace.id, INBOX_DAILY_LIMIT);
  } catch (err) {
    if (err instanceof UsageError) throw new InboxError(429, err.message);
    throw err;
  }

  const [graph, oppSnap, threadSnap] = await Promise.all([getGraphFor(workspace.id), base.collection("opportunities").get(), base.collection("inbox").where("threadId", "==", email.threadId).get()]);
  const deals: KnownDeal[] = oppSnap.docs.flatMap((doc) => {
    const parsed = Opportunity.safeParse(doc.data());
    if (!parsed.success || parsed.data.deletedAt) return [];
    const opp = parsed.data;
    return [{ id: opp.id, name: opp.prospect?.name ?? null, website: opp.prospect?.website ?? null, contactEmail: opp.contact?.email ?? null, deletedAt: opp.deletedAt }];
  });
  const threadDeals = new Map<string, string>();
  for (const doc of threadSnap.docs) {
    const linked = doc.get("opportunityId");
    if (typeof linked === "string" && doc.get("status") !== "dismissed") threadDeals.set(email.threadId, linked);
  }

  const assessment = await withModelScope({ deadline: Date.now() + TRIAGE_DEADLINE_MS }, () =>
    assessEmail({
      seller: workspace.name,
      offerings: graph.offerings,
      rules: graph.constraints.filter((rule) => rule.offeringIds.length === 0),
      partners: graph.partners,
      deals,
      threadDeals,
      email,
      override,
    }),
  );

  const { knownDeal, ...kept } = assessment;
  const now = new Date().toISOString();
  const notALead = kept.verdict === "not_a_lead";
  const item = InboxItem.parse({
    ...kept,
    id: itemRef.id,
    messageId: email.messageId,
    threadId: email.threadId,
    subject: email.subject,
    receivedAt: email.receivedAt,
    triagedAt: now,
    // Decision 4: a non-lead keeps sender, subject, date and the reason, never the body.
    body: notALead ? null : kept.body,
    opportunityId: knownDeal?.id ?? null,
    dealName: knownDeal ? (knownDeal.name ?? kept.company.name) : null,
    status: kept.verdict === "existing_deal" ? "added_to_deal" : notALead ? "filed" : "waiting",
  });

  const batch = db().batch();
  batch.set(itemRef, JSON.parse(JSON.stringify(item)));
  batch.set(
    base.collection("auditEvents").doc(),
    AuditEvent.parse({
      action: "generate",
      entity: "inbox-item",
      entityId: item.id,
      summary: `FlowHub read an email from ${item.from.name}${item.company.name ? ` at ${item.company.name}` : ""}: ${VERDICT_WORDS[item.verdict]}${item.verdict === "not_a_lead" ? "" : `, score ${item.score}`}.`,
      by: "flowhub-gmail",
      byName: "FlowHub from Gmail",
      at: now,
    }),
  );
  await batch.commit();

  // Decision 1: a clear lead opens a deal and starts intake on its own, unless Settings › Inbox turned that off.
  if (item.verdict === "lead" && settings.autoIntake) {
    const opportunityId = await openDealFromItem(inboxActor(workspace), item, "intake_started");
    return { kind: "item", item: { ...item, opportunityId, dealName: item.company.name, status: "intake_started", decidedBy: "FlowHub from Gmail", decidedAt: now }, fresh: true };
  }
  return { kind: "item", item, fresh: true };
}

export const VERDICT_WORDS = { lead: "a lead", maybe: "a maybe", existing_deal: "an existing deal", not_a_lead: "not a lead" } as const;
