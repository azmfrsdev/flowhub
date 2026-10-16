import { z } from "zod";

/**
 * Shared building blocks for the offering graph (ADR-0001) and the
 * offering-centred additions (ADR-0009). Zod is the single source of truth:
 * the JSON Schema in docs/schema/ is generated from these definitions.
 */

export const Id = z.string().min(1).max(128);
export type Id = z.infer<typeof Id>;

/** ISO 8601 timestamp, stored as a string so the exchange format stays plain JSON. */
export const IsoDate = z.iso.datetime({ offset: true });

/** Where a fact came from: a page, slide or range in an uploaded document, or a message. */
export const SourceRef = z.object({
  documentId: Id.optional(),
  versionId: Id.optional(),
  proposalId: Id.optional(),
  locator: z
    .object({
      page: z.number().int().positive().optional(),
      slide: z.number().int().positive().optional(),
      sheet: z.string().optional(),
      range: z.string().optional(),
    })
    .default({}),
  /** At most about 300 characters. Shown in source chips and used by the Reviewer. */
  quote: z.string().max(400).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** How an entity arrived, which drives the who-did-what markers (ADR-0009 D4). */
export const Provenance = z.object({
  via: z.enum(["manual", "document", "message", "import"]),
  proposalId: Id.optional(),
  confirmedBy: z.string().optional(),
  confirmedAt: IsoDate.optional(),
});
export type Provenance = z.infer<typeof Provenance>;

/** Common fields on every offering-graph entity (ADR-0001 envelope). */
export const Envelope = z.object({
  id: Id,
  workspaceId: Id,
  /** +1 on every write. Citations pin { type, id, rev }. */
  rev: z.number().int().nonnegative(),
  provenance: Provenance,
  sources: z.array(SourceRef).default([]),
  restricted: z.boolean().default(false),
  deletedAt: IsoDate.nullable().default(null),
  deleteBatchId: z.string().nullable().default(null),
  createdAt: IsoDate,
  updatedAt: IsoDate,
  updatedBy: z.string(),
});
export type Envelope = z.infer<typeof Envelope>;

/** A reference to a graph entity at a revision, used in citations and fit maps. */
export const GraphRef = z.object({
  type: z.enum(["offering", "feature", "proof", "constraint", "partner", "rateCard", "feeSchedule", "note"]),
  id: Id,
  rev: z.number().int().nonnegative(),
});
export type GraphRef = z.infer<typeof GraphRef>;

/** Who produced a block or an event: AI, code, or a person (ADR-0009 D4). */
export const Actor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ai"), step: z.string() }),
  z.object({ kind: z.literal("calc"), step: z.string() }),
  z.object({ kind: z.literal("person"), uid: z.string(), name: z.string() }),
]);
export type Actor = z.infer<typeof Actor>;
