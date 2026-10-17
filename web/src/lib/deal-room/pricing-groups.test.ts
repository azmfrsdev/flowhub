import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { SAMPLES } from "@/lib/sample";
import type { FitOutput, PriceLineRef } from "@/lib/schema";
import { copyPriceLines } from "./fit";
import { pricingGroups } from "./pricing-groups";

/** The Trassoq eval (PRD 12 v3.1): option A buys, option B leases. Its copied prices are checked in samples.test.ts. */
type FixtureLine = { option?: "buy" | "lease"; ref: PriceLineRef; quantity?: number; total?: string };
const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../fixtures/opportunities/trassoq-mahligai-university.json"), "utf8")) as {
  expect: { pricing: { lines: FixtureLine[]; onQuote: FixtureLine[] } };
};
const { lines: expected, onQuote } = fixture.expect.pricing;
const buy = expected.filter((line) => line.option === "buy");
const lease = expected.filter((line) => line.option === "lease");

function priced(sample: (typeof SAMPLES)[keyof typeof SAMPLES], items: FixtureLine[]) {
  const graph: WorkspaceGraph = { ...sample.graph, documents: sample.documents };
  const selections = items.map(({ ref, quantity }) => ({ ref, ...(quantity ? { quantity: { value: quantity, claimId: "eval" } } : {}) }));
  return copyPriceLines(graph, selections, sample.graph.workspace.currency).lines;
}
const trassoq = (items: FixtureLine[]) => priced(SAMPLES["trassoq"], items);
const byBasis = (groups: ReturnType<typeof pricingGroups>) => Object.fromEntries(groups.map((group) => [group.basis, group]));

describe("pricingGroups (FR-FIT-5c)", () => {
  it("adds per-unit lines with a calculated total to the one-time subtotal, leaving On quote out", () => {
    const groups = byBasis(pricingGroups(trassoq([...buy, ...onQuote])));
    expect(groups.one_time.subtotal).toBe("RM 1,479,620");
    expect(groups.one_time.lines.map((line) => line.total)).toEqual(buy.flatMap((line) => (line.total ? [line.total] : [])));
    expect(groups.one_time.lines.some((line) => line.unpriced)).toBe(false);
    // "Waived" has no quantity total, so it stays with the quoted lines, which are never summed.
    expect(groups.variable.lines.map((line) => line.valueText)).toEqual(["Waived", "On quote", "On quote"]);
    expect(groups.variable.subtotal).toBeNull();
    expect(groups.recurring).toBeUndefined();
  });

  it("subtotals the lease's monthly lines in their period", () => {
    const groups = pricingGroups(trassoq(lease));
    expect(groups.map(({ basis, subtotal }) => ({ basis, subtotal }))).toEqual([{ basis: "recurring", subtotal: "RM 100,230 / month" }]);
  });

  it("never adds the buy and lease options together", () => {
    const groups = byBasis(pricingGroups(trassoq([...buy, ...lease, ...onQuote])));
    expect(groups.one_time.subtotal).toBe("RM 1,479,620");
    expect(groups.recurring.subtotal).toBe("RM 100,230 / month");
    expect(groups.recurring.lines).toHaveLength(lease.length);
    expect(groups.variable.subtotal).toBeNull();
  });

  it("keeps per-unit lines without a quantity unsummed", () => {
    const groups = pricingGroups(trassoq(buy.map(({ ref }) => ({ ref }))));
    expect(groups.map(({ basis, subtotal }) => ({ basis, subtotal }))).toEqual([{ basis: "variable", subtotal: null }]);
  });

  it("keeps man-day lines unsummed, even with a quantity, next to a one-time subtotal", () => {
    const olvessa = SAMPLES["olvessa"].graph;
    const card = olvessa.rateCards.find((item) => item.id === "rc_gcm")!;
    const days = olvessa.feeSchedules.find((item) => item.id === "fs_gcm_days")!;
    const lines = priced(SAMPLES["olvessa"], [
      { ref: { kind: "cell", cardId: card.id, rowId: "row_dw", colId: "col_gro", rev: card.rev } },
      { ref: { kind: "cell", cardId: card.id, rowId: "row_lz", colId: "col_gro", rev: card.rev } },
      { ref: { kind: "fee", scheduleId: days.id, lineId: "ln_con", rev: days.rev }, quantity: 20 },
      { ref: { kind: "fee", scheduleId: days.id, lineId: "ln_arc", rev: days.rev } },
    ]);
    const groups = byBasis(pricingGroups(lines));
    expect(groups.one_time.subtotal).toBe("RM 27,500");
    expect(groups.variable.lines.map((line) => line.label)).toEqual(["Consultant", "Solution architect"]);
    expect(groups.variable.subtotal).toBeNull();
  });

  it("leaves a total that still names a unit or a period out of the one-time group", () => {
    const line = (id: string, total: string): FitOutput["pricing"]["lines"][number] => ({
      id,
      ref: { kind: "fee", scheduleId: "fs_x", lineId: id, rev: 1 },
      label: id,
      valueText: "RM 10 / device",
      basis: "variable",
      total,
      unpriced: false,
    });
    const groups = pricingGroups([line("a", "RM 500"), line("b", "RM 500 / month"), line("c", "RM 500 / VM")]);
    expect(groups.map(({ basis, lines }) => [basis, lines.map((item) => item.id)])).toEqual([
      ["one_time", ["a"]],
      ["variable", ["b", "c"]],
    ]);
  });
});
