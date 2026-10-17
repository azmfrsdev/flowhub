import { z } from "zod";
import { Id, IsoDate } from "./common";
import { DeckItem } from "./deck";

/**
 * Pitch prep (PRD 7.24, ADR-0016 D3): `opportunities/{id}/preps/{writeRunId}`,
 * with practice answers in `attempts`. The model restates proposal claims;
 * code supplies the numbers and the gaps they'll probe. Internal: not part
 * of the R12 exchange format.
 */

export const PitchPrep = z.object({
  writeRunId: Id,
  /** The working copy's rev it was written from (FR-PREP-5). */
  rev: z.number().int().nonnegative(),
  opener: DeckItem.nullable(),
  points: z.array(DeckItem),
  /** Code-built from the approved pricing and the fit map (invariant 1). */
  numbers: z.array(z.object({ label: z.string(), value: z.string(), money: z.boolean().default(false) })),
  /** Code-built from Cannot meet and the partial matches. */
  probes: z.array(z.object({ need: z.string(), kind: z.enum(["outside", "partial"]), answer: z.string() })),
  likely: z.array(z.object({ id: Id, question: z.string(), why: z.string(), answer: z.string(), claimIds: z.array(Id), watch: z.string().optional() })),
  ask: z.array(z.object({ id: Id, question: z.string(), why: z.string(), basis: z.enum(["research", "gap", "brief"]), basisText: z.string() })),
  /** Items code dropped: no valid reference, an amount, or a private result. */
  dropped: z.number().int().nonnegative(),
  createdAt: IsoDate,
  createdBy: z.string(),
});
export type PitchPrep = z.infer<typeof PitchPrep>;

/** FR-PREP-4: the demo sample answers code offers on each question (ADR-0016 D5). */
export const PracticeSample = z.enum(["strong", "weak"]);
export type PracticeSample = z.infer<typeof PracticeSample>;

/** FR-PREP-4: one practice answer and its feedback. */
export const PracticeAttempt = z.object({
  id: Id,
  questionId: Id,
  question: z.string(),
  answer: z.string().max(3000),
  /** Set when the answer was a demo sample, sent as it was. */
  sample: PracticeSample.nullable().default(null),
  /** After code's amount check: a wrong amount caps it at 6. */
  mark: z.number().int().min(0).max(10),
  modelMark: z.number().int().min(0).max(10),
  landed: z.array(z.string()),
  add: z.array(DeckItem),
  tip: z.string(),
  /** Amounts in the answer that aren't approved prices, with the prices that are. */
  amountFlags: z.array(z.object({ raw: z.string(), approved: z.array(z.string()) })),
  createdAt: IsoDate,
  by: z.string(),
});
export type PracticeAttempt = z.infer<typeof PracticeAttempt>;
