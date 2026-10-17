import { z } from "zod";
import { Id, IsoDate } from "./common";

/**
 * After the meeting (PRD 7.25, ADR-0016 D4): `opportunities/{id}/meetings/{meetingId}`.
 * The pasted notes, what they said (each point quoting the notes word for
 * word), and next steps checked against the hub. Internal: not part of the
 * R12 exchange format.
 */

export const MEETING_STEP_KINDS = ["client", "supplier", "internal", "demo", "tender", "approval", "proposal"] as const;
export const MeetingStepKind = z.enum(MEETING_STEP_KINDS);
export type MeetingStepKind = z.infer<typeof MeetingStepKind>;

export const MEETING_POINT_KINDS = ["ask", "concern", "decision", "commitment", "date", "budget"] as const;

/** Three example styles code builds from the deal (FR-MEET-1). */
export const MEETING_EXAMPLES = ["tidy", "shorthand", "voice"] as const;
export const MeetingExample = z.enum(MEETING_EXAMPLES);
export type MeetingExample = z.infer<typeof MeetingExample>;

export const MeetingPoint = z.object({ id: Id, kind: z.enum(MEETING_POINT_KINDS), text: z.string(), quote: z.string() });
export type MeetingPoint = z.infer<typeof MeetingPoint>;

/** A confirmed hub entity a step relies on, resolved by code (FR-MEET-3). */
export const MeetingRef = z.object({ kind: z.enum(["offering", "partner", "rule", "scope"]), id: Id, name: z.string() });
export type MeetingRef = z.infer<typeof MeetingRef>;

export const MeetingStep = z.object({
  id: Id,
  kind: MeetingStepKind,
  title: z.string(),
  detail: z.string(),
  due: z.string().optional(),
  owner: z.string().optional(),
  pointIds: z.array(Id).min(1),
  refs: z.array(MeetingRef),
  /** A supplier step with no partner in the hub that covers the ask. */
  noPartner: z.boolean().optional(),
  /** FR-MEET-4: a short email for client and supplier steps. Code set the recipient. */
  email: z.object({ to: z.string().optional(), toName: z.string().optional(), subject: z.string(), body: z.string() }).nullable().default(null),
  done: z.object({ at: IsoDate, by: z.string() }).nullable().default(null),
});
export type MeetingStep = z.infer<typeof MeetingStep>;

export const Meeting = z.object({
  id: Id,
  /** yyyy-mm-dd, as the person gave it. */
  heldOn: z.string(),
  notes: z.string().max(20000),
  /** Set when the notes came from "Try an example". */
  example: MeetingExample.nullable().default(null),
  summary: z.string(),
  points: z.array(MeetingPoint),
  steps: z.array(MeetingStep),
  /** What code dropped: points whose quote isn't in the notes, steps with no point, email sentences with an unknown amount. */
  dropped: z.object({ points: z.number().int().nonnegative(), steps: z.number().int().nonnegative(), sentences: z.number().int().nonnegative() }),
  writeRunId: Id.nullable().default(null),
  createdAt: IsoDate,
  createdBy: z.string(),
});
export type Meeting = z.infer<typeof Meeting>;
