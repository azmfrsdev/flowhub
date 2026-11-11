import { formatAmount, parsePrice } from "@/lib/pricing/parse";
import type { FitOutput } from "@/lib/schema";

type Line = FitOutput["pricing"]["lines"][number];

/**
 * A minimum charge ("Minimum monthly fee", "Minimum spend") is a floor on the
 * other charges of its period, never a charge added on top. Read from the
 * line's label by code, so runs approved before this rule are read right too.
 */
export function isMinimumCharge(label: string): boolean {
  return /\bminimum\b[^,]*\b(fee|charge|spend|commitment|billing)\b/i.test(label);
}

export const BASIS_TITLE = { one_time: "One-time", recurring: "Recurring", variable: "Per unit or on quote" } as const;

/**
 * The group a line is shown and summed in. A per-unit line whose total code
 * calculated from a stated quantity (130 × "RM 8,099 per unit" = "RM 1,052,870")
 * is a one-time amount. Without a total, or with one that still names a unit
 * or a period, it stays per unit.
 */
function groupOf(line: Line): Line["basis"] {
  if (line.basis !== "variable" || !line.total) return line.basis;
  const total = parsePrice(line.total);
  return total.kind === "amount" && !total.per && !total.recurring ? "one_time" : "variable";
}

/**
 * FR-FIT-5(c): lines grouped by basis, never summed across bases. A subtotal
 * only when every line in a group is a plain amount in one currency and
 * period; "Included" and "Waived" add nothing. Quoted lines move to the last
 * group so subtotals only ever add real amounts. A minimum charge is a floor
 * on its group's subtotal, never added to it, and `floorNote` says which won.
 * Shared by the fit map, the proposal's pricing table, the deck and prep.
 */
export type PricingGroup = { basis: Line["basis"]; title: string; lines: Line[]; subtotal: string | null; floorNote: string | null };

export function pricingGroups(lines: Line[]): PricingGroup[] {
  return (["one_time", "recurring", "variable"] as const).flatMap((basis): PricingGroup[] => {
    const group = lines.filter((line) => groupOf(line) === basis && !(basis !== "variable" && line.unpriced));
    if (basis === "variable") group.push(...lines.filter((line) => groupOf(line) !== "variable" && line.unpriced));
    if (group.length === 0) return [];
    // Floors are shown, but never summed: the subtotal is the larger of the charges and the floor.
    const floors = group.filter((line) => !line.unpriced && isMinimumCharge(line.label));
    const charged = group.filter((line) => !floors.includes(line));
    const parsed = charged.map((line) => parsePrice(line.total ?? line.valueText));
    const amounts = parsed.flatMap((price) => (price.kind === "amount" ? [price] : []));
    const free = parsed.filter((price) => price.kind === "included" || price.kind === "waived").length;
    const summable =
      basis !== "variable" &&
      amounts.length > 0 &&
      amounts.length + free === charged.length &&
      group.length > 1 &&
      amounts.every((price) => !price.per && price.currency === amounts[0].currency && (price.recurring ?? null) === (amounts[0].recurring ?? null));
    if (!summable) return [{ basis, title: BASIS_TITLE[basis], lines: group, subtotal: null, floorNote: null }];
    const { currency, recurring } = amounts[0];
    const period = recurring ? ` / ${recurring}` : "";
    const sum = amounts.reduce((total, price) => total + price.amount, 0);
    const floorPrices = floors.map((line) => ({ line, price: parsePrice(line.valueText) }));
    const sameBasis = floorPrices.every(({ price }) => price.kind === "amount" && !price.per && price.currency === currency && (price.recurring ?? null) === (recurring ?? null));
    if (floors.length === 0 || !sameBasis) {
      return [{ basis, title: BASIS_TITLE[basis], lines: group, subtotal: floors.length ? null : `${formatAmount(sum, currency)}${period}`, floorNote: null }];
    }
    const top = floorPrices.reduce((best, item) => ((item.price.kind === "amount" ? item.price.amount : 0) > (best.price.kind === "amount" ? best.price.amount : 0) ? item : best));
    const floor = top.price.kind === "amount" ? top.price.amount : 0;
    const charges = `${formatAmount(sum, currency)}${period}`;
    const floorNote =
      sum >= floor
        ? `${top.line.label} is a floor, not added: the charges come to ${charges}, above it.`
        : `The charges come to ${charges}, below ${top.line.label}, so the minimum applies.`;
    return [{ basis, title: BASIS_TITLE[basis], lines: group, subtotal: `${formatAmount(Math.max(sum, floor), currency)}${period}`, floorNote }];
  });
}
