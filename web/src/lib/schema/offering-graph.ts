import { z } from "zod";
import { Envelope, Id, IsoDate, Provenance, SourceRef } from "./common";

/**
 * The offering graph: ADR-0001 entity shapes, plus the offering-centred
 * fields from ADR-0009 D1. Cost fields are marked in comments: they must never
 * reach a model, a proposal or an artefact (invariant 2). The projections in
 * src/server/graph/projection.ts strip them.
 */

/** R7: technology as { category, value } pairs from a catalogue kept in code. */
export const TechCategory = z.enum([
  "front_end",
  "back_end",
  "database",
  "cache_messaging",
  "mobile",
  "hosting",
  "ci_cd",
  "monitoring",
  "auth_security",
  "analytics",
  "collaboration",
  "ecommerce",
  "integration_internal",
  "integration_external",
]);
export const TechPair = z.object({
  category: TechCategory,
  /** A catalogue key, or "other". */
  value: z.string(),
  /** Kept so the pair still displays if the catalogue changes. */
  label: z.string(),
});
export type TechPair = z.infer<typeof TechPair>;

export const Feature = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(["active", "planned", "retired"]).default("active"),
  sources: z.array(SourceRef).default([]),
  provenance: Provenance.optional(),
});
export type Feature = z.infer<typeof Feature>;

/** R1. A child is a sub-offering when it has its own terms, owner or client. */
export const Offering = Envelope.extend({
  parentId: Id.nullable(),
  type: z.enum(["service", "package", "product"]).default("service"),
  name: z.string().min(1),
  summary: z.string().default(""),
  description: z.string().default(""),
  status: z.enum(["active", "pilot", "retired"]).default("active"),
  owner: z.string().optional(),
  /** Overview tab: key facts. */
  facts: z
    .object({
      typicalLength: z.string().optional(),
      bestFor: z.string().optional(),
    })
    .default({}),
  /** Scope tab: What's included. Array order is display order. */
  features: z.array(Feature).default([]),
  technology: z.array(TechPair).default([]),
  partnerIds: z.array(Id).default([]),
});
export type Offering = z.infer<typeof Offering>;

/**
 * A scheduled price change (ADR-0001 amendment, PRD FR-ASK-6): from `from`
 * (YYYY-MM-DD, Malaysia time) code reads `value` instead of the current price.
 */
export const ScheduledPrice = z.object({
  value: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ScheduledPrice = z.infer<typeof ScheduledPrice>;

export const PriceCell = z.object({
  /** Free text, exactly as written: "1.5%", "RM 0.50", "Waived", "On quote". */
  value: z.string().min(1),
  isCurrent: z.boolean().optional(),
  next: ScheduledPrice.optional(),
  sources: z.array(SourceRef).default([]),
});
export type PriceCell = z.infer<typeof PriceCell>;

/** R2: grid-shaped pricing. Columns and rows are data; only cells with a value exist. */
export const RateCard = Envelope.extend({
  offeringId: Id,
  /** `cost` cards are private: never sent to a model (invariant 2). */
  kind: z.enum(["pricing", "cost"]),
  name: z.string().min(1),
  note: z.string().optional(),
  columns: z.array(
    z.object({ id: Id, label: z.string(), note: z.string().optional(), sources: z.array(SourceRef).default([]) }),
  ),
  rows: z.array(
    z.object({
      id: Id,
      label: z.string(),
      groupLabel: z.string().optional(),
      sources: z.array(SourceRef).default([]),
    }),
  ),
  /** cells[rowId][colId] */
  cells: z.record(z.string(), z.record(z.string(), PriceCell)),
});
export type RateCard = z.infer<typeof RateCard>;

export const FeeBasis = z.enum([
  "one_time",
  "monthly",
  "annual",
  "per_transaction",
  "per_unit",
  "hourly",
  "daily",
  "other",
]);
export type FeeBasis = z.infer<typeof FeeBasis>;

export const FeeLine = z.object({
  id: Id,
  groupLabel: z.string().optional(),
  label: z.string().min(1),
  basis: FeeBasis,
  /** Free text. */
  price: z.string().min(1),
  next: ScheduledPrice.optional(),
  /** PRIVATE (invariant 2). Free text; margin is derived on screen and never stored. */
  cost: z.string().optional(),
  paidTo: z.string().optional(),
  owner: z.string().optional(),
  note: z.string().optional(),
  sources: z.array(SourceRef).default([]),
});
export type FeeLine = z.infer<typeof FeeLine>;

/** R3: list-shaped pricing. Also holds man-day rates (`basis: daily`) and add-ons. */
export const FeeSchedule = Envelope.extend({
  offeringId: Id,
  name: z.string().min(1),
  /** Pricing tab section. */
  section: z.enum(["man_days", "add_ons", "other"]).default("other"),
  /** Array order is display order: one-time, then recurring, then variable. */
  lines: z.array(FeeLine),
});
export type FeeSchedule = z.infer<typeof FeeSchedule>;

/** R4: shown in Sales material as "Results you can cite". */
export const Proof = Envelope.extend({
  kind: z.enum(["case_study", "metric", "logo", "testimonial"]),
  title: z.string().min(1),
  body: z.string().default(""),
  clientName: z.string().optional(),
  /** The Writer may cite only public proof (invariant 5). */
  isPublic: z.boolean(),
  offeringIds: z.array(Id).default([]),
});
export type Proof = z.infer<typeof Proof>;

/**
 * R5. With `offeringIds` empty, the constraint is a company-wide selling rule
 * (Settings, Selling rules). Otherwise it is a Scope tab exclusion ("Not included").
 */
export const Constraint = Envelope.extend({
  kind: z.enum(["region", "industry", "min_deal_size", "integration", "scope", "other"]),
  statement: z.string().min(1),
  values: z.array(z.string()).default([]),
  offeringIds: z.array(Id).default([]),
  /** What we offer instead, shown on the Scope tab. */
  insteadText: z.string().optional(),
  partnerId: Id.optional(),
});
export type Constraint = z.infer<typeof Constraint>;

export const Contact = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});
export type Contact = z.infer<typeof Contact>;

/** R6: held once, linked from offerings by `offering.partnerIds`. */
export const Partner = Envelope.extend({
  name: z.string().min(1),
  relationship: z.enum(["partner", "vendor", "supplier"]).default("partner"),
  covers: z.array(z.string()).default([]),
  arrangement: z.string().optional(),
  /** PRIVATE (invariant 2): what we pay them. */
  buyPrice: z.string().optional(),
  technology: z.array(TechPair).default([]),
  /** Never shown in proposals. */
  contacts: z.array(Contact).default([]),
  region: z.string().optional(),
  note: z.string().optional(),
});
export type Partner = z.infer<typeof Partner>;

export const DocumentKind = z.enum(["sales_deck", "brochure", "rate_card", "past_proposal", "case_study", "other"]);

export const DocumentRecord = z.object({
  id: Id,
  workspaceId: Id,
  name: z.string().min(1),
  kind: DocumentKind,
  offeringIds: z.array(Id).default([]),
  shareable: z.boolean().default(false),
  storagePath: z.string(),
  pages: z.number().int().nonnegative().optional(),
  /**
   * FR-ING-3: uploaded → reading → ready_to_review (a proposal waits) → applied,
   * or no_changes (nothing to change, or the proposal was discarded), or failed.
   */
  status: z.enum(["uploaded", "reading", "ready_to_review", "applied", "no_changes", "failed"]),
  error: z.string().optional(),
  proposalId: Id.optional(),
  /** What the person typed with the file, if anything. */
  message: z.string().max(4000).optional(),
  /** One line on what the file is, written by the model and checked by code. */
  summary: z.string().optional(),
  /** No text layer: Gemini read the page images (FR-ING-4 as changed in PRD 7.0). */
  scanned: z.boolean().optional(),
  uploadedBy: z.string(),
  uploadedAt: IsoDate,
  /** Soft delete: a removed file leaves the hub but stays in the recycle bin. */
  deletedAt: IsoDate.nullable().default(null),
});
export type DocumentRecord = z.infer<typeof DocumentRecord>;

export const Note = z.object({
  id: Id,
  workspaceId: Id,
  offeringId: Id.optional(),
  opportunityId: Id.optional(),
  text: z.string().min(1).max(4000),
  pinned: z.boolean().default(false),
  by: z.string(),
  byName: z.string(),
  at: IsoDate,
  provenance: Provenance,
  deletedAt: IsoDate.nullable().default(null),
});
export type Note = z.infer<typeof Note>;

/** R12: the whole graph as one versioned JSON document (export, import, sample data). */
export const OfferingGraphExport = z.object({
  format: z.literal("flowhub.offering-graph"),
  version: z.literal(1),
  exportedAt: IsoDate,
  workspace: z.object({
    name: z.string(),
    currency: z.string().length(3),
    country: z.string(),
  }),
  offerings: z.array(Offering),
  rateCards: z.array(RateCard),
  feeSchedules: z.array(FeeSchedule),
  proof: z.array(Proof),
  constraints: z.array(Constraint),
  partners: z.array(Partner),
  notes: z.array(Note).default([]),
});
export type OfferingGraphExport = z.infer<typeof OfferingGraphExport>;
