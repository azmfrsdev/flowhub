import type { graphOutline } from "@/lib/deal-room/fit";
import { moneyTokens } from "@/lib/pricing/money";
import { MEETING_POINT_KINDS, MEETING_STEP_KINDS, type Meeting, type MeetingRef, type MeetingStep } from "@/lib/schema";

/**
 * After the meeting (PRD 7.25, ADR-0016 D4): code's side of turning pasted
 * notes into next steps. Every point must quote the notes; every step must
 * come from a point; every hub reference must be a confirmed entity; an
 * amount in an email must be in the notes or the approved pricing.
 */

export const MEETING_LIMITS = { notes: 20000, points: 12, steps: 10, title: 90, detail: 280, due: 40, owner: 40, subject: 120, body: 1500, summary: 400 } as const;

export type MeetingDraft = {
  summary: string;
  points: { ref: string; kind: string; text: string; quote: string }[];
  steps: { kind: string; title: string; detail: string; due: string; owner: string; points: string[]; refs: string[]; emailSubject: string; emailBody: string }[];
};

/** A hub entity the model may cite by its short reference, with what code adds to a supplier email. */
export type CatalogueEntry = MeetingRef & { line: string; contact?: { name: string; email?: string } };

/**
 * The confirmed hub entities the planner reads, each with a short reference.
 * Built from the Fit Analyst's projection, so no price, cost or contact
 * detail reaches the model (invariant 2); code keeps the contacts aside.
 */
export function meetingCatalogue(outline: ReturnType<typeof graphOutline>, inProposal: Set<string>, contacts: Map<string, { name: string; email?: string }>): Map<string, CatalogueEntry> {
  const entries = new Map<string, CatalogueEntry>();
  const partnerRef = new Map<string, string>();
  outline.partners.forEach((partner, index) => {
    const ref = `pa${index + 1}`;
    partnerRef.set(partner.id, ref);
    const contact = contacts.get(partner.id);
    entries.set(ref, { kind: "partner", id: partner.id, name: partner.name, line: `${partner.name} (${partner.relationship}). Covers: ${partner.covers.join("; ") || "not recorded"}`, ...(contact ? { contact } : {}) });
  });
  let scope = 0;
  outline.offerings.forEach((offering, index) => {
    const features = offering.features.map((feature) => feature.name).slice(0, 8).join("; ");
    entries.set(`o${index + 1}`, {
      kind: "offering",
      id: offering.id,
      name: offering.name,
      line: `${offering.name}${inProposal.has(offering.id) ? " [in the proposal]" : ""}. ${offering.summary ?? ""}${features ? ` Features: ${features}.` : ""}`.trim(),
    });
    for (const rule of offering.notIncluded) {
      scope += 1;
      const partner = rule.partnerId ? partnerRef.get(rule.partnerId) : undefined;
      entries.set(`s${scope}`, { kind: "scope", id: rule.constraintId, name: rule.statement, line: `Not included in ${offering.name}: ${rule.statement}${partner ? ` (partner: ${partner})` : ""}` });
    }
  });
  outline.sellingRules.forEach((rule, index) => entries.set(`r${index + 1}`, { kind: "rule", id: rule.id, name: rule.statement, line: `Selling rule: ${rule.statement}` }));
  return entries;
}

/** Lower case, letters and digits only, single spaces: quotes match the notes whatever the punctuation or line breaks. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

/** FR-MEET-2: a point's quote must appear in the notes (the word-for-word rule of invariant 6). */
export function quoteFound(notes: string, quote: string): boolean {
  const wanted = normalise(quote);
  return wanted.length >= 6 && normalise(notes).includes(wanted);
}

/** Amounts an email may state: those in the notes and in the approved pricing (invariant 1). */
export function allowedAmounts(texts: string[]): Set<string> {
  return new Set(texts.flatMap((text) => moneyTokens(text)));
}

const COMMERCIAL = /discount|payment terms?|terms|price|pricing|rate|credit|waive|free|instal?lment|\d+\s?%|\brm\s?\d|budget|cheaper|reduc/i;
const clamp = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

/** Removes sentences with an amount that isn't allowed, keeping paragraphs. Returns the body and how many sentences went. */
export function checkEmailBody(body: string, allowed: Set<string>): { body: string; removed: number } {
  let removed = 0;
  // Paragraphs, then lines ("Hi Aiman," on its own line), then sentences: only a sentence with an unknown amount goes.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) =>
          line
            .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
            .filter((sentence) => {
              const unknown = moneyTokens(sentence).some((token) => !allowed.has(token));
              if (unknown) removed += 1;
              return !unknown;
            })
            .join(" ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
  return { body: paragraphs.join("\n\n").slice(0, MEETING_LIMITS.body), removed };
}

/**
 * Code's last word on the planner's draft (FR-MEET-2 to FR-MEET-4). Points
 * whose quote isn't in the notes are dropped, steps with no kept point are
 * dropped, unknown hub references are dropped, a supplier step without a
 * partner says so, an approval step needs a rule or a commercial point, and
 * the emails lose any sentence with an amount that isn't allowed.
 */
export function checkMeetingDraft(
  draft: MeetingDraft,
  input: { notes: string; catalogue: Map<string, CatalogueEntry>; allowed: Set<string>; client?: { name: string; email?: string } },
): Pick<Meeting, "summary" | "points" | "steps" | "dropped"> {
  const dropped = { points: 0, steps: 0, sentences: 0 };
  const pointId = new Map<string, string>();
  const points: Meeting["points"] = [];
  for (const point of draft.points) {
    const kind = (MEETING_POINT_KINDS as readonly string[]).includes(point.kind) ? (point.kind as Meeting["points"][number]["kind"]) : "ask";
    if (points.length >= MEETING_LIMITS.points || !point.text.trim() || !quoteFound(input.notes, point.quote)) {
      dropped.points += 1;
      continue;
    }
    const id = `p${points.length + 1}`;
    pointId.set(point.ref.trim(), id);
    points.push({ id, kind, text: clamp(point.text, 200), quote: clamp(point.quote, 300) });
  }

  const steps: MeetingStep[] = [];
  for (const step of draft.steps) {
    const pointIds = [...new Set(step.points.map((ref) => pointId.get(ref.trim())).filter((id): id is string => Boolean(id)))];
    let kind = (MEETING_STEP_KINDS as readonly string[]).includes(step.kind) ? (step.kind as MeetingStep["kind"]) : "internal";
    if (pointIds.length === 0 || !step.title.trim() || steps.length >= MEETING_LIMITS.steps) {
      dropped.steps += 1;
      continue;
    }
    const entries = [...new Set(step.refs.map((ref) => ref.trim()))].flatMap((ref) => {
      const entry = input.catalogue.get(ref);
      return entry ? [entry] : [];
    });
    const refs = entries.map(({ kind: refKind, id, name }) => ({ kind: refKind, id, name: clamp(name, 120) }));
    const cited = points.filter((point) => pointIds.includes(point.id));
    if (kind === "approval" && !refs.some((ref) => ref.kind === "rule" || ref.kind === "scope") && !cited.some((point) => COMMERCIAL.test(`${point.text} ${point.quote}`))) kind = "internal";
    const partner = entries.find((entry) => entry.kind === "partner");
    const noPartner = kind === "supplier" && !partner;

    let email: MeetingStep["email"] = null;
    if ((kind === "client" || kind === "supplier") && step.emailSubject.trim() && step.emailBody.trim()) {
      const checked = checkEmailBody(step.emailBody, input.allowed);
      dropped.sentences += checked.removed;
      const subjectOk = moneyTokens(step.emailSubject).every((token) => input.allowed.has(token));
      const recipient = kind === "client" ? input.client : partner?.contact;
      if (checked.body)
        email = {
          ...(recipient?.email ? { to: recipient.email } : {}),
          ...(recipient?.name ? { toName: recipient.name } : {}),
          subject: subjectOk ? clamp(step.emailSubject, MEETING_LIMITS.subject) : "Following up on our meeting",
          body: checked.body,
        };
    }

    steps.push({
      id: `s${steps.length + 1}`,
      kind,
      title: clamp(step.title, MEETING_LIMITS.title),
      detail: clamp(step.detail, MEETING_LIMITS.detail),
      ...(step.due.trim() ? { due: clamp(step.due, MEETING_LIMITS.due) } : {}),
      ...(step.owner.trim() ? { owner: clamp(step.owner, MEETING_LIMITS.owner) } : {}),
      pointIds,
      refs,
      ...(noPartner ? { noPartner: true } : {}),
      email,
      done: null,
    });
  }
  return { summary: clamp(draft.summary, MEETING_LIMITS.summary), points, steps, dropped };
}
