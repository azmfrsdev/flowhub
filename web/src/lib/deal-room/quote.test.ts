import { describe, expect, it } from "vitest";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { SAMPLES } from "@/lib/sample";
import type { FitOutput, QuoteLine } from "@/lib/schema";
import { checkScope, currentPrice, lineAmount, linesFromFit, minimumDeal, quoteChecks, quoteNumber, quoteSettings, quoteTotals } from "./quote";
import { renderQuoteHtml } from "./quote-html";

const graph: WorkspaceGraph = { ...SAMPLES.olvessa.graph, documents: SAMPLES.olvessa.documents };
const DAY = "2026-11-11";

const fitLine = (over: Partial<FitOutput["pricing"]["lines"][number]>): FitOutput["pricing"]["lines"][number] => ({
  id: "pl_1",
  ref: { kind: "cell", cardId: "rc_gcm", rowId: "row_lz", colId: "col_gro", rev: 1 },
  label: "Landing zone setup, Growth",
  valueText: "RM 18,000",
  basis: "one_time",
  unpriced: false,
  ...over,
});

const pricing: FitOutput["pricing"]["lines"] = [
  fitLine({}),
  fitLine({ id: "pl_2", ref: { kind: "cell", cardId: "rc_gcm", rowId: "row_wm", colId: "col_gro", rev: 1 }, label: "Workload migration, Growth", valueText: "RM 380 / VM, min 50 VMs", basis: "variable", quantity: { value: 140, claimId: "c1" } }),
  fitLine({ id: "pl_3", ref: { kind: "cell", cardId: "rc_gcm", rowId: "row_ms", colId: "col_gro", rev: 1 }, label: "Managed support, Growth", valueText: "RM 4,500 / month", basis: "recurring" }),
  fitLine({ id: "pl_4", ref: { kind: "fee", scheduleId: "fs_gcm_addons", lineId: "ln_pt", rev: 1 }, label: "Penetration test", valueText: "On quote", basis: "variable", unpriced: true }),
  fitLine({ id: "pl_5", ref: { kind: "cell", cardId: "rc_gcm", rowId: "row_mp", colId: "col_gro", rev: 1 }, label: "Migration plan, Growth", valueText: "Included" }),
];

describe("quoteSettings (FR-QUO-3)", () => {
  it("defaults by country, and uses Settings when set", () => {
    expect(quoteSettings({ country: "MY" })).toEqual({ taxLabel: "SST", taxRate: 8, maxDiscount: 10 });
    expect(quoteSettings({ country: "SG" }).taxRate).toBe(9);
    expect(quoteSettings({ country: "TH" }).taxRate).toBe(0);
    expect(quoteSettings({ country: "MY", quotes: { taxLabel: "SST", taxRate: 6, maxDiscount: 15 } }).maxDiscount).toBe(15);
  });
});

describe("lines and totals by code (FR-QUO-2, FR-QUO-3)", () => {
  const lines = linesFromFit(pricing, "MYR");

  it("starts from the fit map's copied prices and quantities", () => {
    expect(lines.map((line) => [line.valueText, line.quantity, line.quantityFrom])).toEqual([
      ["RM 18,000", null, "default"],
      ["RM 380 / VM, min 50 VMs", 140, "fit"],
      ["RM 4,500 / month", null, "default"],
      ["On quote", null, "default"],
      ["Included", null, "default"],
    ]);
  });

  it("works out amounts with minimums, and keeps recurring apart", () => {
    expect(lineAmount(lines[1]!, "MYR")).toMatchObject({ amount: 53200, recurring: null });
    expect(lineAmount({ ...lines[1]!, quantity: 20 }, "MYR").amount).toBe(19000);
    expect(lineAmount(lines[2]!, "MYR")).toMatchObject({ amount: 4500, recurring: "month" });
    expect(lineAmount(lines[3]!, "MYR")).toMatchObject({ text: "Price needed", amount: null });
    expect(lineAmount(lines[4]!, "MYR")).toMatchObject({ text: "Included", amount: 0 });
  });

  it("totals the one-off lines, then discount and tax; a left-out line counts for nothing", () => {
    const priced: QuoteLine[] = lines.map((line) => (line.unpriced ? { ...line, personPrice: "RM 12,000", personPriceBy: "Arif" } : line));
    const totals = quoteTotals(priced, 5, 8, "MYR");
    expect(totals).toMatchObject({ subtotal: 83200, discount: 4160, net: 79040, tax: 6323.2, total: 85363.2 });
    expect(totals.recurring).toEqual([{ period: "month", amount: 4500 }]);
    const without = quoteTotals(priced.map((line) => (line.id === "ql_2" ? { ...line, include: false } : line)), 0, 0, "MYR");
    expect(without.subtotal).toBe(30000);
  });
});

describe("a minimum charge on a quote", () => {
  it("raises its period to the floor and is never added", () => {
    const withFloor = linesFromFit(
      [...pricing, fitLine({ id: "pl_6", ref: { kind: "cell", cardId: "rc_x", rowId: "row_min", colId: "col_ent", rev: 1 }, label: "Minimum monthly fee, Enterprise", valueText: "RM 15,000 / month", basis: "recurring" })],
      "MYR",
    );
    expect(lineAmount(withFloor[5]!, "MYR").text).toBe("At least RM 15,000 / month");
    expect(quoteTotals(withFloor, 0, 0, "MYR").recurring).toEqual([{ period: "month", amount: 15000 }]);
    const big = withFloor.map((line) => (line.id === "ql_3" ? { ...line, valueText: "RM 20,000 / month" } : line));
    expect(quoteTotals(big, 0, 0, "MYR").recurring).toEqual([{ period: "month", amount: 20000 }]);
    expect(quoteTotals(big, 0, 0, "MYR").subtotal).toBe(quoteTotals(withFloor, 0, 0, "MYR").subtotal);
  });
});

describe("quoteChecks (FR-QUO-4)", () => {
  const lines = linesFromFit(pricing, "MYR");
  const quote = (over: Partial<{ lines: QuoteLine[]; discountPercent: number }>) => {
    const used = over.lines ?? lines;
    const discountPercent = over.discountPercent ?? 5;
    return { lines: used, discountPercent, maxDiscount: 10, totals: quoteTotals(used, discountPercent, 8, "MYR") };
  };
  const state = (checks: ReturnType<typeof quoteChecks>) => Object.fromEntries(checks.map((check) => [check.key, check.state]));

  it("blocks a missing On quote price, and passes once a person enters one", () => {
    expect(state(quoteChecks(quote({}), graph, "MYR", DAY)).on_quote).toBe("fail");
    const priced = lines.map((line) => (line.unpriced ? { ...line, personPrice: "RM 12,000", personPriceBy: "Arif" } : line));
    expect(state(quoteChecks(quote({ lines: priced }), graph, "MYR", DAY))).toEqual({ prices: "pass", on_quote: "pass", discount: "pass", minimum: "pass", totals: "pass", cost: "pass" });
  });

  it("blocks a discount over the limit", () => {
    expect(state(quoteChecks(quote({ discountPercent: 15 }), graph, "MYR", DAY)).discount).toBe("fail");
  });

  it("names a price that changed on the Pricing tab since Gate C", () => {
    const changed: WorkspaceGraph = {
      ...graph,
      rateCards: graph.rateCards.map((card) => (card.id === "rc_gcm" ? { ...card, cells: { ...card.cells, row_lz: { ...card.cells.row_lz, col_gro: { ...card.cells.row_lz!.col_gro!, value: "RM 19,500" } } } } : card)),
    };
    const check = quoteChecks(quote({}), changed, "MYR", DAY).find((item) => item.key === "prices")!;
    expect(check.state).toBe("fail");
    expect(check.detail).toContain("RM 18,000 → RM 19,500");
  });

  it("checks the company's minimum deal size", () => {
    expect(minimumDeal(graph)).toBe(20000);
    const small = lines.map((line) => ({ ...line, include: line.id === "ql_5" }));
    expect(state(quoteChecks(quote({ lines: small }), graph, "MYR", DAY)).minimum).toBe("fail");
  });

  it("reads today's price for a reference", () => {
    expect(currentPrice(graph, pricing[0]!.ref, DAY)).toBe("RM 18,000");
  });
});

describe("no cost on a quote (invariant 2)", () => {
  it("quote lines carry only sell-side fields", () => {
    const text = JSON.stringify(linesFromFit(pricing, "MYR"));
    const costs = graph.feeSchedules.flatMap((schedule) => schedule.lines.map((line) => line.cost ?? "")).filter(Boolean);
    for (const cost of costs) expect(text).not.toContain(cost);
    expect(text).not.toMatch(/"cost"|buyPrice|contacts/);
  });
});

describe("renderQuoteHtml (FR-QUO-6)", () => {
  it("prints the stored totals, the person's price, and nothing private", () => {
    const lines = linesFromFit(pricing, "MYR").map((line) => (line.unpriced ? { ...line, personPrice: "RM 12,000", personPriceBy: "Arif" } : line));
    const totals = quoteTotals(lines, 5, 8, "MYR");
    const quote = {
      id: "q1", number: "Q-2026-001", writeRunId: "w", fitRunId: "f", writeRev: 1, fitRev: 1, status: "approved", lines, discountPercent: 5,
      tax: { label: "SST", rate: 8 }, maxDiscount: 10, totals, checks: [], history: [], approvedBy: "Nadia", approvedAt: "2026-11-11T10:00:00+08:00",
      doc: null, rev: 3, createdAt: "2026-11-11T09:00:00+08:00", createdBy: "Arif", createdByUid: "u1",
    } as const;
    const html = renderQuoteHtml(quote as never, { seller: "Olvessa Cloud", prospect: "Pelita <Waris>", contact: null, date: "11 November 2026", validUntil: "11 December 2026" });
    expect(html).toContain("Quote Q-2026-001");
    expect(html).toContain("RM 85,363.20");
    expect(html).toContain("RM 12,000");
    expect(html).toContain("RM 4,500 per month");
    expect(html).toContain("Pelita &lt;Waris&gt;");
    expect(html).not.toMatch(/RM 1,200|RM 8,000 per test/);
  });
});

describe("checkScope and quoteNumber", () => {
  it("drops wording with an amount or a private result", () => {
    expect(checkScope("Networking, identity and billing guardrails.", "Landing zone", [])).toEqual({ scope: "Networking, identity and billing guardrails.", scopeFrom: "ai" });
    expect(checkScope("All this for RM 18,000.", "Landing zone", [])).toEqual({ scope: "Landing zone", scopeFrom: "code" });
    expect(checkScope("As we did in the core banking data migration.", "Landing zone", ["Core banking data migration."])).toEqual({ scope: "Landing zone", scopeFrom: "code" });
  });

  it("numbers quotes by year", () => {
    expect(quoteNumber(2026, 7)).toBe("Q-2026-007");
  });
});
