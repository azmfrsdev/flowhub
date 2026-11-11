import { z } from "zod";
import { Id, IsoDate } from "./common";
import { DeckItem } from "./deck";

/**
 * Rehearsal (PRD 7.26, ADR-0017): `opportunities/{id}/rehearsals/{rehearsalId}`.
 * The salesperson talks with the buyer, played by Gemini, by voice through the
 * relay or by typing; then the Coach marks it and code checks every amount
 * they said. Server-written only (invariant 10). Internal: not part of the R12
 * exchange format.
 */

export const RehearsalPush = z.enum(["price", "fit", "timing"]);
export type RehearsalPush = z.infer<typeof RehearsalPush>;
export const RehearsalMood = z.enum(["busy", "sceptical", "friendly"]);
export type RehearsalMood = z.infer<typeof RehearsalMood>;
export const RehearsalMode = z.enum(["voice", "text"]);
export type RehearsalMode = z.infer<typeof RehearsalMode>;

/**
 * - `ready`: created, waiting for the voice relay to connect (voice only).
 * - `live`: the conversation is going.
 * - `ended`: the call is over, coaching not written yet.
 * - `coached`: coaching written.
 * - `failed`: the call couldn't start or broke; `error` says why.
 */
export const RehearsalStatus = z.enum(["ready", "live", "ended", "coached", "failed"]);
export type RehearsalStatus = z.infer<typeof RehearsalStatus>;

export const RehearsalTurn = z.object({
  who: z.enum(["buyer", "seller"]),
  text: z.string().max(4000),
  /** Seconds from the start of the call. */
  at: z.number().nonnegative(),
});
export type RehearsalTurn = z.infer<typeof RehearsalTurn>;

export const RehearsalCoaching = z.object({
  /** After code's amount check: a wrong amount caps it at 6. */
  mark: z.number().int().min(0).max(10),
  modelMark: z.number().int().min(0).max(10),
  landed: z.array(z.string()),
  fix: z.array(DeckItem),
  /** The buyer's questions the salesperson wasn't ready for, in the buyer's words. */
  unready: z.array(z.string()),
  tip: z.string(),
  /** Amounts the salesperson said that aren't approved prices, with the turn they were said in. */
  amountFlags: z.array(z.object({ raw: z.string(), turn: z.number().int().nonnegative(), at: z.number().nonnegative(), approved: z.array(z.string()) })),
  /** Coaching items code dropped: an amount, or a private result. */
  dropped: z.number().int().nonnegative(),
  createdAt: IsoDate,
});
export type RehearsalCoaching = z.infer<typeof RehearsalCoaching>;

export const Rehearsal = z.object({
  id: Id,
  writeRunId: Id,
  /** The working copy's rev it was set up from (FR-REH-6). */
  rev: z.number().int().nonnegative(),
  mode: RehearsalMode,
  status: RehearsalStatus,
  buyer: z.object({ name: z.string(), role: z.string() }),
  pushOn: z.array(RehearsalPush),
  mood: RehearsalMood,
  turns: z.array(RehearsalTurn),
  startedAt: IsoDate,
  endedAt: IsoDate.nullable().default(null),
  /** Why the call ended: the person, the time cap, the turn cap, or a dropped connection. */
  endReason: z.enum(["person", "time", "turns", "dropped"]).nullable().default(null),
  coaching: RehearsalCoaching.nullable().default(null),
  error: z.string().nullable().default(null),
  createdBy: z.string(),
  createdByUid: z.string(),
});
export type Rehearsal = z.infer<typeof Rehearsal>;
