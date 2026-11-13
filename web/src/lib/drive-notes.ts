import { type CalendarInvite, type DriveNotesStatus, type Meeting, NOTES_MAX_CHARS, NOTES_WINDOW_MS } from "@/lib/schema";

/**
 * Meeting notes from Google Drive (PRD 7.29, ADR-0021), as pure functions so
 * they're tested apart from Firestore and the Gmail script.
 */

/**
 * FR-NOTES-1: the meetings whose notes the script should look for. Sent from
 * FlowHub, already over, over for less than three days, and no notes yet.
 */
export function wantsNotes(invite: Pick<CalendarInvite, "status" | "end" | "notesAt">, now: number): boolean {
  if (invite.status !== "sent" || invite.notesAt) return false;
  const end = Date.parse(invite.end);
  return end <= now && now - end < NOTES_WINDOW_MS;
}

/**
 * FR-NOTES-6: step F's quiet "Waiting for notes in Drive" line. From the moment
 * the invite is sent until three days after the meeting, while no notes came.
 */
export function waitingForNotes(invite: Pick<CalendarInvite, "status" | "end" | "notesAt">, now: number): boolean {
  if (invite.status !== "sent" || invite.notesAt) return false;
  return now - Date.parse(invite.end) < NOTES_WINDOW_MS;
}

/** Only a Google Docs document link is kept: `https://docs.google.com/document/d/<id>/…`. */
export function docsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" && /^\/document\/(u\/\d+\/)?d\/[A-Za-z0-9_-]{10,200}(\/|$)/.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The Doc's text as the Planner reads it: no control characters, no long runs of blank lines, at most 20,000 characters. */
export function cleanNotes(text: string): { text: string; truncated: boolean } {
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > NOTES_MAX_CHARS ? { text: clean.slice(0, NOTES_MAX_CHARS), truncated: true } : { text: clean, truncated: false };
}

/**
 * FR-NOTES-5: a person's notes are never replaced. If someone pasted notes
 * for this meeting (a plan made after the meeting started, from notes that
 * aren't an example and didn't come from Drive), the Drive notes wait with
 * "Use these" instead of starting the Planner.
 */
export function arrivalStatus(meetings: Pick<Meeting, "createdAt" | "example" | "source">[], meetingStart: string): Extract<DriveNotesStatus, "planning" | "waiting"> {
  const start = Date.parse(meetingStart);
  const pasted = meetings.some((meeting) => !meeting.example && !meeting.source && Date.parse(meeting.createdAt) >= start);
  return pasted ? "waiting" : "planning";
}

/** The meeting's day in the workspace's time zone, as step F's meeting date (yyyy-mm-dd). */
export function heldOnDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** What the script gets for each meeting it should look for: enough to find the Doc, nothing more. No agenda, no prices, no cost. */
export function notesRequest(invite: Pick<CalendarInvite, "id" | "title" | "start" | "end">, prospect: string | null) {
  return { id: invite.id, title: invite.title, prospect, start: invite.start, end: invite.end };
}
