import "server-only";
import { arrivalStatus, cleanNotes, docsUrl, heldOnDay, notesRequest, wantsNotes } from "@/lib/drive-notes";
import { AuditEvent, CalendarInvite, DriveNotes, type Meeting, type Workspace } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { dispatchJob } from "@/server/jobs/dispatch";
import type { HubContext } from "@/server/workspace/access";

/**
 * The Gmail script's side of meeting notes from Google Drive (PRD 7.29,
 * ADR-0021), behind `/api/inbox` and its workspace key. The key alone decides
 * the workspace (invariant 7); the meeting decides the deal, never the body.
 */

export class NotesError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotesError";
  }
}

/**
 * Who FlowHub acts as when it plans from notes the script sent. Like "FlowHub
 * from Gmail" (ADR-0020 D4): not a signed-in person, shown in the audit trail
 * and on the plan, and it can't approve anything.
 */
export function driveActor(workspace: Workspace): HubContext {
  return { user: { uid: "flowhub-drive", email: "", name: "FlowHub from Drive", picture: null, exp: 0 }, workspace, role: "editor" };
}

/** Sent invites, read once per check. One equality filter, so no composite index. */
async function sentInvites(workspaceId: string): Promise<CalendarInvite[]> {
  const snap = await db().collection(`workspaces/${workspaceId}/invites`).where("status", "==", "sent").get();
  return snap.docs.flatMap((doc) => {
    const parsed = CalendarInvite.safeParse(doc.data());
    return parsed.success ? [parsed.data] : [];
  });
}

/** How many meetings want notes, so the script looks in Drive only when some do. */
export async function notesWaiting(workspaceId: string, now = Date.now()): Promise<number> {
  return (await sentInvites(workspaceId)).filter((invite) => wantsNotes(invite, now)).length;
}

/** FR-NOTES-1: the meetings the script should find notes for, with the prospect's name to search by. */
export async function meetingsWantingNotes(workspaceId: string, now = Date.now()) {
  const invites = (await sentInvites(workspaceId)).filter((invite) => wantsNotes(invite, now)).slice(0, 10);
  const opps = await Promise.all(invites.map((invite) => db().doc(`workspaces/${workspaceId}/opportunities/${invite.opportunityId}`).get()));
  return invites.flatMap((invite, index) => {
    const opp = opps[index];
    if (!opp.exists || opp.get("deletedAt")) return [];
    return [notesRequest(invite, (opp.get("prospect.name") as string | undefined) ?? null)];
  });
}

export type NotesInput = { inviteId: string; docTitle: string; docUrl: string; text: string; foundIn: "calendar" | "folder" };
export type NotesOutcome = { status: "planning" | "waiting" | "duplicate" | "removed"; opportunityId?: string };

/**
 * FR-NOTES-3 to FR-NOTES-5: stores one meeting's notes, once, and starts the
 * Planner unless a person already pasted notes for that meeting. The invite's
 * ID is the notes' ID, and the invite records `notesAt`, in one transaction, so
 * a second send is answered "duplicate" and plans nothing.
 */
export async function receiveNotes(workspace: Workspace, input: NotesInput): Promise<NotesOutcome> {
  const docUrl = docsUrl(input.docUrl);
  if (!docUrl) throw new NotesError(400, "Only a Google Docs link is accepted for the notes.");
  const { text, truncated } = cleanNotes(input.text);
  if (text.length < 40) throw new NotesError(422, "The notes Doc is empty or too short to plan from.");

  const ws = db().collection("workspaces").doc(workspace.id);
  const inviteRef = ws.collection("invites").doc(input.inviteId);
  const now = new Date().toISOString();
  const outcome = await db().runTransaction(async (tx): Promise<NotesOutcome> => {
    const inviteSnap = await tx.get(inviteRef);
    const parsed = CalendarInvite.safeParse(inviteSnap.data());
    if (!inviteSnap.exists || !parsed.success) throw new NotesError(404, "FlowHub didn't send an invite with that ID.");
    const invite = parsed.data;
    if (invite.notesAt) return { status: "duplicate", opportunityId: invite.opportunityId };
    if (invite.status !== "sent") throw new NotesError(409, "That meeting's invite wasn't sent, so it has no notes.");

    const oppRef = ws.collection("opportunities").doc(invite.opportunityId);
    const [oppSnap, meetingsSnap] = await Promise.all([tx.get(oppRef), tx.get(oppRef.collection("meetings"))]);
    if (!oppSnap.exists || oppSnap.get("deletedAt")) {
      // The deal is gone: stop the script looking, and keep nothing.
      tx.update(inviteRef, { notesAt: now });
      return { status: "removed" };
    }
    const status = arrivalStatus(
      meetingsSnap.docs.map((doc) => doc.data() as Pick<Meeting, "createdAt" | "example" | "source">),
      invite.start,
    );
    const notes = DriveNotes.parse({
      id: invite.id,
      inviteId: invite.id,
      opportunityId: invite.opportunityId,
      meetingTitle: invite.title,
      meetingStart: invite.start,
      heldOn: heldOnDay(invite.start, invite.timeZone),
      foundIn: input.foundIn,
      docTitle: input.docTitle.trim().slice(0, 300) || "Meeting notes",
      docUrl,
      text,
      truncated,
      receivedAt: now,
      status,
    });
    const prospect = (oppSnap.get("prospect.name") as string | undefined) ?? "the client";
    tx.set(oppRef.collection("driveNotes").doc(notes.id), notes);
    tx.update(inviteRef, { notesAt: now });
    tx.set(
      ws.collection("auditEvents").doc(),
      AuditEvent.parse({
        action: "create",
        entity: "meeting-notes",
        entityId: notes.id,
        summary: `The Gmail script sent the notes of the meeting with ${prospect} from Google Drive ("${notes.docTitle}")${status === "waiting" ? ". Notes were already pasted, so they wait for a person" : ""}.`,
        by: "flowhub-drive",
        byName: "FlowHub from Drive",
        at: now,
      }),
    );
    return { status, opportunityId: invite.opportunityId };
  });

  if (outcome.status === "planning" && outcome.opportunityId) await dispatchJob({ kind: "drive-notes", workspaceId: workspace.id, opportunityId: outcome.opportunityId, notesId: input.inviteId });
  return outcome;
}
