import "server-only";
import { CalendarInvite, DriveNotes, Workspace } from "@/lib/schema";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { driveActor } from "@/server/inbox/notes";
import type { HubContext } from "@/server/workspace/access";
import { MeetingError, planMeeting } from "./meeting";

/**
 * Step F from notes found in Google Drive (PRD 7.29, FR-NOTES-4, ADR-0021).
 * The same Planner as pasted notes (`planMeeting`), with the same checks in
 * code: every quote found in the notes, amounts only from the notes or the
 * approved pricing, no cost (invariant 2), results not marked public left out
 * (invariant 5). One AI run against the daily caps; the kill switch stops it.
 * Nothing is sent: the plan waits in step F for a person.
 */

const failure = (err: unknown): string => {
  if (err instanceof MeetingError || err instanceof ModelBusyError) return err.message;
  if (err instanceof ModelOutputError) return "Gemini's answer didn't have the expected shape. Press Use these to try again.";
  console.error("Planning from Drive notes failed:", err);
  return "FlowHub couldn't plan from these notes. Press Use these to try again.";
};

/** Plans from the notes and records the outcome on them. Returns the meeting's ID, or throws for the caller to show. */
export async function planFromNotes(context: HubContext, opportunityId: string, notes: DriveNotes): Promise<string> {
  const ws = db().collection("workspaces").doc(context.workspace.id);
  const notesRef = ws.collection("opportunities").doc(opportunityId).collection("driveNotes").doc(notes.id);
  const invite = CalendarInvite.safeParse((await ws.collection("invites").doc(notes.inviteId).get()).data());
  try {
    const meeting = await planMeeting(
      context,
      opportunityId,
      { notes: notes.text, heldOn: notes.heldOn, example: null, source: { kind: "drive", inviteId: notes.inviteId, docTitle: notes.docTitle, docUrl: notes.docUrl, receivedAt: notes.receivedAt } },
      // The emails are signed by a person: whoever pressed Use these, or else whoever sent the invite.
      { sender: context.user.uid === "flowhub-drive" && invite.success ? invite.data.createdBy : context.user.name },
    );
    await notesRef.update({ status: "planned", meetingId: meeting.id, error: null });
    return meeting.id;
  } catch (err) {
    await notesRef.update({ status: "failed", error: failure(err) });
    throw err;
  }
}

/** The background job the route queues (ADR-0010 D2): IDs only, everything read from Firestore (invariant 8). */
export async function runDriveNotes(job: { workspaceId: string; opportunityId: string; notesId: string }): Promise<void> {
  const ws = db().collection("workspaces").doc(job.workspaceId);
  const [wsSnap, notesSnap] = await Promise.all([ws.get(), ws.collection("opportunities").doc(job.opportunityId).collection("driveNotes").doc(job.notesId).get()]);
  const workspace = Workspace.safeParse({ ...wsSnap.data(), id: wsSnap.id });
  const notes = DriveNotes.safeParse(notesSnap.data());
  if (!workspace.success || workspace.data.deletedAt || !notes.success || notes.data.status !== "planning") return;
  try {
    await planFromNotes(driveActor(workspace.data), job.opportunityId, notes.data);
  } catch {
    // Recorded on the notes, with Use these for a person.
  }
}

export { failure as notesFailure };
