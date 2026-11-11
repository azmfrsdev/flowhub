import { z } from "zod";
import { Id, IsoDate } from "./common";
import { PriceLineRef } from "./deal-room";

/**
 * Quotes with approval (PRD 7.20, ADR-0019): `opportunities/{id}/quotes/{quoteId}`.
 * Lines start from the deal's approved Gate C pricing, prices copied by code
 * (invariant 1). Only sell-side fields exist here: no cost, buy price or
 * contact (invariant 2). Server-written only (invariant 10). Internal: not
 * part of the R12 exchange format.
 */

export const QuoteStatus = z.enum(["draft", "sent", "approved", "changes_requested"]);
export type QuoteStatus = z.infer<typeof QuoteStatus>;

export const QuoteLine = z.object({
  id: Id,
  ref: PriceLineRef,
  /** As copied from the graph at Gate C. */
  label: z.string(),
  valueText: z.string(),
  basis: z.enum(["one_time", "recurring", "variable"]),
  /** "On quote" or unreadable at Gate C: a person enters the price. */
  unpriced: z.boolean(),
  /** Null: a fixed price, charged once. */
  quantity: z.number().positive().max(1_000_000).nullable(),
  quantityFrom: z.enum(["fit", "person", "default"]),
  include: z.boolean(),
  /** FR-QUO-2: a person's price for an "On quote" line, marked as theirs. */
  personPrice: z.string().max(80).nullable().default(null),
  personPriceBy: z.string().nullable().default(null),
  /** FR-QUO-2, ADR-0019 D3: what this covers. AI wording checked by code, or the line's name. */
  scope: z.string().max(400),
  scopeFrom: z.enum(["ai", "code"]),
});
export type QuoteLine = z.infer<typeof QuoteLine>;

/** Worked out by code on every save (ADR-0019 D2). */
export const QuoteLineAmount = z.object({
  lineId: Id,
  /** "140 × RM 380 = RM 53,200", "Included", or the price as copied. */
  text: z.string(),
  amount: z.number().nullable(),
  recurring: z.string().nullable(),
});
export type QuoteLineAmount = z.infer<typeof QuoteLineAmount>;

export const QuoteTotals = z.object({
  currency: z.string(),
  lines: z.array(QuoteLineAmount),
  subtotal: z.number(),
  discount: z.number(),
  net: z.number(),
  tax: z.number(),
  total: z.number(),
  /** Recurring charges per period, before tax, never added to the one-off total. */
  recurring: z.array(z.object({ period: z.string(), amount: z.number() })),
});
export type QuoteTotals = z.infer<typeof QuoteTotals>;

export const QuoteCheck = z.object({
  key: z.enum(["prices", "on_quote", "discount", "minimum", "totals", "cost"]),
  state: z.enum(["pass", "fail"]),
  label: z.string(),
  detail: z.string(),
});
export type QuoteCheck = z.infer<typeof QuoteCheck>;

export const QuoteSettings = z.object({
  taxLabel: z.string().trim().max(20),
  /** Percent, 0 for none. */
  taxRate: z.number().min(0).max(30),
  /** The largest discount, in percent, a quote may carry. */
  maxDiscount: z.number().min(0).max(100),
});
export type QuoteSettings = z.infer<typeof QuoteSettings>;

export const Quote = z.object({
  id: Id,
  /** Q-2026-001 */
  number: z.string(),
  writeRunId: Id,
  fitRunId: Id,
  /** The working copies' revs it was made from (FR-QUO-7). */
  writeRev: z.number().int().nonnegative(),
  fitRev: z.number().int().nonnegative(),
  status: QuoteStatus,
  lines: z.array(QuoteLine),
  discountPercent: z.number().min(0).max(100),
  /** Copied from Settings › Quotes when the quote was made; the quote keeps its own. */
  tax: z.object({ label: z.string(), rate: z.number() }),
  maxDiscount: z.number(),
  totals: QuoteTotals,
  checks: z.array(QuoteCheck),
  /** FR-QUO-5: who did what, newest last. */
  history: z.array(
    z.object({
      action: z.enum(["created", "edited", "sent", "approved", "changes_requested", "doc_created"]),
      by: z.string(),
      byUid: z.string(),
      at: IsoDate,
      note: z.string().max(1000).optional(),
    }),
  ),
  approvedBy: z.string().nullable().default(null),
  approvedAt: IsoDate.nullable().default(null),
  doc: z.object({ id: z.string(), url: z.string(), pdfUrl: z.string().nullable(), createdAt: IsoDate }).nullable().default(null),
  rev: z.number().int().nonnegative(),
  createdAt: IsoDate,
  createdBy: z.string(),
  createdByUid: z.string(),
});
export type Quote = z.infer<typeof Quote>;
