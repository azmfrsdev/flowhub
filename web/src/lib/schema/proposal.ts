import { z } from "zod";
import { Contact, FeeBasis } from "./offering-graph";
import { Id, IsoDate, SourceRef } from "./common";

/**
 * Ask or tell proposals (ADR-0009 D2). A model returns typed operations; code
 * validates every one (src/server/proposals/validate.ts); a person applies them.
 * No operation can carry a cost field: none of these shapes declares one.
 */

const base = {
  /** Assigned by code, not the model. */
  id: Id,
  /** The words in the source this change rests on. Prices must appear in it verbatim. */
  evidence: z.string().min(1).max(600),
  /** For a document: the page the change rests on. Its text is the source the checks use. */
  page: z.number().int().positive().optional(),
};

export const CreateOpportunityOp = z.object({
  ...base,
  kind: z.literal("create_opportunity"),
  prospectName: z.string().min(1),
  website: z.string().optional(),
  contact: Contact.optional(),
  interestedOfferingIds: z.array(Id).default([]),
  nextMeeting: z.string().optional(),
  summary: z.string().optional(),
});

export const AddNoteOp = z.object({
  ...base,
  kind: z.literal("add_note"),
  offeringId: Id.optional(),
  opportunityRef: z.enum(["new_opportunity"]).optional(),
  text: z.string().min(1).max(2000),
});

export const AddFeatureOp = z.object({
  ...base,
  kind: z.literal("add_feature"),
  offeringId: Id,
  name: z.string().min(1),
  description: z.string().default(""),
});

export const UpdateFeatureOp = z.object({
  ...base,
  kind: z.literal("update_feature"),
  offeringId: Id,
  featureId: Id,
  expectedRev: z.number().int().nonnegative(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export const SetPriceCellOp = z.object({
  ...base,
  kind: z.literal("set_price_cell"),
  rateCardId: Id,
  rowId: Id,
  colId: Id,
  expectedRev: z.number().int().nonnegative(),
  before: z.string().nullable(),
  after: z.string().min(1),
  effectiveFrom: z.string().optional(),
});

export const SetFeeLinePriceOp = z.object({
  ...base,
  kind: z.literal("set_fee_line_price"),
  feeScheduleId: Id,
  lineId: Id,
  expectedRev: z.number().int().nonnegative(),
  before: z.string(),
  after: z.string().min(1),
  effectiveFrom: z.string().optional(),
});

export const AddFeeLineOp = z.object({
  ...base,
  kind: z.literal("add_fee_line"),
  feeScheduleId: Id,
  expectedRev: z.number().int().nonnegative(),
  label: z.string().min(1),
  basis: FeeBasis,
  price: z.string().min(1),
});

export const AddProofOp = z.object({
  ...base,
  kind: z.literal("add_proof"),
  proofKind: z.enum(["case_study", "metric", "logo", "testimonial"]),
  title: z.string().min(1),
  body: z.string().default(""),
  isPublic: z.boolean(),
  offeringIds: z.array(Id).min(1),
});

export const AddConstraintOp = z.object({
  ...base,
  kind: z.literal("add_constraint"),
  constraintKind: z.enum(["region", "industry", "min_deal_size", "integration", "scope", "other"]),
  statement: z.string().min(1),
  values: z.array(z.string()).default([]),
  /** Empty means a company-wide selling rule. */
  offeringIds: z.array(Id).default([]),
  insteadText: z.string().optional(),
});

export const AddPartnerOp = z.object({
  ...base,
  kind: z.literal("add_partner"),
  name: z.string().min(1),
  relationship: z.enum(["partner", "vendor", "supplier"]),
  covers: z.array(z.string()).default([]),
  offeringIds: z.array(Id).default([]),
  contacts: z.array(Contact).default([]),
});

/** File a document under offerings, so it shows in their Sales material tabs (ADR-0009 D2, "link a document"). */
export const LinkDocumentOp = z.object({
  ...base,
  kind: z.literal("link_document"),
  documentId: Id,
  offeringIds: z.array(Id).min(1),
});

export const Operation = z.discriminatedUnion("kind", [
  CreateOpportunityOp,
  AddNoteOp,
  AddFeatureOp,
  UpdateFeatureOp,
  SetPriceCellOp,
  SetFeeLinePriceOp,
  AddFeeLineOp,
  AddProofOp,
  AddConstraintOp,
  AddPartnerOp,
  LinkDocumentOp,
]);
export type Operation = z.infer<typeof Operation>;

/** What Apply changed, kept so Undo can put it back (FR-ASK-4). */
export const AppliedChange = z.object({
  collection: z.enum(["offerings", "rateCards", "feeSchedules", "proof", "constraints", "partners", "notes", "opportunities", "documents"]),
  /** The document changed or created. */
  id: Id,
  /** Its revision after the change. Undo refuses if it has moved on since. */
  rev: z.number().int().nullable(),
  /** A feature or fee line created inside the document. */
  createdId: Id.optional(),
  /** The value before, for Undo: a price, or a feature as JSON. */
  before: z.string().nullable().optional(),
  at: IsoDate,
  by: z.string(),
});
export type AppliedChange = z.infer<typeof AppliedChange>;

/** An operation after code validation. Dropped operations stay visible with a reason. */
export const CheckedOperation = z.object({
  op: Operation,
  status: z.enum(["proposed", "dropped", "applied", "discarded"]),
  dropReason: z.string().optional(),
  /** Human-readable landing place, built by code: "Google Cloud migration › Pricing › Packages › …". */
  path: z.string(),
  /** Where the change shows in the app, once applied. */
  href: z.string().optional(),
  source: SourceRef,
  /** FR-ASK-6: open deals priced with the old value. */
  warning: z.string().optional(),
  /** A person changed the proposed values before applying, so they, not the message, are its source. */
  editedBy: z.string().optional(),
  applied: AppliedChange.optional(),
});
export type CheckedOperation = z.infer<typeof CheckedOperation>;

export const Proposal = z.object({
  id: Id,
  workspaceId: Id,
  via: z.enum(["message", "document"]),
  input: z.object({
    text: z.string().max(4000).optional(),
    documentId: Id.optional(),
    fileName: z.string().optional(),
  }),
  scopeOfferingId: Id.optional(),
  /** Offerings the changes land on, so their pages can show what's pending (FR-ASK-5). */
  offeringIds: z.array(Id).default([]),
  operations: z.array(CheckedOperation),
  /** A short summary for the panel, written by the model. */
  summary: z.string().default(""),
  status: z.enum(["proposed", "applied", "partially_applied", "discarded"]),
  createdBy: z.string(),
  createdAt: IsoDate,
  appliedBy: z.string().optional(),
  appliedAt: IsoDate.optional(),
  model: z.string().optional(),
});
export type Proposal = z.infer<typeof Proposal>;

/**
 * An Ask answer (FR-ASK-8), or the reply to a message that changed nothing.
 * The model picks lines and records; code copies every price and calculates
 * every total, so `text` holds no price the model typed.
 */
export const AnswerLine = z.object({
  /** The line the model picked, as named in its outline. */
  ref: z.string(),
  offeringId: Id,
  label: z.string(),
  /** "Google Cloud migration › Pricing › Packages". */
  where: z.string(),
  /** Copied by code from the price list. */
  valueText: z.string(),
  /** Calculated by code: "80 × RM 380 = RM 30,400". */
  calc: z.string().optional(),
});
export type AnswerLine = z.infer<typeof AnswerLine>;

export const AnswerCite = z.object({
  kind: z.enum(["offering", "feature", "proof", "partner", "constraint"]),
  id: Id,
  label: z.string(),
  href: z.string(),
});
export type AnswerCite = z.infer<typeof AnswerCite>;

export const Answer = z.object({
  id: Id,
  workspaceId: Id,
  kind: z.enum(["answer", "no_change", "unclear"]),
  question: z.string().max(4000),
  scopeOfferingId: Id.optional(),
  /** The reply, with prices filled in by code. */
  text: z.string(),
  lines: z.array(AnswerLine).default([]),
  /** Calculated by code when two or more one-time lines add up. */
  total: z.string().optional(),
  cites: z.array(AnswerCite).default([]),
  notInHub: z.boolean().default(false),
  createdBy: z.string(),
  createdAt: IsoDate,
  model: z.string().optional(),
});
export type Answer = z.infer<typeof Answer>;
