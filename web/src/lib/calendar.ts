import { leaks } from "@/lib/deal-room/deck";
import type { PitchPrep } from "@/lib/schema";

/**
 * FR-CAL-1 to FR-CAL-4, ADR-0016 D7: the meeting as a Google Calendar event,
 * filled in. Like "Open in Gmail" (D1), FlowHub asks for no Calendar
 * permission and creates no event: the person checks the event in Calendar
 * and presses Save, and Calendar adds the Google Meet link. Code writes the
 * title and the agenda from the approved pitch prep, and appends every link;
 * the model never writes a URL.
 */

/** The workspace's time zone. The sample sellers are all in Malaysia. */
export const WORKSPACE_TIME_ZONE = "Asia/Kuala_Lumpur";

export const MEETING_MINUTES = [30, 45, 60, 90, 120] as const;

/** Some browsers cut long links. The agenda is short, so this is a guard. */
const MAX_URL = 7500;

/** 2026-12-04T02:00:00.000Z → 20261204T020000Z, the form Calendar's `dates` takes. */
export function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A wall-clock date and time in a time zone, as a moment. "2026-12-04", "10:00", Asia/Kuala_Lumpur → 02:00 UTC. */
export function zonedTime(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  // The zone's offset at that moment: format the UTC guess in the zone and compare. A second pass settles a daylight-saving edge.
  const offset = (at: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at)).map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - at;
  };
  const first = asUtc - offset(asUtc);
  return new Date(asUtc - offset(first));
}

/** "Thu 4 Dec 2026, 10:00", as the deal's Next meeting field reads. */
export function meetingLabel(start: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(start).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

const clamp = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

/** FR-CAL-2: "Olvessa Cloud × Kedai Maju: Data platform proposal". */
export function meetingTitle(seller: string, prospect: string, topic: string): string {
  return `${clamp(seller, 60)} × ${clamp(prospect, 60)}: ${clamp(topic, 60)}`;
}

/** FR-CAL-2: the short topic in the title, from the offerings the client asked about. */
export function meetingTopic(offeringNames: string[]): string {
  return offeringNames.length === 1 ? `${offeringNames[0]} proposal` : "Proposal walkthrough";
}

/** A URL or a web address in model-written text. Links are code's to add. */
const URLISH = /https?:\/\/|www\.|\b[\w-]+\.(?:com|my|net|org|io|co)\b/i;

/**
 * FR-CAL-3: the agenda. Without a pitch prep it is the standard one: a
 * walk-through of the proposal. With one, it holds the points to land and the
 * questions to ask, and nothing else from the prep: no numbers, no probes, no
 * suggested answers, no "why" notes. Code drops any item with an amount, a
 * price placeholder, a private result's name or a web address, and counts it.
 * Links to the proposal and slides come last, added by code.
 */
export function meetingAgenda(prep: Pick<PitchPrep, "points" | "ask"> | null, links: { label: string; url: string }[], privateNames: string[]): { text: string; dropped: number } {
  let dropped = 0;
  const keep = (text: string) => {
    if (!text.trim() || leaks(text, privateNames) || URLISH.test(text)) {
      dropped += 1;
      return false;
    }
    return true;
  };
  const points = (prep?.points ?? []).map((point) => point.text).filter(keep);
  const questions = (prep?.ask ?? []).map((item) => item.question).filter(keep);
  const agenda = ["Introductions and goals for the meeting", ...(points.length ? points.map((point) => clamp(point, 160)) : ["A walk-through of our proposal"]), "Questions, and the next steps"];
  const blocks = [`Agenda\n${agenda.map((item, index) => `${index + 1}. ${item}`).join("\n")}`];
  if (questions.length) blocks.push(`Questions to talk through\n${questions.map((question) => `- ${clamp(question, 160)}`).join("\n")}`);
  if (links.length) blocks.push(links.map((link) => `${link.label}: ${link.url}`).join("\n"));
  return { text: blocks.join("\n\n"), dropped };
}

export type CalendarEvent = { title: string; start: Date; minutes: number; details: string; guests: string[]; timeZone: string };

/** A plain email address, one at a time. */
export const isEmail = (value: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);

/** "a@x.com; b@y.com,  c@z.com" → the valid addresses, once each. */
export function parseGuests(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter((value) => isEmail(value) && !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()));
}

/** FR-CAL-1: Calendar's event template link. Nothing is created until the person saves it. */
export function calendarTemplateUrl(event: CalendarEvent, account?: string | null): string {
  const end = new Date(event.start.getTime() + event.minutes * 60_000);
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${utcStamp(event.start)}/${utcStamp(end)}`, ctz: event.timeZone });
  if (event.guests.length) params.set("add", event.guests.join(","));
  if (account) params.set("authuser", account);
  const base = `https://calendar.google.com/calendar/render?${params.toString()}&details=`;
  let details = event.details;
  if (base.length + encodeURIComponent(details).length > MAX_URL) {
    while (details.length > 200 && base.length + encodeURIComponent(`${details}…`).length > MAX_URL) details = details.slice(0, Math.floor(details.length * 0.9));
    details = `${details.trimEnd()}…`;
  }
  return base + encodeURIComponent(details);
}
