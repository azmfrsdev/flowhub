import { clamp, leaks } from "@/lib/deal-room/deck";
import { calculate } from "@/lib/ask/answer";
import { type WorkspaceGraph, malaysiaDay, priceOn } from "@/lib/offerings/view";
import { isMinimumCharge } from "@/lib/deal-room/pricing-groups";
import { formatAmount, parsePrice } from "@/lib/pricing/parse";
import type { FitOutput, PriceLineRef, Quote, QuoteCheck, QuoteLine, QuoteSettings, QuoteTotals, Workspace } from "@/lib/schema";

/**
 * Quotes with approval (PRD 7.20, ADR-0019): code's side. Lines come from the
 * approved Gate C pricing with prices as copied; code works out every amount,
 * the discount, tax and total with the one price parser, and runs the checks
 * that gate Approve. Pure, shared by the server and the quote view.
 */

/** FR-QUO-3: defaults by country when Settings › Quotes hasn't been set. */
export function quoteSettings(workspace: Pick<Workspace, "country" | "quotes">): QuoteSettings {
  if (workspace.quotes) return workspace.quotes;
  if (workspace.country === "MY") return { taxLabel: "SST", taxRate: 8, maxDiscount: 10 };
  if (workspace.country === "SG") return { taxLabel: "GST", taxRate: 9, maxDiscount: 10 };
  return { taxLabel: "Tax", taxRate: 0, maxDiscount: 10 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** FR-QUO-1: the quote's starting lines, from the fit run's approved pricing. Scope wording is filled in later. */
export function linesFromFit(pricing: FitOutput["pricing"]["lines"], currency: string): QuoteLine[] {
  return pricing.map((line, index) => {
    const parsed = parsePrice(line.valueText, currency);
    const perUnit = parsed.kind === "amount" && Boolean(parsed.per);
    const quantity = line.quantity?.value ?? (perUnit ? 1 : null);
    return {
      id: `ql_${index + 1}`,
      ref: line.ref,
      label: line.label,
      valueText: line.valueText,
      basis: line.basis,
      unpriced: line.unpriced,
      quantity,
      quantityFrom: line.quantity ? "fit" : perUnit ? "default" : "default",
      include: true,
      personPrice: null,
      personPriceBy: null,
      scope: line.label,
      scopeFrom: "code",
    };
  });
}

/** The price a line is charged at: the copied price, or for an "On quote" line the person's. */
export function linePriceText(line: Pick<QuoteLine, "unpriced" | "valueText" | "personPrice">): string | null {
  return line.unpriced ? (line.personPrice?.trim() || null) : line.valueText;
}

/** FR-QUO-2: one line's amount, by code. */
export function lineAmount(line: QuoteLine, currency: string): QuoteTotals["lines"][number] {
  const price = linePriceText(line);
  if (!price) return { lineId: line.id, text: "Price needed", amount: null, recurring: null };
  const parsed = parsePrice(price, currency);
  if (parsed.kind === "included") return { lineId: line.id, text: "Included", amount: 0, recurring: null };
  if (parsed.kind === "waived") return { lineId: line.id, text: "Waived", amount: 0, recurring: null };
  if (parsed.kind !== "amount") return { lineId: line.id, text: price, amount: null, recurring: null };
  const quantity = line.quantity ?? 1;
  if (parsed.per || line.quantity !== null) {
    const result = calculate(price, quantity, currency);
    if (result) return { lineId: line.id, text: result.text, amount: round2(result.amount), recurring: result.recurring ?? null };
  }
  const amount = Math.max(parsed.amount, parsed.minAmount ?? 0);
  // A minimum charge is a floor on its period's total, not a charge of its own (quoteTotals).
  if (parsed.recurring && isMinimumCharge(line.label)) return { lineId: line.id, text: `At least ${formatAmount(amount, parsed.currency)} / ${parsed.recurring}`, amount: round2(amount), recurring: parsed.recurring };
  return { lineId: line.id, text: `${formatAmount(amount, parsed.currency)}${parsed.recurring ? ` / ${parsed.recurring}` : ""}`, amount: round2(amount), recurring: parsed.recurring ?? null };
}

/** FR-QUO-3: subtotal, discount, tax and total by code. Recurring lines are kept apart, per period, and a minimum charge is a floor on its period. */
export function quoteTotals(lines: QuoteLine[], discountPercent: number, taxRate: number, currency: string): QuoteTotals {
  const amounts = lines.map((line) => lineAmount(line, currency));
  const included = new Set(lines.filter((line) => line.include).map((line) => line.id));
  const counted = amounts.filter((item) => included.has(item.lineId));
  const subtotal = round2(counted.filter((item) => !item.recurring).reduce((sum, item) => sum + (item.amount ?? 0), 0));
  const discount = round2((subtotal * discountPercent) / 100);
  const net = round2(subtotal - discount);
  const tax = round2((net * taxRate) / 100);
  // Recurring charges per period; a minimum charge raises its period to the floor and is never added.
  const floorIds = new Set(lines.filter((line) => isMinimumCharge(line.label)).map((line) => line.id));
  const periods = new Map<string, number>();
  const floors = new Map<string, number>();
  for (const item of counted) {
    if (!item.recurring) continue;
    if (floorIds.has(item.lineId)) floors.set(item.recurring, Math.max(floors.get(item.recurring) ?? 0, item.amount ?? 0));
    else periods.set(item.recurring, round2((periods.get(item.recurring) ?? 0) + (item.amount ?? 0)));
  }
  for (const [period, floor] of floors) periods.set(period, Math.max(periods.get(period) ?? 0, floor));
  return { currency, lines: amounts, subtotal, discount, net, tax, total: round2(net + tax), recurring: [...periods].map(([period, amount]) => ({ period, amount })) };
}

/** What the Pricing tab says today for a line's reference, or null when the line is gone. */
export function currentPrice(graph: Pick<WorkspaceGraph, "rateCards" | "feeSchedules">, ref: PriceLineRef, day = malaysiaDay()): string | null {
  if (ref.kind === "cell") {
    const card = graph.rateCards.find((item) => item.id === ref.cardId && item.kind === "pricing" && !item.deletedAt);
    const cell = card?.cells[ref.rowId]?.[ref.colId];
    return cell ? priceOn(cell, day) : null;
  }
  const schedule = graph.feeSchedules.find((item) => item.id === ref.scheduleId && !item.deletedAt);
  const line = schedule?.lines.find((item) => item.id === ref.lineId);
  return line ? priceOn({ value: line.price, next: line.next }, day) : null;
}

/** The company's minimum deal size, from a selling rule (FR-OFR-9), as an amount. */
export function minimumDeal(graph: Pick<WorkspaceGraph, "constraints">): number | null {
  const rule = graph.constraints.find((item) => item.kind === "min_deal_size" && !item.deletedAt && item.offeringIds.length === 0);
  const value = Number(String(rule?.values[0] ?? "").replace(/[^\d.]/g, ""));
  return value > 0 ? value : null;
}

/**
 * FR-QUO-4, ADR-0019 D4: the checks that gate Approve. Run on every save and
 * again on the server at approval; the browser's state is never trusted.
 */
export function quoteChecks(
  quote: Pick<Quote, "lines" | "discountPercent" | "maxDiscount" | "totals">,
  graph: Pick<WorkspaceGraph, "rateCards" | "feeSchedules" | "constraints">,
  currency: string,
  day = malaysiaDay(),
): QuoteCheck[] {
  const used = quote.lines.filter((line) => line.include);
  const changed = used
    .filter((line) => !line.unpriced)
    .flatMap((line) => {
      const now = currentPrice(graph, line.ref, day);
      return now === line.valueText ? [] : [`${line.label}: ${line.valueText} → ${now ?? "no longer on the Pricing tab"}`];
    });
  const missing = used.filter((line) => line.unpriced && lineAmount(line, currency).amount === null);
  const unreadable = used.filter((line) => !line.unpriced && lineAmount(line, currency).amount === null);
  const minimum = minimumDeal(graph);
  const money = (n: number) => formatAmount(n, currency);
  return [
    changed.length
      ? { key: "prices", state: "fail", label: `${changed.length === 1 ? "A price has" : `${changed.length} prices have`} changed on the Pricing tab`, detail: `${changed.join("; ")}. Re-run fit and pricing, or leave the line out.` }
      : { key: "prices", state: "pass", label: "Every price matches the Pricing tab", detail: `${used.filter((line) => !line.unpriced).length} copied prices checked against today's Pricing tab.` },
    missing.length
      ? { key: "on_quote", state: "fail", label: `${missing.length} "On quote" ${missing.length === 1 ? "line needs" : "lines need"} a price`, detail: `Enter a price for ${missing.map((line) => line.label).join(", ")}, or leave ${missing.length === 1 ? "it" : "them"} out.` }
      : unreadable.length
        ? { key: "on_quote", state: "fail", label: "A price can't be read", detail: `${unreadable.map((line) => line.label).join(", ")}: leave it out, or fix it on the Pricing tab.` }
        : { key: "on_quote", state: "pass", label: 'Every "On quote" price comes from a person', detail: used.some((line) => line.unpriced) ? `Entered by ${[...new Set(used.filter((line) => line.unpriced).map((line) => line.personPriceBy).filter(Boolean))].join(", ")}.` : 'No "On quote" lines.' },
    quote.discountPercent <= quote.maxDiscount
      ? { key: "discount", state: "pass", label: `Discount ${quote.discountPercent}% is within the ${quote.maxDiscount}% limit`, detail: "The limit is set in Settings › Quotes." }
      : { key: "discount", state: "fail", label: `Discount ${quote.discountPercent}% is over the ${quote.maxDiscount}% limit`, detail: "Lower it, or change the limit in Settings › Quotes." },
    minimum === null || quote.totals.net >= minimum || quote.totals.recurring.length > 0
      ? { key: "minimum", state: "pass", label: minimum === null ? "No minimum deal size set" : `Above the ${money(minimum)} minimum`, detail: minimum === null ? "Selling rules have no minimum deal size." : `One-off total after discount: ${money(quote.totals.net)}.` }
      : { key: "minimum", state: "fail", label: `Below the ${money(minimum)} minimum deal size`, detail: `One-off total after discount is ${money(quote.totals.net)}.` },
    { key: "totals", state: "pass", label: "Totals, discount and tax worked out by code", detail: "No model wrote a figure on this quote." },
    { key: "cost", state: "pass", label: "No cost or buy price on the quote", detail: "Quotes hold only sell prices." },
  ];
}

export const QUOTE_SCOPE_MAX = 220;

/** ADR-0019 D3: keeps AI scope wording only when it states no amount and names no private result. */
export function checkScope(text: string | undefined, fallback: string, nonPublic: string[]): { scope: string; scopeFrom: "ai" | "code" } {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || leaks(clean, nonPublic)) return { scope: fallback, scopeFrom: "code" };
  return { scope: clamp(clean, QUOTE_SCOPE_MAX), scopeFrom: "ai" };
}

/** Q-2026-007 */
export function quoteNumber(year: number, n: number): string {
  return `Q-${year}-${String(n).padStart(3, "0")}`;
}
