"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { AuditEvent, InboxItem } from "@/lib/schema";
import { StageError } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import { softDeleteBatch } from "@/server/graph/delete";
import { GoneError } from "@/server/graph/write";
import { openDealFromItem } from "@/server/inbox/deal";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

/**
 * A person's decisions on an inbox item (FR-INBOX-12). Every one is a server
 * action with the caller's role checked (invariant 10) and an audit event.
 */

async function loadItem(workspaceId: string, itemId: string): Promise<InboxItem | null> {
  const snap = await db().doc(`workspaces/${workspaceId}/inbox/${itemId}`).get();
  const parsed = snap.exists ? InboxItem.safeParse(snap.data()) : null;
  return parsed?.success ? parsed.data : null;
}

/** "Open a deal": a maybe, or a lead when automatic intake is off. Intake starts and stops at Gate A. */
export async function openInboxDeal(itemId: string): Promise<{ error?: string }> {
  const context = await requireRole("editor");
  [itemId] = parseArgs([ArgId], [itemId]);
  const item = await loadItem(context.workspace.id, itemId);
  if (!item) return { error: "That email is no longer in the inbox." };
  if (item.opportunityId) redirect(`/opportunities/${item.opportunityId}`);
  if (!item.body) return { error: "FlowHub didn't keep this email's text. Choose This is a lead, then send it again from Gmail." };
  let opportunityId: string;
  try {
    opportunityId = await openDealFromItem(context, item, "opened");
  } catch (err) {
    if (err instanceof StageError) return { error: err.message };
    throw err;
  }
  redirect(`/opportunities/${opportunityId}`);
}

/**
 * "Not a lead". The body is removed (decision 4). A deal FlowHub opened on its
 * own goes to the recycle bin, where restoring it brings it back.
 */
export async function dismissInboxItem(itemId: string): Promise<{ error?: string }> {
  const context = await requireRole("editor");
  [itemId] = parseArgs([ArgId], [itemId]);
  const item = await loadItem(context.workspace.id, itemId);
  if (!item) return { error: "That email is no longer in the inbox." };
  if (item.verdict === "existing_deal") return { error: "This email belongs to a deal that is already open." };
  const base = db().collection("workspaces").doc(context.workspace.id);
  if (item.opportunityId) {
    try {
      await softDeleteBatch(context, `Deal from Gmail: ${item.company.name ?? item.from.name}`, [{ collection: "opportunities", id: item.opportunityId }], `Marked an email from ${item.from.name} as not a lead; its deal moved to the recycle bin.`);
    } catch (err) {
      if (!(err instanceof GoneError)) throw err;
    }
  }
  const now = new Date().toISOString();
  const batch = db().batch();
  batch.update(base.collection("inbox").doc(itemId), { status: "dismissed", body: null, decidedBy: context.user.name, decidedAt: now });
  batch.set(base.collection("auditEvents").doc(), AuditEvent.parse({ action: "update", entity: "inbox-item", entityId: itemId, summary: `Marked an email from ${item.from.name} as not a lead.`, by: context.user.uid, byName: context.user.name, at: now }));
  await batch.commit();
  refresh();
  return {};
}

/**
 * "This is a lead", on a "Not a lead". Its text wasn't kept, so the item waits
 * for Gmail: the next time the script sends it ("Send to FlowHub now" in the
 * Gmail panel), FlowHub reads it again and never files it as not a lead.
 */
export async function rereadInboxItem(itemId: string): Promise<{ error?: string }> {
  const context = await requireRole("editor");
  [itemId] = parseArgs([ArgId], [itemId]);
  const item = await loadItem(context.workspace.id, itemId);
  if (!item) return { error: "That email is no longer in the inbox." };
  if (!["filed", "dismissed"].includes(item.status) || item.opportunityId) return { error: "Only an email marked not a lead can be read again." };
  const base = db().collection("workspaces").doc(context.workspace.id);
  const now = new Date().toISOString();
  const batch = db().batch();
  batch.update(base.collection("inbox").doc(itemId), { status: "reread", decidedBy: context.user.name, decidedAt: now });
  batch.set(base.collection("auditEvents").doc(), AuditEvent.parse({ action: "update", entity: "inbox-item", entityId: itemId, summary: `Said an email from ${item.from.name} is a lead, to be read again from Gmail.`, by: context.user.uid, byName: context.user.name, at: now }));
  await batch.commit();
  refresh();
  return {};
}
