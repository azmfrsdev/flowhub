import { leaks } from "@/lib/deal-room/deck";
import { pricingGroups } from "@/lib/deal-room/pricing-groups";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { moneyMatches, moneyTokens } from "@/lib/pricing/money";
import type { DeckItem, FitOutput, PitchPrep, PracticeAttempt, PracticeSample } from "@/lib/schema";

/**
 * Pitch prep (PRD 7.24, ADR-0016 D3): code's side. The model restates the
 * proposal's claims and points at research; code checks every reference,
 * keeps amounts and private results out, and builds the numbers and the
 * gaps they'll probe from the deal itself. In practice, code checks every
 * amount the person says against the approved prices.
 */

export const PREP_LIMITS = { opener: 200, point: 160, question: 160, why: 180, answer: 420, watch: 160, likely: 8, ask: 6, points: 3, probes: 4 } as const;

export type PrepDraft = {
  opener: { text: string; refs: string[] };
  points: { text: string; refs: string[] }[];
  likely: { question: string; why: string; answer: string; refs: string[]; watch: string }[];
  ask: { question: string; why: string; ref: string }[];
};

const clamp = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

/** Each research claim, brief question and fit gap as b1, q1, g1 for the model, with the text code shows beside a question. */
export function askEvidence(brief: { claims: { id: string; text: string; removed?: boolean }[]; questions: { id: string; text: string }[] } | null, fit: Pick<FitOutput, "gaps">) {
  const map = new Map<string, { basis: "research" | "brief" | "gap"; text: string }>();
  (brief?.claims ?? []).filter((claim) => !claim.removed).slice(0, 40).forEach((claim, index) => map.set(`b${index + 1}`, { basis: "research", text: claim.text }));
  (brief?.questions ?? []).slice(0, 10).forEach((question, index) => map.set(`q${index + 1}`, { basis: "brief", text: question.text }));
  fit.gaps.slice(0, 20).forEach((gap, index) => map.set(`g${index + 1}`, { basis: "gap", text: gap.text }));
  return map;
}

/**
 * Code's last word on the draft. An item that names no proposal claim (or,
 * for a question to ask, no research claim, brief question or gap) is
 * dropped, and so is one with an amount, a price placeholder or a private
 * result's name. Prices live on the numbers card, copied by code.
 */
export function checkPrepDraft(
  draft: PrepDraft,
  evidence: Map<string, { id: string }>,
  askRefs: Map<string, { basis: "research" | "brief" | "gap"; text: string }>,
  nonPublic: string[],
): Pick<PitchPrep, "opener" | "points" | "likely" | "ask" | "dropped"> {
  let dropped = 0;
  const bad = (text: string) => moneyTokens(text).length > 0 || leaks(text, nonPublic);
  const claimIds = (refs: string[]) => [...new Set(refs.map((ref) => evidence.get(ref.trim())?.id).filter((id): id is string => Boolean(id)))];
  const item = (text: string, refs: string[], max: number): DeckItem | null => {
    const ids = claimIds(refs);
    if (!text.trim() || ids.length === 0 || bad(text)) {
      dropped += 1;
      return null;
    }
    return { text: clamp(text, max), claimIds: ids };
  };

  const opener = item(draft.opener.text, draft.opener.refs, PREP_LIMITS.opener);
  const points = draft.points.flatMap((point) => item(point.text, point.refs, PREP_LIMITS.point) ?? []).slice(0, PREP_LIMITS.points);
  const likely: PitchPrep["likely"] = [];
  for (const entry of draft.likely) {
    const ids = claimIds(entry.refs);
    if (likely.length >= PREP_LIMITS.likely || !entry.question.trim() || !entry.answer.trim() || ids.length === 0 || bad(entry.answer) || bad(entry.question)) {
      dropped += 1;
      continue;
    }
    const watch = entry.watch.trim() && !bad(entry.watch) ? clamp(entry.watch, PREP_LIMITS.watch) : undefined;
    likely.push({ id: `l${likely.length + 1}`, question: clamp(entry.question, PREP_LIMITS.question), why: clamp(entry.why, PREP_LIMITS.why), answer: clamp(entry.answer, PREP_LIMITS.answer), claimIds: ids, ...(watch ? { watch } : {}) });
  }
  const ask: PitchPrep["ask"] = [];
  for (const entry of draft.ask) {
    const basis = askRefs.get(entry.ref.trim());
    if (ask.length >= PREP_LIMITS.ask || !entry.question.trim() || !basis || bad(entry.question)) {
      dropped += 1;
      continue;
    }
    ask.push({ id: `a${ask.length + 1}`, question: clamp(entry.question, PREP_LIMITS.question), why: clamp(entry.why, PREP_LIMITS.why), basis: basis.basis, basisText: clamp(basis.text, 200) });
  }
  return { opener, points, likely, ask, dropped };
}

/** FR-PREP-1: the numbers to know, from the approved pricing (copied by code) and the fit map. */
export function prepNumbers(fit: Pick<FitOutput, "gaps" | "mappings" | "cannotMeet" | "pricing">): PitchPrep["numbers"] {
  const outside = new Set(fit.cannotMeet.map((item) => item.gapId));
  const mapped = new Set(fit.mappings.map((mapping) => mapping.gapId));
  const met = fit.gaps.filter((gap) => !outside.has(gap.id) && mapped.has(gap.id)).length;
  const numbers: PitchPrep["numbers"] = pricingGroups(fit.pricing.lines).map((group) => {
    // One priced line has no subtotal: its own price text is the number.
    const single = group.lines.length === 1 && !group.lines[0].unpriced ? (group.lines[0].total ?? group.lines[0].valueText) : null;
    const value = group.subtotal ?? single;
    return { label: group.title, value: value ?? `${group.lines.length} ${group.lines.length === 1 ? "line" : "lines"}, see the proposal`, money: Boolean(value) };
  });
  numbers.push({ label: "Needs we meet", value: `${met} of ${fit.gaps.length}`, money: false });
  if (outside.size) numbers.push({ label: "Outside what we offer", value: String(outside.size), money: false });
  return numbers;
}

/** FR-PREP-1: the gaps they're likely to probe, with what the hub records, from Cannot meet and the partial matches. */
export function prepProbes(fit: Pick<FitOutput, "gaps" | "mappings" | "cannotMeet">, graph: Pick<WorkspaceGraph, "offerings" | "partners" | "constraints">): PitchPrep["probes"] {
  const gapText = (id: string) => fit.gaps.find((gap) => gap.id === id)?.text ?? "";
  const outside = fit.cannotMeet.flatMap((item) => {
    const need = gapText(item.gapId);
    if (!need) return [];
    const partner = item.partner ? graph.partners.find((candidate) => candidate.id === item.partner!.id)?.name : undefined;
    const rule = graph.constraints.find((candidate) => candidate.id === item.constraint.id);
    const answer = partner ? `Outside what we offer. ${partner} covers it, and we can bring them in.` : item.sellingRule ? `Outside our selling rules: ${rule?.statement ?? "check before the meeting"}.` : `Outside what we offer${rule?.insteadText ? `. Instead: ${rule.insteadText}` : rule ? `: ${rule.statement}` : "."}`;
    return [{ need: clamp(need, 160), kind: "outside" as const, answer: clamp(answer, 220) }];
  });
  const offeringName = (type: string, id: string) =>
    type === "offering" ? graph.offerings.find((offering) => offering.id === id)?.name : graph.offerings.find((offering) => offering.features.some((feature) => feature.id === id))?.name;
  const partial = fit.mappings
    .filter((mapping) => mapping.strength !== "strong" && !fit.mappings.some((other) => other.gapId === mapping.gapId && other.strength === "strong"))
    .flatMap((mapping) => {
      const need = gapText(mapping.gapId);
      const name = offeringName(mapping.target.type, mapping.target.id);
      if (!need || !name) return [];
      return [{ need: clamp(need, 160), kind: "partial" as const, answer: clamp(`Partly met by ${name}${mapping.customisation ? `: ${mapping.customisation}` : "."}`, 220) }];
    });
  const seen = new Set<string>();
  return [...outside, ...partial].filter((probe) => !seen.has(probe.need) && seen.add(probe.need)).slice(0, PREP_LIMITS.probes);
}

/** The approved price texts, and their amounts, a practice answer is checked against (invariant 1). */
export function approvedPrices(fit: Pick<FitOutput, "pricing">): { texts: string[]; amounts: Set<string> } {
  const groups = pricingGroups(fit.pricing.lines);
  const texts = [
    ...fit.pricing.lines.filter((line) => !line.unpriced).map((line) => `${line.label}: ${line.total ? `${line.valueText} (${line.total})` : line.valueText}`),
    ...groups.flatMap((group) => (group.subtotal ? [`${group.title}: ${group.subtotal}`] : [])),
  ];
  return { texts, amounts: new Set(texts.flatMap((text) => moneyTokens(text))) };
}

/** FR-PREP-4: amounts in the person's answer that aren't approved prices. A flagged amount caps the mark at 6. */
export function checkPracticeAmounts(answer: string, approved: { texts: string[]; amounts: Set<string> }): PracticeAttempt["amountFlags"] {
  const seen = new Set<string>();
  return moneyMatches(answer)
    .filter((match) => !approved.amounts.has(match.key) && !seen.has(match.key) && seen.add(match.key))
    .map((match) => ({ raw: match.raw.replace(/[,.]+$/, ""), approved: approved.texts.slice(0, 6) }));
}

export const PRACTICE_CAP = 6;

/** "Hardware supply or installation." → "hardware supply or installation", to sit inside a sentence. */
const inSentence = (text: string) => {
  const trimmed = text.trim().replace(/[.;:!]+$/, "");
  return /^[A-Z][a-z]/.test(trimmed) ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed;
};

/**
 * FR-PREP-4, ADR-0016 D5: two sample answers for people trying practice
 * without one in mind, built by code from the prep, with no AI run. The
 * strong one is the suggested answer. The weak one is vague, promises a need
 * outside what the seller offers, and states an amount that isn't an approved
 * price, so the code check and the mark both show what they catch.
 */
export function sampleAnswers(prep: Pick<PitchPrep, "numbers" | "probes">, question: Pick<PitchPrep["likely"][number], "answer">): Record<PracticeSample, string> {
  const approved = new Set(prep.numbers.flatMap((number) => moneyTokens(number.value)));
  const first = prep.numbers.filter((number) => number.money).flatMap((number) => moneyMatches(number.value))[0];
  let wrong: string | null = null;
  if (first) {
    const amount = Number(first.key.replace(/^\D+/, ""));
    const prefix = /^[A-Za-z$]+/.exec(first.raw)?.[0] ?? "RM";
    let value = amount >= 5000 ? Math.round((amount * 0.8) / 1000) * 1000 : Math.round(amount * 0.8);
    if (value === amount || approved.has(first.key.replace(/\d+$/, String(value)))) value = Math.max(1, amount - (amount >= 5000 ? 3000 : 100));
    wrong = `${prefix} ${value.toLocaleString("en-US")}`;
  }
  const outside = prep.probes.find((probe) => probe.kind === "outside")?.need;
  const weak = [
    "Honestly, don't worry about that. We've done this many times and it always works out.",
    outside ? `And yes, we'll handle this part for you too: ${inSentence(outside)}.` : "We can handle anything else you need as well.",
    wrong ? `The whole thing comes to about ${wrong}, and we can start next week.` : "And we can start next week.",
  ].join(" ");
  return { strong: question.answer, weak };
}
