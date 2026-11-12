import "server-only";
import { type InviteResult, claimDecision, resultPatch } from "@/lib/invites";
import { CalendarInvite, INVITE_MAX_TRIES } from "@/lib/schema";
import { db } from "@/server/firebase/admin";

/**
 * The Gmail script's side of meeting invites (FR-CAL-7, ADR-0020 D7), behind
 * `/api/inbox` and its workspace key. The key alone decides the workspace.
 */

const PER_CHECK = 5;

/** How many invites wait for the script, so it asks for them only when there are some. */
export async function invitesWaiting(workspaceId: string): Promise<number> {
  const snap = await db().collection(`workspaces/${workspaceId}/invites`).where("status", "in", ["queued", "sending"]).count().get();
  return snap.data().count;
}

/** Hands the script up to five invites to send, marking each as being sent. What it sends guests: title, times, agenda, guests. */
export async function claimInvites(workspaceId: string) {
  const col = db().collection(`workspaces/${workspaceId}/invites`);
  const snap = await col.where("status", "in", ["queued", "sending"]).limit(20).get();
  const claimed: CalendarInvite[] = [];
  for (const doc of snap.docs) {
    if (claimed.length >= PER_CHECK) break;
    const invite = await db().runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const parsed = CalendarInvite.safeParse(fresh.data());
      if (!parsed.success) return null;
      const now = new Date();
      const decision = claimDecision(parsed.data, now.getTime());
      if (decision === "fail") tx.update(doc.ref, { status: "failed", error: parsed.data.error ?? `The Gmail script didn't confirm it after ${INVITE_MAX_TRIES} tries.` });
      if (decision !== "claim") return null;
      const next = { ...parsed.data, status: "sending" as const, claimedAt: now.toISOString(), tries: parsed.data.tries + 1 };
      tx.update(doc.ref, { status: next.status, claimedAt: next.claimedAt, tries: next.tries });
      return next;
    });
    if (invite) claimed.push(invite);
  }
  return claimed.map((invite) => ({ id: invite.id, title: invite.title, details: invite.details, start: invite.start, end: invite.end, timeZone: invite.timeZone, guests: invite.guests }));
}

/** The script's report: sent with its links, or not, to try again or fail. */
export async function recordInviteResult(workspaceId: string, id: string, result: InviteResult): Promise<boolean> {
  const ref = db().doc(`workspaces/${workspaceId}/invites/${id}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const parsed = CalendarInvite.safeParse(snap.data());
    if (!parsed.success) return false;
    const patch = resultPatch(parsed.data, result, new Date().toISOString());
    if (!patch) return false;
    tx.update(ref, patch);
    return true;
  });
}
