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
import { formBody, formItemId, formQuotable, formTitle, formWebsite, isThin, mapServices } from "@/lib/inbox/form";
import { AuditEvent, type Constraint, INBOX_DAILY_LIMIT, type InboxEmail, type InboxForm, InboxItem, type InboxMatch, InboxReading, InboxSettings, type InboxSource, Opportunity, type Partner, type Workspace } from "@/lib/schema";
import { type Usage, generateJson, withModelScope } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { ACTORS, inboxActor, openDealFromItem } from "@/server/inbox/deal";
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

export type Assessment = Omit<InboxItem, "id" | "source" | "form" | "messageId" | "threadId" | "subject" | "receivedAt" | "triagedAt" | "status" | "opportunityId" | "dealName" | "decidedBy" | "decidedAt"> & {
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
  /**
   * A website form answer (PRD 7.30): the ticked services, already mapped to
   * live offerings by code, the company the person typed, and whether the
   * message is too thin for a clear lead.
   */
  form?: { matches: InboxMatch[]; company: string | null; thin: boolean; quotable: string };
}): Promise<Assessment> {
  const sender = parseSender(input.email.from);
  if (!sender) throw new InboxError(400, "The sender's address couldn't be read.");
  const text = emailText(input.email.subject, input.email.body);
  const catalogue = inboxCatalogue(input.offerings);

  const reading = await generateJson({
    tier: "flash",
    system: prompt("inbox-triage", { seller: input.seller, catalogue: catalogue.map((entry) => entry.line).join("\n") || "(nothing listed yet)" }),
    prompt: input.form
      ? `<form>\nAn answer to the website form "${input.email.subject}". The person typed every answer below; the services are the boxes they ticked. Quote reasons only from the message and the start time, the person's own words, never from the other fields.\nFrom: ${sender.name} <${sender.email}>\n\n${input.email.body}\n</form>`
      : `<email>\nFrom: ${sender.name} <${sender.email}>\nSubject: ${input.email.subject}\n\n${input.email.body}\n</email>`,
    schema: InboxReading,
    usage: input.usage,
  });

  // On the form a reason must quote the person's own words (the message and timeline), not a field such as the ticked boxes.
  const { kept, dropped } = checkReasons(input.form?.quotable ?? text, reading.reasons);
  // On the form the person typed their company; it is in the text, so the same word-for-word check applies.
  const company = companyOf(sender.email, input.form?.company || reading.company, text);
  // Ticked services count by code; the model's references from the message are checked as for an email.
  const matches = mergeMatches(input.form?.matches ?? [], checkMatches(reading.matches, catalogue));
  const knownDeal = findKnownDeal({ senderEmail: sender.email, threadId: input.email.threadId, deals: input.deals, threadDeals: input.threadDeals });
  const partner = findPartner(sender.email, input.partners);
  const rules = inboxRuleConflicts(input.rules, { text, company });
  const { score, breakdown } = scoreEmail({ matches: matches.length, kinds: new Set(kept.map((reason) => reason.kind)), company });
  const verdict = decideVerdict({ model: reading.verdict, knownDeal: Boolean(knownDeal), partner: Boolean(partner), score, companyKnown: company.name !== null, matches: matches.length, rulesBroken: rules.length, override: input.override, thin: input.form?.thin });
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

/** Ticked services first, then the model's references; anything in an offering already ticked adds nothing. */
function mergeMatches(ticked: InboxMatch[], read: InboxMatch[]): InboxMatch[] {
  return [...ticked, ...read.filter((match) => !ticked.some((other) => other.offeringId === match.offeringId))];
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
export function triageEmail(workspace: Workspace, email: InboxEmail): Promise<TriageResult> {
  return triage(workspace, { itemId: `gm_${email.messageId}`, source: "gmail", email });
}

/**
 * FR-FORM-4 to FR-FORM-8: one answer to the website's Google Form, sent by the
 * same script's form trigger. It becomes the same inbox item as an email and
 * goes through the same reading and code checks, with three differences: the
 * ticked services map to offerings by code, the typed company is checked word
 * for word like a signature, and a message too thin to describe a need can't
 * be a clear lead. The same answer sent twice returns the first item.
 */
export function triageForm(workspace: Workspace, form: InboxForm): Promise<TriageResult> {
  const itemId = formItemId(form.responseId);
  const email: InboxEmail = {
    messageId: form.responseId,
    // No thread: the item's own ID never matches another item's.
    threadId: itemId,
    from: form.name ? `${form.name.replace(/[<>"]/g, "")} <${form.email}>` : form.email,
    subject: formTitle(workspace.name),
    body: formBody(form),
    receivedAt: form.submittedAt,
  };
  return triage(workspace, { itemId, source: "form", email, form });
}

async function triage(workspace: Workspace, input: { itemId: string; source: InboxSource; email: InboxEmail; form?: InboxForm }): Promise<TriageResult> {
  const { email, form } = input;
  const base = db().collection("workspaces").doc(workspace.id);
  const itemRef = base.collection("inbox").doc(input.itemId);
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

  const services = form ? mapServices(form.services, graph.offerings) : null;
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
      form: form && services ? { matches: services.matches, company: form.company || null, thin: isThin(form), quotable: formQuotable(form) } : undefined,
    }),
  );

  const { knownDeal, ...kept } = assessment;
  const now = new Date().toISOString();
  const notALead = kept.verdict === "not_a_lead";
  const actor = ACTORS[input.source];
  const item = InboxItem.parse({
    ...kept,
    id: itemRef.id,
    source: input.source,
    ...(form && services
      ? {
          // Decision 4 holds for the form too: a non-lead keeps none of the answers beyond the sender and the reason.
          form: notALead
            ? { company: null, website: null, services: [], servicesDropped: services.dropped, timeline: null }
            : { company: form.company || null, website: formWebsite(form.website), services: services.matches.map((match) => match.label), servicesDropped: services.dropped, timeline: form.timeline || null },
        }
      : {}),
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
  if (form) batch.update(base, { "inbox.lastFormAt": now });
  batch.set(
    base.collection("auditEvents").doc(),
    AuditEvent.parse({
      action: "generate",
      entity: "inbox-item",
      entityId: item.id,
      summary: `FlowHub read ${form ? "a website form answer" : "an email"} from ${item.from.name}${item.company.name ? ` at ${item.company.name}` : ""}: ${VERDICT_WORDS[item.verdict]}${item.verdict === "not_a_lead" ? "" : `, score ${item.score}`}.`,
      by: actor.uid,
      byName: actor.name,
      at: now,
    }),
  );
  await batch.commit();

  // Decision 1: a clear lead opens a deal and starts intake on its own, unless Settings › Inbox turned that off.
  if (item.verdict === "lead" && settings.autoIntake) {
    const opportunityId = await openDealFromItem(inboxActor(workspace, input.source), item, "intake_started");
    return { kind: "item", item: { ...item, opportunityId, dealName: item.company.name, status: "intake_started", decidedBy: actor.name, decidedAt: now }, fresh: true };
  }
  return { kind: "item", item, fresh: true };
}

export const VERDICT_WORDS = { lead: "a lead", maybe: "a maybe", existing_deal: "an existing deal", not_a_lead: "not a lead" } as const;
