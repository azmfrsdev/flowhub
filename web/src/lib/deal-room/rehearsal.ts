import { clamp, leaks } from "@/lib/deal-room/deck";
import { moneyMatches } from "@/lib/pricing/money";
import type { PitchPrep, Rehearsal, RehearsalCoaching, RehearsalMood, RehearsalNotes, RehearsalPush, RehearsalTurn } from "@/lib/schema";

/**
 * Rehearsal (PRD 7.26, ADR-0017): code's side. Code writes the buyer's brief
 * from the approved proposal only, checks every amount the salesperson said
 * against the approved prices, and checks the Coach's items. Pure functions,
 * shared by the main app (text mode, coaching) and the voice relay.
 */

export const REHEARSAL_LIMITS = {
  /** FR-REH-3, FR-REH-4: a rehearsal is capped at 10 minutes. */
  seconds: 600,
  /** FR-REH-4: and at 24 turns from the salesperson in text mode. */
  sellerTurns: 24,
  turnChars: 1200,
  landed: 3,
  fix: 3,
  unready: 3,
  item: 160,
  /** The relay refuses a voice rehearsal that wasn't connected within this time. */
  connectWithinMs: 120_000,
} as const;

/** FR-REH-5: as in practice, a flagged amount caps the mark at 6. */
export const REHEARSAL_CAP = 6;

const PUSH_TEXT: Record<RehearsalPush, string> = {
  price: "Price: question the investment, compare it with a cheaper option, ask what is really included, ask about paying in phases.",
  fit: "Fit: probe the needs the seller can't meet, ask who covers them and who is accountable, test whether the proposal really fits your situation.",
  timing: "Timing: press on how long things take, what could slip, and whether it can be done before your own deadlines.",
};

const MOOD_TEXT: Record<RehearsalMood, string> = {
  busy: "You are short of time and want the point quickly. Interrupt long answers.",
  sceptical: "You are polite but sceptical. You have heard sales pitches before and you want evidence.",
  friendly: "You are open and warm, but you still need good answers before you commit.",
};

export type BuyerInputs = {
  seller: string;
  presenter: string;
  prospect: string;
  buyer: { name: string; role: string };
  pushOn: RehearsalPush[];
  mood: RehearsalMood;
  /** The proposal's live claims, with no amounts (follow-up evidence). */
  claims: string[];
  /** The approved price texts (sell prices only). */
  prices: string[];
  /** Needs the seller can't meet or only partly meets, with what the hub records instead (prep probes). */
  probes: Pick<PitchPrep["probes"][number], "need" | "kind" | "answer">[];
  /** Questions the research left open. */
  openQuestions: string[];
};

/**
 * FR-REH-2: what the buyer knows, as sections for the buyer's instruction.
 * Built only from what the caller passes, which the loaders take from the
 * approved proposal: never cost, buy prices, partner contacts or private
 * results (invariants 2 and 5).
 */
export function buyerKnowledge(inputs: BuyerInputs): string {
  const list = (items: string[], empty: string) => (items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`);
  const push = inputs.pushOn.length ? inputs.pushOn.map((key) => `- ${PUSH_TEXT[key]}`).join("\n") : "- Nothing in particular. Ask what a careful buyer would ask.";
  return [
    `<you>\nYou are ${inputs.buyer.name}, ${inputs.buyer.role} at ${inputs.prospect}. ${MOOD_TEXT[inputs.mood]}\n</you>`,
    `<push_on>\n${push}\n</push_on>`,
    `<proposal_says>\n${list(inputs.claims, "(the proposal makes no specific claims)")}\n</proposal_says>`,
    `<approved_prices>\n${list(inputs.prices, "(the proposal has no priced lines)")}\n</approved_prices>`,
    `<gaps>\n${list(
      inputs.probes.map((probe) => `${probe.need} (${probe.kind === "outside" ? "the seller can't do this" : "only partly covered"}). What the seller would offer instead: ${probe.answer}`),
      "(none recorded)",
    )}\n</gaps>`,
    `<open_questions>\n${list(inputs.openQuestions, "(none)")}\n</open_questions>`,
  ].join("\n\n");
}

export function buyerOf(contact: { name: string; role?: string } | undefined): Rehearsal["buyer"] {
  const name = contact?.name?.trim();
  return name ? { name, role: contact?.role?.trim() || "the decision-maker" } : { name: "The decision-maker", role: "the person who signs off" };
}

/** The text of every turn so far, for the model, oldest first. */
export function transcriptText(turns: Pick<RehearsalTurn, "who" | "text">[], buyerName: string): string {
  return turns.map((turn) => `${turn.who === "buyer" ? buyerName : "Seller"}: ${turn.text}`).join("\n");
}

/** FR-REH-5: every amount the salesperson said that isn't an approved price, with the turn it was said in. */
export function checkTranscriptAmounts(turns: RehearsalTurn[], approved: { texts: string[]; amounts: Set<string> }): RehearsalCoaching["amountFlags"] {
  const seen = new Set<string>();
  const flags: RehearsalCoaching["amountFlags"] = [];
  turns.forEach((turn, index) => {
    if (turn.who !== "seller") return;
    for (const match of moneyMatches(turn.text)) {
      if (approved.amounts.has(match.key) || seen.has(match.key)) continue;
      seen.add(match.key);
      flags.push({ raw: match.raw.replace(/[,.]+$/, ""), turn: index, at: turn.at, approved: approved.texts.slice(0, 6) });
    }
  });
  return flags;
}

export type CoachDraft = {
  mark: number;
  landed: string[];
  fix: { text: string; refs: string[] }[];
  unready: string[];
  tip: string;
};

/**
 * FR-REH-5: code's checks on the Coach's draft. An item that states an amount
 * or names a private result is dropped and counted; references are resolved
 * to claim IDs; a flagged amount caps the mark.
 */
export function checkCoaching(draft: CoachDraft, evidence: Map<string, { id: string; text: string }>, nonPublic: string[], amountFlags: RehearsalCoaching["amountFlags"]) {
  let dropped = 0;
  const keep = (text: string) => {
    // Claim references belong in `refs`; the model sometimes writes them into the text too, as "(k9, k10)".
    const clean = text
      .replace(/\s*\(\s*k\d+(?:\s*[,;&]\s*(?:and\s+)?k\d+)*\s*\)/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return null;
    if (leaks(clean, nonPublic)) {
      dropped += 1;
      return null;
    }
    return clamp(clean, REHEARSAL_LIMITS.item);
  };
  const landed = draft.landed.map(keep).filter((text): text is string => Boolean(text)).slice(0, REHEARSAL_LIMITS.landed);
  const fix = draft.fix
    .map((item) => {
      const text = keep(item.text);
      return text ? { text, claimIds: [...new Set(item.refs.map((ref) => evidence.get(ref.trim())?.id).filter((id): id is string => Boolean(id)))] } : null;
    })
    .filter((item): item is { text: string; claimIds: string[] } => Boolean(item))
    .slice(0, REHEARSAL_LIMITS.fix);
  const unready = draft.unready.map(keep).filter((text): text is string => Boolean(text)).slice(0, REHEARSAL_LIMITS.unready);
  const tip = keep(draft.tip) ?? "";
  const modelMark = Math.max(0, Math.min(10, Math.round(draft.mark)));
  const mark = amountFlags.length ? Math.min(modelMark, REHEARSAL_CAP) : modelMark;
  return { mark, modelMark, landed, fix, unready, tip, amountFlags, dropped };
}

/**
 * FR-REH-7: the notes at hand, from what code already built for the deal: the
 * pitch prep's opener and points (when written), the numbers to know and the
 * gaps they'll probe, plus the person's own notes.
 */
export function rehearsalNotes(
  prep: Pick<PitchPrep, "opener" | "points"> | null,
  numbers: RehearsalNotes["numbers"],
  probes: RehearsalNotes["probes"],
  own: string,
): RehearsalNotes {
  return {
    opener: prep?.opener?.text ?? null,
    points: (prep?.points ?? []).map((point) => point.text).slice(0, 3),
    numbers: numbers.slice(0, 8),
    probes: probes.slice(0, 4),
    own: own.trim().slice(0, 2000),
  };
}

/** FR-REH-4: whether the salesperson has used up the text rehearsal. */
export function rehearsalOver(rehearsal: Pick<Rehearsal, "turns" | "startedAt">, now = Date.now()): "time" | "turns" | null {
  if ((now - Date.parse(rehearsal.startedAt)) / 1000 >= REHEARSAL_LIMITS.seconds) return "time";
  if (rehearsal.turns.filter((turn) => turn.who === "seller").length >= REHEARSAL_LIMITS.sellerTurns) return "turns";
  return null;
}
