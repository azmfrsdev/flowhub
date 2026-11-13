import { z } from "zod";
import { Id, IsoDate } from "./common";
import { INVITE_ID } from "./invite";

/**
 * `workspaces/{ws}/opportunities/{opp}/driveNotes/{inviteId}` (PRD 7.29,
 * FR-NOTES-1 to FR-NOTES-8, ADR-0021): the notes of a meeting FlowHub sent the
 * invite for, found in Google Drive by the Gmail script in the sales inbox's
 * own account and sent to FlowHub. The invite's ID is the document's ID, so a
 * meeting's notes arrive once. Step F plans the next steps from them as if a
 * person had pasted them. Internal: not part of R12.
 */

/** The Drive folder the script looks in when no notes are attached to the Calendar event. */
export const NOTES_FOLDER = "FlowHub notes";
/** The script looks for a meeting's notes for this long after it ends. */
export const NOTES_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** As pasted notes (FR-MEET-1). */
export const NOTES_MAX_CHARS = 20000;

export const DriveNotesStatus = z.enum([
  /** The Planner is reading them. */
  "planning",
  /** The next steps are planned: `meetingId`. */
  "planned",
  /** A person had already pasted notes for this meeting: shown with "Use these". */
  "waiting",
  /** Planning didn't run or didn't finish (a cap, the kill switch, a model error): `error`, with "Use these". */
  "failed",
]);
export type DriveNotesStatus = z.infer<typeof DriveNotesStatus>;

export const DriveNotes = z.object({
  id: z.string().regex(INVITE_ID),
  inviteId: z.string().regex(INVITE_ID),
  opportunityId: Id,
  /** The meeting's title and start, from the invite. */
  meetingTitle: z.string().max(300),
  meetingStart: IsoDate,
  /** yyyy-mm-dd in the workspace's time zone, as step F's meeting date. */
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Where the script found the Doc: attached to the Calendar event, or in the "FlowHub notes" folder. */
  foundIn: z.enum(["calendar", "folder"]),
  docTitle: z.string().min(1).max(300),
  /** Only a docs.google.com document link is kept. */
  docUrl: z.string().max(2000),
  text: z.string().min(1).max(NOTES_MAX_CHARS),
  /** The script cut the Doc at NOTES_MAX_CHARS. */
  truncated: z.boolean().default(false),
  receivedAt: IsoDate,
  status: DriveNotesStatus,
  meetingId: Id.nullable().default(null),
  error: z.string().nullable().default(null),
  /** The person who pressed "Use these", if anyone did. */
  usedBy: z.string().nullable().default(null),
});
export type DriveNotes = z.infer<typeof DriveNotes>;
