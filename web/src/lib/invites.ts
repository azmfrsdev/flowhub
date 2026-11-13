import { type CalendarInvite, INVITE_CLAIM_MS, INVITE_MAX_TRIES, type InboxSettings, SCRIPT_FRESH_MS } from "@/lib/schema";

/**
 * FR-CAL-6 to FR-CAL-8, ADR-0020 D7: the rules for invites sent through the
 * Gmail script, as pure functions, so they're tested apart from Firestore.
 */

const BASE32HEX = "0123456789abcdefghijklmnopqrstuv";

/** 26 characters from Calendar's event-ID alphabet (a to v, 0 to 9), from 130 random bits. */
export function newInviteId(random: (bytes: number) => Uint8Array = (bytes) => crypto.getRandomValues(new Uint8Array(bytes))): string {
  return [...random(26)].map((byte) => BASE32HEX[byte & 31]).join("");
}

/** The sales inbox invites go out from, if the Gmail script is connected and checked in recently. */
export function inviteSender(inbox: Pick<InboxSettings, "keyHash" | "mailbox" | "lastSeenAt"> | null | undefined, now: number): string | null {
  if (!inbox?.keyHash || !inbox.mailbox || !inbox.lastSeenAt) return null;
  return now - Date.parse(inbox.lastSeenAt) <= SCRIPT_FRESH_MS ? inbox.mailbox : null;
}

/**
 * What to do with an invite when the script asks for work: hand it over, give
 * up on it (taken too often without a reply), or leave it.
 */
export function claimDecision(invite: Pick<CalendarInvite, "status" | "tries" | "claimedAt">, now: number): "claim" | "fail" | "skip" {
  const stale = invite.status === "sending" && (!invite.claimedAt || now - Date.parse(invite.claimedAt) >= INVITE_CLAIM_MS);
  if (invite.status !== "queued" && !stale) return "skip";
  return invite.tries >= INVITE_MAX_TRIES ? "fail" : "claim";
}

export type InviteResult = { ok: true; eventUrl?: string | null; meetUrl?: string | null } | { ok: false; error: string };

/** The script's report on an invite it took. Only links to Google's own sites are kept. */
export function resultPatch(invite: Pick<CalendarInvite, "status" | "tries">, result: InviteResult, at: string): Partial<CalendarInvite> | null {
  if (invite.status !== "sending") return null;
  if (result.ok) return { status: "sent", sentAt: at, eventUrl: googleUrl(result.eventUrl, "calendar.google.com"), meetUrl: googleUrl(result.meetUrl, "meet.google.com"), error: null };
  const error = result.error.replace(/\s+/g, " ").trim().slice(0, 300) || "The Gmail script couldn't send it.";
  return invite.tries >= INVITE_MAX_TRIES ? { status: "failed", error } : { status: "queued", error, claimedAt: null };
}

function googleUrl(value: string | null | undefined, host: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * FR-CAL-10: an invite already on its way, or sent, for the same meeting time
 * to the same guests. A second press would email the guests twice, so the
 * card disables the button and the server refuses it. A failed one doesn't count.
 */
export function duplicateInvite<T extends Pick<CalendarInvite, "status" | "start" | "guests">>(invites: T[], start: string, guests: string[]): T | null {
  const key = guestKey(guests);
  const at = Date.parse(start);
  return invites.find((invite) => invite.status !== "failed" && Date.parse(invite.start) === at && guestKey(invite.guests) === key) ?? null;
}

const guestKey = (guests: string[]) => [...new Set(guests.map((guest) => guest.trim().toLowerCase()))].sort().join(",");
