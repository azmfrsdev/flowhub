import { formatAmount, parsePrice } from "@/lib/pricing/parse";
import type { FitOutput } from "@/lib/schema";

type Line = FitOutput["pricing"]["lines"][number];

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
 * group so subtotals only ever add real amounts. Shared by the fit map and
 * the proposal's pricing table.
 */
export function pricingGroups(lines: Line[]) {
  return (["one_time", "recurring", "variable"] as const).flatMap((basis) => {
    const group = lines.filter((line) => groupOf(line) === basis && !(basis !== "variable" && line.unpriced));
    if (basis === "variable") group.push(...lines.filter((line) => groupOf(line) !== "variable" && line.unpriced));
    if (group.length === 0) return [];
    const parsed = group.map((line) => parsePrice(line.total ?? line.valueText));
    const amounts = parsed.flatMap((price) => (price.kind === "amount" ? [price] : []));
    const free = parsed.filter((price) => price.kind === "included" || price.kind === "waived").length;
    const summable =
      basis !== "variable" &&
      amounts.length > 0 &&
      amounts.length + free === group.length &&
      group.length > 1 &&
      amounts.every((price) => !price.per && price.currency === amounts[0].currency && (price.recurring ?? null) === (amounts[0].recurring ?? null));
    const subtotal = summable ? `${formatAmount(amounts.reduce((sum, price) => sum + price.amount, 0), amounts[0].currency)}${amounts[0].recurring ? ` / ${amounts[0].recurring}` : ""}` : null;
    return [{ basis, title: BASIS_TITLE[basis], lines: group, subtotal }];
  });
}
