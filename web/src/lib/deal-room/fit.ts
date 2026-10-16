import { type WorkspaceGraph, malaysiaDay, priceOn } from "@/lib/offerings/view";
import { formatAmount, parsePrice } from "@/lib/pricing/parse";
import type { Constraint, FitOutput, PriceLineRef } from "@/lib/schema";

/**
 * The fit stage's deterministic core (ADR-0006 D3, D4; FR-FIT-3 to FR-FIT-5).
 * Models see only these projections: no cost field and no cost-kind card
 * ever enters them (invariant 2), and prices are copied by code, never typed
 * by a model (invariant 1).
 */

/** What the Fit Analyst reads: confirmed offerings, scope, exclusions, proof and partners. No prices, no cost. */
export function graphOutline(graph: WorkspaceGraph) {
  const active = graph.offerings.filter((offering) => offering.status !== "retired");
  return {
    offerings: active.map((offering) => ({
      id: offering.id,
      rev: offering.rev,
      parentId: offering.parentId,
      name: offering.name,
      type: offering.type,
      summary: offering.summary,
      features: offering.features.filter((feature) => feature.status === "active").map(({ id, name, description }) => ({ id, name, description })),
      notIncluded: graph.constraints
        .filter((rule) => rule.offeringIds.includes(offering.id))
        .map((rule) => ({ constraintId: rule.id, rev: rule.rev, statement: rule.statement, partnerId: rule.partnerId ?? null })),
      proof: graph.proof.filter((item) => item.offeringIds.includes(offering.id)).map(({ id, rev, title, isPublic }) => ({ id, rev, title, isPublic })),
      technology: offering.technology.map((tech) => tech.label),
    })),
    partners: graph.partners.map(({ id, rev, name, relationship, covers }) => ({ id, rev, name, relationship, covers })),
    sellingRules: graph.constraints.filter((rule) => rule.offeringIds.length === 0).map(({ id, rev, kind, statement, values }) => ({ id, rev, kind, statement, values })),
  };
}

/** What the Pricing step reads through its tools: pricing-kind cards and fee prices only, each marked parsed or not. */
export function pricingProjection(graph: WorkspaceGraph, offeringId: string, currency: string, day = malaysiaDay()) {
  const readable = (text: string) => {
    const parsed = parsePrice(text, currency);
    return parsed.kind === "amount" || parsed.kind === "percent" ? "parsed" : parsed.kind;
  };
  return {
    rateCards: graph.rateCards
      .filter((card) => card.offeringId === offeringId && card.kind === "pricing")
      .map((card) => ({
        cardId: card.id,
        rev: card.rev,
        name: card.name,
        columns: card.columns.map(({ id, label, note }) => ({ id, label, note: note ?? null })),
        rows: card.rows.map(({ id, label, groupLabel }) => ({ id, label, group: groupLabel ?? null })),
        cells: card.rows.flatMap((row) =>
          card.columns.flatMap((column) => {
            const cell = card.cells[row.id]?.[column.id];
            const value = cell ? priceOn(cell, day) : null;
            return value ? [{ rowId: row.id, colId: column.id, value, reads: readable(value) }] : [];
          }),
        ),
      })),
    feeSchedules: graph.feeSchedules
      .filter((schedule) => schedule.offeringId === offeringId)
      .map((schedule) => ({
        scheduleId: schedule.id,
        rev: schedule.rev,
        name: schedule.name,
        section: schedule.section,
        lines: schedule.lines.map(({ id, label, basis, price, next }) => {
          const value = priceOn({ value: price, next }, day);
          return { lineId: id, label, basis, price: value, reads: readable(value) };
        }),
      })),
  };
}

/** FR-FIT-3: selling rules checked in code before the fit is scored. Industry and region only; the rest goes to the Fit Analyst. */
export function checkSellingRules(rules: Constraint[], prospect: { country?: string | null; text: string }) {
  const haystack = prospect.text.toLowerCase();
  const conflicts: { constraint: Constraint; reason: string }[] = [];
  for (const rule of rules) {
    if (rule.offeringIds.length > 0) continue;
    if (rule.kind === "industry") {
      const hit = rule.values.find((value) => value && new RegExp(`\\b${value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(haystack));
      if (hit) conflicts.push({ constraint: rule, reason: `The prospect looks like a ${hit} business.` });
    }
    if (rule.kind === "region" && prospect.country && rule.values.length > 0) {
      const country = prospect.country.trim().toUpperCase();
      if (country.length === 2 && !rule.values.map((value) => value.toUpperCase()).includes(country)) {
        conflicts.push({ constraint: rule, reason: `The prospect is in ${country}, outside the regions you serve.` });
      }
    }
  }
  return conflicts;
}

const WEIGHT = { high: 3, medium: 2, low: 1 } as const;
const STRENGTH = { strong: 1, partial: 0.6, weak: 0.3 } as const;

/** ADR-0006 D4: the go/no-go score, computed in code from the fit components. */
export function computeScore(fit: Pick<FitOutput, "gaps" | "mappings" | "cannotMeet">, techOverlap: number): FitOutput["score"] {
  let weights = 0;
  let covered = 0;
  for (const gap of fit.gaps) {
    weights += WEIGHT[gap.priority];
    const best = Math.max(0, ...fit.mappings.filter((mapping) => mapping.gapId === gap.id).map((mapping) => STRENGTH[mapping.strength]));
    covered += WEIGHT[gap.priority] * best;
  }
  const coverage = weights > 0 ? Math.round((covered / weights) * 100) : 0;
  const penalties =
    15 *
    fit.cannotMeet.filter((item) => !item.partner && fit.gaps.find((gap) => gap.id === item.gapId)?.priority === "high").length;
  const techBonus = Math.min(5, Math.max(0, techOverlap));
  const raw = Math.max(0, Math.min(100, coverage - penalties + techBonus));
  // FR-FIT-4: breaking a company-wide selling rule (found in code) holds the deal at No-go, however well the rest fits.
  const ruleCap = fit.cannotMeet.some((item) => item.sellingRule && fit.gaps.some((gap) => gap.id === item.gapId)) && raw >= 40;
  const value = ruleCap ? 39 : raw;
  return { value, band: value >= 70 ? "go" : value >= 40 ? "consider" : "nogo", components: { coverage, penalties, techBonus, ...(ruleCap ? { ruleCap } : {}) } };
}

export type PriceSelection = { ref: PriceLineRef; quantity?: { value: number; claimId: string } };

/** FR-FIT-5: a quantity is used only if the text it cites states that number ("120 VMs", "7,400 workers"). Never guessed. */
export function quantityStated(value: number, text: string): boolean {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].some((match) => Number(match[0].replace(/,/g, "")) === value);
}

/**
 * FR-FIT-5, invariant 1: the Pricing step only names references. Code checks
 * each one exists on a pricing-kind card or a fee schedule, at the current
 * revision, and copies the price text exactly. Unknown refs are rejected.
 */
export function copyPriceLines(graph: WorkspaceGraph, selections: PriceSelection[], currency: string, day = malaysiaDay()) {
  const lines: FitOutput["pricing"]["lines"] = [];
  const rejected: PriceSelection[] = [];
  for (const selection of selections) {
    const { ref } = selection;
    let label: string | null = null;
    let valueText: string | null = null;
    let feeBasis: string | null = null;
    if (ref.kind === "cell") {
      const card = graph.rateCards.find((item) => item.id === ref.cardId && item.kind === "pricing");
      const row = card?.rows.find((item) => item.id === ref.rowId);
      const column = card?.columns.find((item) => item.id === ref.colId);
      const cell = card?.cells[ref.rowId]?.[ref.colId];
      if (card && row && column && cell && card.rev === ref.rev) {
        label = `${row.label}, ${column.label}`;
        valueText = priceOn(cell, day);
      }
    } else {
      const schedule = graph.feeSchedules.find((item) => item.id === ref.scheduleId);
      const line = schedule?.lines.find((item) => item.id === ref.lineId);
      if (schedule && line && schedule.rev === ref.rev) {
        label = line.label;
        valueText = priceOn({ value: line.price, next: line.next }, day);
        feeBasis = line.basis;
      }
    }
    if (label === null || valueText === null) {
      rejected.push(selection);
      continue;
    }
    const parsed = parsePrice(valueText, currency);
    const recurring = (parsed.kind === "amount" && parsed.recurring) || feeBasis === "monthly" || feeBasis === "annual";
    const variable = !recurring && ((parsed.kind === "amount" && parsed.per) || parsed.kind === "percent" || feeBasis === "per_unit" || feeBasis === "per_transaction" || feeBasis === "hourly" || feeBasis === "daily");
    let total: string | undefined;
    if (parsed.kind === "amount" && selection.quantity && parsed.per) {
      const quantity = Math.max(selection.quantity.value, parsed.minQuantity ?? 0);
      // "7,400 × RM 7 / employee / month" is still a monthly amount.
      total = `${formatAmount(Math.max(parsed.amount * quantity, parsed.minAmount ?? 0), parsed.currency)}${parsed.recurring ? ` / ${parsed.recurring}` : ""}`;
    }
    lines.push({
      id: `pl_${lines.length + 1}`,
      ref,
      label,
      valueText,
      basis: recurring ? "recurring" : variable ? "variable" : "one_time",
      ...(selection.quantity ? { quantity: selection.quantity } : {}),
      ...(total ? { total } : {}),
      unpriced: parsed.kind === "on_quote" || parsed.kind === "unparsed",
    });
  }
  return { lines, rejected };
}
