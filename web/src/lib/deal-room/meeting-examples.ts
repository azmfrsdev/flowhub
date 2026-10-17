import type { MeetingExample } from "@/lib/schema";

/**
 * FR-MEET-1, ADR-0016 D5: example meeting notes for people trying FlowHub
 * without a real meeting. Code builds them from this deal, so they fit
 * whichever deal is open, cost no AI run, and always give the planner every
 * kind of step: a demo, a need outside scope with its partner, a commercial
 * ask for approval, a tender, an internal question, a new offering, and
 * something the client will send.
 */

export type ExampleContext = {
  prospect: string;
  contact?: { name: string; role?: string };
  presenter: string;
  /** Offerings in the proposal, by name. */
  offerings: string[];
  /** A feature of an offering in the proposal, to demo. */
  demo?: { offering: string; feature: string };
  /** A need outside scope, and the partner the hub says covers it. */
  outside?: { need: string; partner?: string };
  /** An offering in the hub that isn't in the proposal. */
  extra?: string;
  today: Date;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Asia/Kuala_Lumpur" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Asia/Kuala_Lumpur" });

/** "Hardware supply or installation." → "hardware supply or installation", to sit inside a sentence. */
const lower = (text: string) => {
  const trimmed = text.trim().replace(/[.;:!]+$/, "");
  return /^[A-Z][a-z]/.test(trimmed) ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed;
};
const first = (name: string) => name.split(/\s+/)[0];

export function exampleNotes(context: ExampleContext): Record<MeetingExample, string> {
  const days = (n: number) => new Date(context.today.getTime() + n * 86400000);
  const demoDay = days(8);
  const nextMonth = MONTH.format(new Date(context.today.getFullYear(), context.today.getMonth() + 1, 1));
  const who = context.contact ? `${context.contact.name}${context.contact.role ? ` (${context.contact.role})` : ""}` : `their operations lead`;
  const them = context.contact ? first(context.contact.name) : "their lead";
  const Them = them[0].toUpperCase() + them.slice(1);
  const main = context.offerings[0] ?? "the proposal";
  const demo = context.demo ?? { offering: main, feature: main };
  const outside = context.outside?.need ?? "hardware for the new sites";
  const partner = context.outside?.partner;
  const extra = context.extra;

  const tidy = [
    `Meeting with ${context.prospect}, ${DAY.format(context.today)}`,
    `Attendees: ${who}, their finance manager, their IT lead; ${context.presenter} for us.`,
    "",
    "Discussed",
    `- Walked through the proposal. ${Them} liked ${main} and said it matches what the board asked for.`,
    `- IT lead wants to see ${demo.feature} working before they commit. Asked for a live demo on ${DAY.format(demoDay)}.`,
    `- They asked whether we can also handle ${lower(outside)}.${partner ? ` We don't do this ourselves; ${partner} could.` : " We don't do this ourselves."}`,
    ...(extra ? [`- Finance asked if we also offer ${lower(extra)}. Interested for next year.`] : []),
    "",
    "Concerns",
    "- Finance wants a 10% discount if they sign this quarter, and 60-day payment terms instead of 30.",
    "- IT asked where their data will be stored and who can access it.",
    "",
    "Next",
    `- They go to formal tender in ${nextMonth}. We must answer in their tender template.`,
    `- ${Them} will send the list of sites and current headcount by Friday.`,
    `- Decision by the board at the end of ${nextMonth}.`,
  ].join("\n");

  const shorthand = [
    `mtg ${context.prospect} ${SHORT.format(context.today)} - ${who} + finance + IT`,
    `- went thru proposal, ${them} happy w ${main}`,
    `- IT wants live demo of ${demo.feature} b4 they commit -> ${SHORT.format(demoDay)}??`,
    `- asked if we can also handle ${lower(outside)}${partner ? ` - not us. ask ${partner}?` : " - not us"}`,
    "- finance: 10% disc if signed this qtr + 60d payment terms (std is 30d). need mgmt ok",
    "- IT q: data residency / who has access. check w our tech lead",
    ...(extra ? [`- also asked abt ${lower(extra)} for next yr`] : []),
    `- formal tender in ${nextMonth.toLowerCase()}, their template`,
    `- ${them.toLowerCase()} to send site list + headcount by fri`,
    `- board decides end ${nextMonth.toLowerCase()}`,
  ].join("\n");

  const voice = [
    `Okay, quick voice note after the ${context.prospect} meeting. ${who} was there with their finance manager and the IT lead.`,
    `Overall it went well, ${them} likes ${main} and says it lines up with what the board wants. The IT lead wants to see ${demo.feature} live before anything is signed, so we pencilled in a demo for ${DAY.format(demoDay)}.`,
    `They also asked whether we could handle ${lower(outside)}, which we don't do${partner ? `, so I said I'd check with ${partner}` : ""}.`,
    `Finance pushed for a 10% discount if they sign this quarter, and 60-day payment terms, so that needs approval from management.`,
    `IT also asked about data residency and who can access their data, I need to check that with our tech lead.${extra ? ` Oh, and finance asked whether we do ${lower(extra)}, maybe for next year.` : ""}`,
    `Important: they're going to formal tender in ${nextMonth}, and we have to answer in their template. ${Them} will send the site list and headcount by Friday, and the board decides at the end of ${nextMonth}.`,
  ].join(" ");

  return { tidy, shorthand, voice };
}

export const EXAMPLE_LABEL: Record<MeetingExample, string> = { tidy: "tidy notes", shorthand: "quick shorthand", voice: "voice memo" };
