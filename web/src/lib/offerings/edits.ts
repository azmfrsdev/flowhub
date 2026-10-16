import { z } from "zod";
import { FeeBasis, type FeeLine, type PriceCell, type RateCard } from "@/lib/schema";

/**
 * Hand edits to prices (ADR-0009 D3, FR-OFR-5). Prices stay free text, exactly
 * as typed (ADR-0001 D6). A changed cell loses its document source, because
 * the document no longer backs it; an unchanged cell keeps its sources.
 * Lines and tiers can be added, renamed and removed by hand too (FR-OFR-5 as
 * changed on 2026-10-15), so an offering can carry several commercial
 * elements: a grid of tiers, a flat price list, add-ons and day rates.
 */

export const PriceText = z.string().trim().max(80, "Keep a price under 80 characters.");

/** How a fee line is charged, in the words the Pricing tab uses. */
export const FEE_BASIS_LABEL: Record<FeeBasis, string> = {
  one_time: "One-off",
  monthly: "Monthly",
  annual: "Yearly",
  per_unit: "Per unit",
  per_transaction: "Per transaction",
  hourly: "Per hour",
  daily: "Per day",
  other: "Other",
};

const Key = z.string().min(1).max(64);
const EntityId = z.string().min(1).max(64).optional();
const LineLabel = z.string().trim().min(1, "Name every line.").max(120, "Keep a line name under 120 characters.");
const SectionName = z.string().trim().min(1, "Give this pricing a name.").max(80, "Keep the name under 80 characters.");

/** A stale editor: it names a line or tier that's no longer there, or names one twice. */
const STALE = "This pricing changed while you were editing. Reload to see the latest, then make your change again.";

/** Cell values only, by row and column ID: how a private cost card is edited. */
export const RateCardEdit = z.record(z.string(), z.record(z.string(), PriceText));
export type RateCardEdit = z.infer<typeof RateCardEdit>;

export function applyCellEdits(card: Pick<RateCard, "rows" | "columns" | "cells">, edits: RateCardEdit) {
  const cells: Record<string, Record<string, PriceCell>> = {};
  const changes: string[] = [];
  for (const row of card.rows) {
    for (const column of card.columns) {
      const before = card.cells[row.id]?.[column.id];
      const typed = edits[row.id]?.[column.id];
      const value = typed === undefined ? (before?.value ?? "") : typed.trim();
      if (value === (before?.value ?? "")) {
        if (before) (cells[row.id] ??= {})[column.id] = before;
        continue;
      }
      changes.push(`${row.label} · ${column.label}: ${before?.value ?? "empty"} → ${value || "empty"}`);
      // A scheduled change (FR-ASK-6) survives a hand edit of today's price.
      if (value) (cells[row.id] ??= {})[column.id] = { value, ...(before?.next ? { next: before.next } : {}), sources: [] };
    }
  }
  return { cells, changes };
}

/**
 * A pricing grid edited as a whole: its name, tiers (columns), lines (rows)
 * and cells. New tiers and lines have no ID yet, so the editor keys them, and
 * cells are keyed by those keys. Existing ones keep their IDs, notes and
 * groups, so proposals and deal-room runs that point at them still resolve.
 */
export const RateCardStructureEdit = z.object({
  name: SectionName,
  columns: z
    .array(z.object({ key: Key, id: EntityId, label: z.string().trim().min(1, "Name every tier.").max(60, "Keep a tier name under 60 characters.") }))
    .min(1, "Keep at least one tier.")
    .max(12, "A grid holds up to 12 tiers."),
  rows: z.array(z.object({ key: Key, id: EntityId, label: LineLabel, groupLabel: z.string().trim().max(60).optional() })).max(100, "A grid holds up to 100 lines."),
  cells: z.record(z.string(), z.record(z.string(), PriceText)),
});
export type RateCardStructureEdit = z.infer<typeof RateCardStructureEdit>;

export function applyRateCardEdit(
  card: Pick<RateCard, "name" | "rows" | "columns" | "cells">,
  edit: RateCardStructureEdit,
  newId: (prefix: "row" | "col") => string,
): { patch: Pick<RateCard, "name" | "rows" | "columns" | "cells">; changes: string[] } | { error: string } {
  const columnsById = new Map(card.columns.map((column) => [column.id, column]));
  const rowsById = new Map(card.rows.map((row) => [row.id, row]));
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const item of [...edit.columns, ...edit.rows]) {
    if (keys.has(item.key) || (item.id && ids.has(item.id))) return { error: STALE };
    keys.add(item.key);
    if (item.id) ids.add(item.id);
  }
  if (edit.columns.some((column) => column.id && !columnsById.has(column.id)) || edit.rows.some((row) => row.id && !rowsById.has(row.id))) return { error: STALE };

  const changes: string[] = [];
  if (edit.name !== card.name) changes.push(`renamed ${card.name} to ${edit.name}`);

  const columns = edit.columns.map((column) => {
    const before = column.id ? columnsById.get(column.id) : undefined;
    if (!before) {
      changes.push(`added the tier ${column.label}`);
      return { key: column.key, existing: false, value: { id: newId("col"), label: column.label, sources: [] } };
    }
    if (before.label !== column.label) changes.push(`renamed the tier ${before.label} to ${column.label}`);
    return { key: column.key, existing: true, value: { ...before, label: column.label } };
  });
  for (const before of card.columns) if (!edit.columns.some((column) => column.id === before.id)) changes.push(`removed the tier ${before.label}`);

  const rows = edit.rows.map((row) => {
    const before = row.id ? rowsById.get(row.id) : undefined;
    const groupLabel = row.groupLabel || undefined;
    if (!before) {
      changes.push(`added the line ${row.label}`);
      return { key: row.key, existing: false, value: { id: newId("row"), label: row.label, ...(groupLabel ? { groupLabel } : {}), sources: [] } };
    }
    if (before.label !== row.label) changes.push(`renamed the line ${before.label} to ${row.label}`);
    return { key: row.key, existing: true, value: { ...before, label: row.label } };
  });
  for (const before of card.rows) if (!edit.rows.some((row) => row.id === before.id)) changes.push(`removed the line ${before.label}`);

  const cells: Record<string, Record<string, PriceCell>> = {};
  for (const row of rows) {
    for (const column of columns) {
      const before = row.existing && column.existing ? card.cells[row.value.id]?.[column.value.id] : undefined;
      const typed = edit.cells[row.key]?.[column.key];
      const value = typed === undefined ? (before?.value ?? "") : typed.trim();
      if (value === (before?.value ?? "")) {
        if (before) (cells[row.value.id] ??= {})[column.value.id] = before;
        continue;
      }
      // A new line or tier is already reported as added, with no "empty → price" noise for each cell.
      if (row.existing && column.existing) changes.push(`${row.value.label} · ${column.value.label}: ${before?.value ?? "empty"} → ${value || "empty"}`);
      if (value) (cells[row.value.id] ??= {})[column.value.id] = { value, ...(before?.next ? { next: before.next } : {}), sources: [] };
    }
  }

  return { patch: { name: edit.name, columns: columns.map((column) => column.value), rows: rows.map((row) => row.value), cells }, changes };
}

/** One line of a price list, as the editor sends it. A line with no ID is new. */
export const FeeLineEdit = z.object({ id: EntityId, label: LineLabel, basis: FeeBasis, price: PriceText, cost: PriceText });
export type FeeLineEdit = z.infer<typeof FeeLineEdit>;

/** A price list edited as a whole: its name (when it has its own) and every line, in display order. */
export const FeeScheduleEdit = z.object({ name: SectionName.optional(), lines: z.array(FeeLineEdit).max(200, "A price list holds up to 200 lines.") });
export type FeeScheduleEdit = z.infer<typeof FeeScheduleEdit>;

/**
 * Applies the edited list: lines keep their IDs and everything the editor
 * doesn't show (scheduled prices, who it's paid to, notes); lines left out are
 * removed; lines with no ID are added. Cost changes are counted, never quoted.
 */
export function applyFeeLineEdits(lines: FeeLine[], edits: FeeLineEdit[], newId: () => string): { lines: FeeLine[]; changes: string[] } | { error: string } {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const seen = new Set<string>();
  const changes: string[] = [];
  const next: FeeLine[] = [];
  for (const edit of edits) {
    const label = edit.label.trim();
    const price = edit.price.trim();
    const cost = edit.cost.trim();
    if (!price) return { error: `${label} needs a price. Write "On quote" if it has none.` };
    if (!edit.id) {
      changes.push(`added ${label} at ${price}`);
      next.push({ id: newId(), label, basis: edit.basis, price, ...(cost ? { cost } : {}), sources: [] });
      continue;
    }
    const line = byId.get(edit.id);
    if (!line || seen.has(edit.id)) return { error: STALE };
    seen.add(edit.id);
    const priceChanged = price !== line.price;
    if (label !== line.label) changes.push(`renamed ${line.label} to ${label}`);
    if (edit.basis !== line.basis) changes.push(`${label} is now charged ${FEE_BASIS_LABEL[edit.basis].toLowerCase()}`);
    if (priceChanged) changes.push(`${label}: ${line.price} → ${price}`);
    if (cost !== (line.cost ?? "")) changes.push(`${label} cost changed`);
    next.push({ ...line, label, basis: edit.basis, price, cost: cost || undefined, sources: priceChanged ? [] : line.sources });
  }
  for (const line of lines) if (!seen.has(line.id)) changes.push(`removed ${line.label}`);
  return { lines: next, changes };
}
