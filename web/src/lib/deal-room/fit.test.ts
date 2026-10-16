import { describe, expect, it } from "vitest";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { kelapaCloud, kelapaCloudDocuments } from "@/lib/sample/kelapa-cloud";
import { checkSellingRules, computeScore, copyPriceLines, graphOutline, pricingProjection, quantityStated } from "./fit";

const graph: WorkspaceGraph = { ...kelapaCloud, documents: kelapaCloudDocuments };

/** Every cost value in the sample: fee line costs, cost-card cells and partner buy prices. */
const costValues = [
  ...graph.feeSchedules.flatMap((schedule) => schedule.lines.flatMap((line) => (line.cost ? [line.cost] : []))),
  ...graph.rateCards.filter((card) => card.kind === "cost").flatMap((card) => Object.values(card.cells).flatMap((row) => Object.values(row).map((cell) => cell.value))),
  ...graph.partners.flatMap((partner) => (partner.buyPrice ? [partner.buyPrice] : [])),
];
const prices = new Set([
  ...graph.feeSchedules.flatMap((schedule) => schedule.lines.map((line) => line.price)),
  ...graph.rateCards.filter((card) => card.kind === "pricing").flatMap((card) => Object.values(card.cells).flatMap((row) => Object.values(row).map((cell) => cell.value))),
]);

describe("model projections never carry cost (invariant 2)", () => {
  it("the sample has cost values to leak, so this test means something", () => {
    expect(costValues.length).toBeGreaterThan(5);
  });

  it("the Fit Analyst's outline has no cost value and no price", () => {
    const json = JSON.stringify(graphOutline(graph));
    for (const cost of costValues) expect(json).not.toContain(cost);
    expect(json).not.toContain("rateCards");
    expect(json).not.toContain("buyPrice");
  });

  it("the pricing projection has prices but no cost value", () => {
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
    // Prices are copied whole, so compare whole values: "RM 8,000 per DB" is a price even though "RM 8,000" is a cost.
    const privateOnly = costValues.filter((value) => !prices.has(value));
    for (const offering of graph.offerings) {
      const projection = pricingProjection(graph, offering.id, "MYR");
      for (const value of strings(projection)) expect(privateOnly).not.toContain(value);
      expect(JSON.stringify(projection)).not.toMatch(/"cost"|"kind":"cost"|buyPrice/);
    }
  });
});

describe("checkSellingRules (FR-FIT-3)", () => {
  const rules = graph.constraints;

  it("flags a tobacco prospect against the planted industry rule", () => {
    const conflicts = checkSellingRules(rules, { country: "MY", text: "A regional tobacco distributor with 12 warehouses." });
    expect(conflicts.map((conflict) => conflict.constraint.kind)).toEqual(["industry"]);
  });

  it("flags a prospect outside the regions served", () => {
    expect(checkSellingRules(rules, { country: "ID", text: "A retailer in Jakarta." }).map((conflict) => conflict.constraint.kind)).toEqual(["region"]);
  });

  it("passes an ordinary Malaysian retailer", () => {
    expect(checkSellingRules(rules, { country: "MY", text: "A retail chain with 40 stores selling home goods." })).toEqual([]);
  });
});

describe("computeScore (ADR-0006 D4)", () => {
  const gaps = [
    { id: "g1", text: "Move servers", priority: "high" as const, origin: { kind: "intake" as const, ref: "r1" } },
    { id: "g2", text: "Dashboards", priority: "medium" as const, origin: { kind: "claim" as const, ref: "c1" } },
    { id: "g3", text: "Pen test", priority: "high" as const, origin: { kind: "intake" as const, ref: "r2" } },
  ];
  const mapping = (gapId: string, strength: "strong" | "partial" | "weak") => ({ gapId, target: { type: "offering" as const, id: "o", rev: 1 }, strength, featureRefs: [], proofRefs: [] });

  it("weights coverage by priority and strength", () => {
    const score = computeScore({ gaps, mappings: [mapping("g1", "strong"), mapping("g2", "partial"), mapping("g3", "strong")], cannotMeet: [] }, 0);
    // (3*1 + 2*0.6 + 3*1) / 8 = 90%
    expect(score).toEqual({ value: 90, band: "go", components: { coverage: 90, penalties: 0, techBonus: 0 } });
  });

  it("takes 15 points for a high-priority cannot-meet with no partner, but not when a partner covers it", () => {
    const base = { gaps, mappings: [mapping("g1", "strong"), mapping("g2", "strong")] };
    const constraint = { type: "constraint" as const, id: "c", rev: 1 };
    expect(computeScore({ ...base, cannotMeet: [{ gapId: "g3", constraint }] }, 0).components.penalties).toBe(15);
    expect(computeScore({ ...base, cannotMeet: [{ gapId: "g3", constraint, partner: { type: "partner", id: "p", rev: 1 } }] }, 0).components.penalties).toBe(0);
  });

  it("clamps and bands: Consider from 40, No-go below", () => {
    expect(computeScore({ gaps, mappings: [mapping("g1", "partial")], cannotMeet: [] }, 2).band).toBe("nogo");
    expect(computeScore({ gaps, mappings: [mapping("g1", "strong"), mapping("g2", "weak")], cannotMeet: [] }, 5).band).toBe("consider");
  });

  it("holds a deal that breaks a selling rule at No-go, until a person removes that gap (FR-FIT-4)", () => {
    const rule = { type: "constraint" as const, id: "con_ind", rev: 1 };
    const fit = { gaps, mappings: [mapping("g1", "strong"), mapping("g2", "strong")], cannotMeet: [{ gapId: "g3", constraint: rule, sellingRule: true }] };
    expect(computeScore(fit, 0)).toEqual({ value: 39, band: "nogo", components: { coverage: 63, penalties: 15, techBonus: 0, ruleCap: true } });
    // An exclusion on an offering is a penalty, not a cap.
    expect(computeScore({ ...fit, cannotMeet: [{ gapId: "g3", constraint: rule }] }, 0).band).toBe("consider");
    // Removed at Gate C: the gap is gone, so the cap lifts.
    expect(computeScore({ ...fit, gaps: gaps.filter((gap) => gap.id !== "g3") }, 0).band).toBe("go");
  });
});

describe("copyPriceLines (invariant 1)", () => {
  const card = graph.rateCards.find((item) => item.kind === "pricing" && item.offeringId === "off_gcm")!;
  const row = card.rows.find((r) => card.cells[r.id]?.col_gro)!;

  it("copies the price text exactly from the graph", () => {
    const { lines, rejected } = copyPriceLines(graph, [{ ref: { kind: "cell", cardId: card.id, rowId: row.id, colId: "col_gro", rev: card.rev } }], "MYR");
    expect(rejected).toEqual([]);
    expect(lines[0].valueText).toBe(card.cells[row.id].col_gro.value);
  });

  it("rejects refs that don't exist, are stale, or point at a cost card", () => {
    const costCard = graph.rateCards.find((item) => item.kind === "cost")!;
    const costRow = costCard.rows[0];
    const { lines, rejected } = copyPriceLines(
      graph,
      [
        { ref: { kind: "cell", cardId: card.id, rowId: "nope", colId: "col_gro", rev: card.rev } },
        { ref: { kind: "cell", cardId: card.id, rowId: row.id, colId: "col_gro", rev: card.rev + 1 } },
        { ref: { kind: "cell", cardId: costCard.id, rowId: costRow.id, colId: costCard.columns[0].id, rev: costCard.rev } },
      ],
      "MYR",
    );
    expect(lines).toEqual([]);
    expect(rejected).toHaveLength(3);
  });

  it("totals a per-unit price only when the parser reads both, and marks quotes unpriced", () => {
    const perVm = card.rows.find((r) => /\/ VM/.test(card.cells[r.id]?.col_gro?.value ?? ""))!;
    const { lines } = copyPriceLines(graph, [{ ref: { kind: "cell", cardId: card.id, rowId: perVm.id, colId: "col_gro", rev: card.rev }, quantity: { value: 60, claimId: "c1" } }], "MYR");
    expect(lines[0].basis).toBe("variable");
    expect(lines[0].total).toMatch(/^RM [\d,]+$/);
    const quoted = card.rows.find((r) => /quote/i.test(card.cells[r.id]?.col_sca?.value ?? ""));
    if (quoted) {
      const result = copyPriceLines(graph, [{ ref: { kind: "cell", cardId: card.id, rowId: quoted.id, colId: "col_sca", rev: card.rev } }], "MYR");
      expect(result.lines[0].unpriced).toBe(true);
    }
  });
});

describe("quantities are used only when their source states them (FR-FIT-5)", () => {
  it("finds the number however it's written", () => {
    expect(quantityStated(120, "Move all 120 VMs, with a plan we can roll back.")).toBe(true);
    expect(quantityStated(7400, "statutory payroll for all 7,400 workers")).toBe(true);
  });

  it("refuses a number the text doesn't contain, including one added up from others", () => {
    expect(quantityStated(130, "Move all 120 VMs")).toBe(false);
    expect(quantityStated(1120, "120 lab PCs and 1,000 laptops")).toBe(false);
    expect(quantityStated(12, "")).toBe(false);
  });
});
