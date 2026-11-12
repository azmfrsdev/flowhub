import "server-only";
import { AuditEvent, type InboxItem, Opportunity, type Workspace } from "@/lib/schema";
import { StageError, startStage } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import type { HubContext } from "@/server/workspace/access";

/**
 * Opening a deal from an inbox item (FR-INBOX-10, FR-INBOX-12): by FlowHub for
 * a clear lead, or by a person for a maybe. Either way the email is intake's
 * input and intake stops at Gate A for a person (ADR-0020 D4).
 */

/**
 * Who FlowHub acts as when it opens a deal on its own. The first actor that
 * isn't a signed-in person: the audit trail and the run show this name, and
 * it can't approve a gate, because gates are server actions that need a
 * session (ADR-0020 D4).
 */
export function inboxActor(workspace: Workspace): HubContext {
  return { user: { uid: "flowhub-gmail", email: "", name: "FlowHub from Gmail", picture: null, exp: 0 }, workspace, role: "editor" };
}

const dateTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/** Intake reads the email as it came in, with who sent it. */
export function intakeText(item: Pick<InboxItem, "from" | "subject" | "receivedAt" | "body">, seller: string): string {
  return [
    `An email to ${seller}'s sales inbox in Gmail, sent to FlowHub by the company's Gmail script.`,
    `From: ${item.from.name} <${item.from.email}>`,
    `Date: ${dateTime(item.receivedAt)}`,
    `Subject: ${item.subject}`,
    "",
    item.body ?? "",
  ].join("\n");
}

/**
 * Creates the opportunity, links it to the item and starts intake. Returns the
 * opportunity ID. If intake can't start (a cap, the kill switch), the deal
 * still exists and its deal room shows why, with Retry.
 */
export async function openDealFromItem(context: HubContext, item: InboxItem, status: "intake_started" | "opened"): Promise<string> {
  const base = db().collection("workspaces").doc(context.workspace.id);
  const itemRef = base.collection("inbox").doc(item.id);
  const oppRef = base.collection("opportunities").doc();
  const now = new Date().toISOString();
  const idle = { state: "idle" as const, currentRunId: null, updatedAt: now };
  const opportunity = Opportunity.parse({
    id: oppRef.id,
    workspaceId: context.workspace.id,
    prospect: null,
    contact: { name: item.from.name, email: item.from.email },
    persona: context.workspace.persona,
    intakeType: "client_email",
    source: `From Gmail: ${item.subject || "(no subject)"}`,
    interestedOfferingIds: [...new Set(item.matches.map((match) => match.offeringId))],
    inboxItemId: item.id,
    status: "new",
    inputs: [{ kind: "text", text: intakeText(item, context.workspace.name).slice(0, 20000) }],
    stages: { intake: idle, research: idle, fit: idle, write: idle },
    rev: 0,
    createdAt: now,
    createdBy: context.user.name,
    updatedAt: now,
  });

  const created = await db().runTransaction(async (tx) => {
    const current = (await tx.get(itemRef)).data() as InboxItem | undefined;
    if (!current) throw new StageError("That email is no longer in the inbox.");
    if (current.opportunityId) return { existing: current.opportunityId, created: null };
    tx.set(oppRef, JSON.parse(JSON.stringify(opportunity)));
    tx.update(itemRef, { opportunityId: oppRef.id, dealName: item.company.name, status, decidedBy: context.user.name, decidedAt: now });
    tx.set(
      base.collection("auditEvents").doc(),
      AuditEvent.parse({
        action: "create",
        entity: "opportunity",
        entityId: oppRef.id,
        summary: `${status === "intake_started" ? "FlowHub opened" : "Opened"} a deal from an email in Gmail from ${item.from.name}${item.company.name ? ` at ${item.company.name}` : ""}.`,
        by: context.user.uid,
        byName: context.user.name,
        at: now,
      }),
    );
    return { existing: null, created: oppRef.id };
  });
  if (created.existing) return created.existing;
  const opportunityId = created.created!;

  try {
    await startStage(context, opportunityId, "intake");
  } catch (err) {
    if (!(err instanceof StageError)) throw err;
    // The deal exists; the deal room shows why intake didn't start and offers Retry.
    console.warn(`Intake didn't start for the deal from inbox item ${item.id}: ${err.message}`);
  }
  return opportunityId;
}
