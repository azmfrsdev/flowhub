import { z } from "zod";
import { Id, IsoDate } from "./common";

/**
 * `workspaces/{ws}/invites/{id}` (PRD 7.28, FR-CAL-6 to FR-CAL-8, ADR-0020 D7):
 * a meeting invite a person sent from FlowHub. The Gmail script in the sales
 * inbox's own account picks it up, creates the Calendar event with Google Meet
 * and sends it to the guests, then reports back. FlowHub never holds a Google
 * token. The ID is also the Calendar event's ID, so a second try finds the
 * event instead of creating another. Internal: not part of R12.
 */
export const INVITE_ID = /^[0-9a-v]{20,64}$/;

export const InviteStatus = z.enum(["queued", "sending", "sent", "failed"]);
export type InviteStatus = z.infer<typeof InviteStatus>;

export const CalendarInvite = z.object({
  id: z.string().regex(INVITE_ID),
  opportunityId: Id,
  writeRunId: Id,
  status: InviteStatus,
  title: z.string().min(1).max(300),
  details: z.string().max(6000),
  start: IsoDate,
  end: IsoDate,
  timeZone: z.string().min(1).max(64),
  guests: z.array(z.email()).min(1).max(20),
  /** The sales inbox the script runs in, when the person sent it. */
  organiser: z.string().nullable(),
  /** "Fri 4 Dec 2026, 10:00", as the deal's Next meeting reads. */
  label: z.string(),
  tries: z.number().int().nonnegative().default(0),
  claimedAt: IsoDate.nullable().default(null),
  sentAt: IsoDate.nullable().default(null),
  eventUrl: z.string().nullable().default(null),
  meetUrl: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  createdAt: IsoDate,
  createdBy: z.string(),
});
export type CalendarInvite = z.infer<typeof CalendarInvite>;

/** At most this many invites per workspace per day: the script sends real email. */
export const INVITE_DAILY_LIMIT = 20;
/** An invite the script took but didn't confirm is offered again after this long. */
export const INVITE_CLAIM_MS = 10 * 60 * 1000;
/** After this many tries, an invite is marked failed for a person to look at. */
export const INVITE_MAX_TRIES = 3;
/** The script counts as connected if it checked in this recently. It checks every minute. */
export const SCRIPT_FRESH_MS = 15 * 60 * 1000;
