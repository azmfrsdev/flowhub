import { describe, expect, it } from "vitest";
import { copyPriceLines } from "@/lib/deal-room/fit";
import { type WorkspaceGraph, priceOn } from "@/lib/offerings/view";
import { moneyTokens } from "@/lib/pricing/money";
import { olvessa, olvessaDocuments } from "@/lib/sample/olvessa";
import { costTokens, validateOperations } from "@/server/proposals/validate";
import { answerLines, calculate, fillPrices, resolveCites, typedMoney } from "./answer";
import { type ModelChange, askOutline, toOperations } from "./outline";

const graph: WorkspaceGraph = { ...olvessa, documents: olvessaDocuments };
const { outline, handles } = askOutline(graph);
const refFor = (rowId: string, colId: string) =>
  Object.entries(handles).find(([, handle]) => handle.kind === "cell" && handle.cardId === "rc_gcm" && handle.rowId === rowId && handle.colId === colId)![0];
const LZ_GROWTH = refFor("row_lz", "col_gro");
const WM_GROWTH = refFor("row_wm", "col_gro");
const DW_GROWTH = refFor("row_dw", "col_gro");
const DAY = "2026-10-15";

function tell(message: string, changes: ModelChange[]) {
  let n = 0;
  return validateOperations({
    operations: toOperations(changes, handles, graph),
    graph,
    sourceText: message,
    source: { proposalId: "pr_1", locator: {} },
    requireEvidenceInSource: true,
    newId: () => `op_${++n}`,
  });
}

describe("the Ask or tell outline (invariants 1, 2 and 5)", () => {
  const json = JSON.stringify(outline);

  it("carries no price and no cost: the model only sees line names", () => {
    // The only amounts allowed are in rules the seller wrote, like "RM 20,000 minimum per engagement".
    const ruleAmounts = new Set(graph.constraints.flatMap((rule) => moneyTokens(`${rule.statement} ${rule.insteadText ?? ""}`)));
    expect(moneyTokens(json).filter((token) => !ruleAmounts.has(token))).toEqual([]);
    for (const token of costTokens(graph)) expect(ruleAmounts.has(token)).toBe(false);
    expect(json).not.toMatch(/"cost"|buyPrice|"price"/);
  });

  it("names only public proof", () => {
    for (const proof of graph.proof) {
      if (proof.isPublic) expect(json).toContain(proof.title);
      else expect(json).not.toContain(proof.title);
    }
  });

  it("gives every pricing-card cell a handle, including ones not offered yet, and never a cost card", () => {
    expect(handles[LZ_GROWTH]).toMatchObject({ kind: "cell", label: "Landing zone setup, Growth", where: "Google Cloud migration › Pricing › Packages" });
    expect(Object.values(handles).some((handle) => handle.kind === "cell" && handle.cardId === "rc_gcm_cost")).toBe(false);
    const notOffered = outline.priceLines.find((line) => handles[line.ref].kind === "cell" && (handles[line.ref] as { rowId: string; colId: string }).rowId === "row_ms" && (handles[line.ref] as { colId: string }).colId === "col_ess");
    expect(notOffered?.offered).toBe(false);
  });
});

describe("tell: a price change (PRD 7.17 AC)", () => {
  const message = "From 1 November our Growth landing zone goes up to RM 19,500.";

  it("proposes exactly one change to that cell, with the before value and revision from the graph", () => {
    const checked = tell(message, [{ kind: "set_price", evidence: "our Growth landing zone goes up to RM 19,500", priceRef: LZ_GROWTH, newPrice: "RM 19,500", startsOn: "2026-11-01" }]);
    expect(checked).toHaveLength(1);
    expect(checked[0].status).toBe("proposed");
    expect(checked[0].path).toBe("Google Cloud migration › Pricing › Packages › Landing zone setup › Growth");
    expect(checked[0].href).toBe("/offerings/off_gcm/pricing");
    expect(checked[0].op).toMatchObject({ kind: "set_price_cell", rateCardId: "rc_gcm", rowId: "row_lz", colId: "col_gro", before: "RM 18,000", after: "RM 19,500", effectiveFrom: "2026-11-01" });
  });

  it("drops a price the person didn't write, such as a rounded one", () => {
    const checked = tell(message, [{ kind: "set_price", evidence: "our Growth landing zone goes up to RM 19,500", priceRef: LZ_GROWTH, newPrice: "RM 20,000" }]);
    expect(checked[0].status).toBe("dropped");
    expect(checked[0].dropReason).toContain("isn't written in the source");
  });

  it("drops a line the outline never named", () => {
    const checked = tell(message, [{ kind: "set_price", evidence: "our Growth landing zone goes up to RM 19,500", priceRef: "p999", newPrice: "RM 19,500" }]);
    expect(checked[0].status).toBe("dropped");
    expect(checked[0].dropReason).toBe("That rate card doesn't exist.");
  });

  it("drops a start date it can't read", () => {
    const checked = tell(message, [{ kind: "set_price", evidence: "our Growth landing zone goes up to RM 19,500", priceRef: LZ_GROWTH, newPrice: "RM 19,500", startsOn: "1 November" }]);
    expect(checked[0].status).toBe("dropped");
  });

  it("drops evidence that isn't in the message", () => {
    const checked = tell(message, [{ kind: "set_price", evidence: "the price rises next month", priceRef: LZ_GROWTH, newPrice: "RM 19,500" }]);
    expect(checked[0].dropReason).toBe("The words it rests on aren't in your message.");
  });

  it("lets a person's edited price through, since they vouch for it", () => {
    let n = 0;
    const [checked] = validateOperations({
      operations: toOperations([{ kind: "set_price", evidence: "our Growth landing zone goes up to RM 19,500", priceRef: LZ_GROWTH, newPrice: "RM 19,900" }], handles, graph),
      graph,
      sourceText: message,
      source: { locator: {} },
      requireEvidenceInSource: true,
      personEdited: new Set(["op_1"]),
      newId: () => `op_${++n}`,
    });
    expect(checked.status).toBe("proposed");
  });
});

describe("tell: a new lead (FR-ASK-7)", () => {
  const message = "Met Farah Hanim, Head of Operations at Anjung Serai Living. They want one view of store and online sales.";
  const lead = {
    kind: "create_opportunity" as const,
    evidence: "Met Farah Hanim, Head of Operations at Anjung Serai Living",
    prospectName: "Anjung Serai Living",
    contactName: "Farah Hanim",
    contactRole: "Head of Operations",
    interestedOfferingIds: ["off_bq", "off_nope"],
    summary: "They want one view of store and online sales.",
  };

  it("creates the opportunity and a note linked to it", () => {
    const checked = tell(message, [lead, { kind: "add_note", evidence: "They want one view of store and online sales", offeringId: "off_bq", linkToNewOpportunity: true, text: "Anjung Serai Living wants one view of store and online sales." }]);
    expect(checked.map((item) => item.status)).toEqual(["proposed", "proposed"]);
    expect(checked[0].op).toMatchObject({ kind: "create_opportunity", prospectName: "Anjung Serai Living", contact: { name: "Farah Hanim", role: "Head of Operations" }, interestedOfferingIds: ["off_bq"] });
    expect(checked[1].op).toMatchObject({ kind: "add_note", offeringId: "off_bq", opportunityRef: "new_opportunity" });
    expect(checked[1].path).toBe("Data and analytics on BigQuery › Notes");
  });

  it("removes a website or contact the message doesn't contain", () => {
    const [checked] = tell(message, [{ ...lead, website: "anjungserailiving.com.my", contactName: "Farah Binti Hanim", contactEmail: "farah@example.com" }]);
    expect(checked.status).toBe("proposed");
    expect(checked.op).not.toHaveProperty("website", expect.anything());
    expect(checked.op).not.toHaveProperty("contact", expect.anything());
  });

  it("keeps a website the message gives", () => {
    const [checked] = tell(`${message} Their site is www.anjungserai.example.`, [{ ...lead, website: "https://anjungserai.example" }]);
    expect(checked.op).toMatchObject({ website: "https://anjungserai.example" });
  });

  it("drops a lead whose company isn't named in the message", () => {
    const [checked] = tell(message, [{ ...lead, prospectName: "Serai Holdings" }]);
    expect(checked.dropReason).toBe("The company's name isn't in your message.");
  });
});

describe("ask: prices copied and sums calculated by code (FR-ASK-8)", () => {
  it("copies the line and calculates the total for 80 VMs", () => {
    const { lines } = answerLines([{ ref: WM_GROWTH, quantity: 80 }], handles, graph, "MYR", DAY);
    expect(lines).toEqual([
      expect.objectContaining({ label: "Workload migration, Growth", valueText: "RM 380 / VM, min 50 VMs", calc: "80 × RM 380 = RM 30,400", offeringId: "off_gcm" }),
    ]);
  });

  it("applies and says the minimum quantity", () => {
    expect(calculate("RM 380 / VM, min 50 VMs", 20, "MYR")?.text).toBe("The minimum is 50 VMs: 50 × RM 380 = RM 19,000");
  });

  it("adds up one-off lines, and won't add a per-unit line with no quantity", () => {
    expect(answerLines([{ ref: LZ_GROWTH }, { ref: DW_GROWTH }], handles, graph, "MYR", DAY).total).toBe("RM 27,500");
    expect(answerLines([{ ref: LZ_GROWTH }, { ref: WM_GROWTH }], handles, graph, "MYR", DAY).total).toBeUndefined();
    expect(answerLines([{ ref: LZ_GROWTH }, { ref: WM_GROWTH, quantity: 80 }], handles, graph, "MYR", DAY).total).toBe("RM 48,400");
  });

  it("leaves out handles it doesn't know", () => {
    expect(answerLines([{ ref: "p999" }], handles, graph, "MYR", DAY)).toEqual({ lines: [], unknown: ["p999"] });
  });

  it("fills price slots from the copied text", () => {
    expect(fillPrices(`Workload migration on Growth is {{price:${WM_GROWTH}}}.`, (ref) => (ref === WM_GROWTH ? "RM 380 / VM, min 50 VMs" : null))).toBe("Workload migration on Growth is RM 380 / VM, min 50 VMs.");
  });

  it("catches an amount the model typed, and any private cost", () => {
    const costs = costTokens(graph);
    expect(typedMoney(`It's {{price:${WM_GROWTH}}} per VM.`, "What's our Growth price?", costs)).toBe(false);
    expect(typedMoney("It's RM 380 per VM.", "What's our Growth price?", costs)).toBe(true);
    expect(typedMoney("Yes, RM 20,000 covers it.", "Is RM 20,000 enough?", costs)).toBe(false);
    const cost = graph.feeSchedules.flatMap((schedule) => schedule.lines).find((line) => line.cost)!.cost!;
    expect(typedMoney(`It costs us ${cost}.`, `Is it ${cost}?`, costs)).toBe(true);
  });

  it("cites only records the model may see", () => {
    const cites = resolveCites(["off_gcm", "prf_120vm", "prf_bank", "made_up"], graph);
    expect(cites.map((cite) => cite.id)).toEqual(["off_gcm", "prf_120vm"]);
    expect(cites[1].href).toBe("/offerings/off_gcm/sales");
  });
});

describe("scheduled prices (FR-ASK-6)", () => {
  const scheduled = { value: "RM 18,000", next: { value: "RM 19,500", from: "2026-11-01" } };

  it("keeps the old price until the start date", () => {
    expect(priceOn(scheduled, "2026-10-31")).toBe("RM 18,000");
    expect(priceOn(scheduled, "2026-11-01")).toBe("RM 19,500");
  });

  it("is what the Pricing step copies", () => {
    const card = graph.rateCards.find((item) => item.id === "rc_gcm")!;
    const withNext: WorkspaceGraph = {
      ...graph,
      rateCards: graph.rateCards.map((item) => (item.id === "rc_gcm" ? { ...item, cells: { ...item.cells, row_lz: { ...item.cells.row_lz, col_gro: { ...item.cells.row_lz.col_gro, next: scheduled.next } } } } : item)),
    };
    const ref = { kind: "cell" as const, cardId: "rc_gcm", rowId: "row_lz", colId: "col_gro", rev: card.rev };
    expect(copyPriceLines(withNext, [{ ref }], "MYR", "2026-10-31").lines[0].valueText).toBe("RM 18,000");
    expect(copyPriceLines(withNext, [{ ref }], "MYR", "2026-11-02").lines[0].valueText).toBe("RM 19,500");
  });
});
