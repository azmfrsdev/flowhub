import { describe, expect, it } from "vitest";
import { OfferingGraphExport, type SourceRef } from "@/lib/schema";
import { olvessa } from "@/lib/sample/olvessa";
import { moneyTokens, validateOperations, type GraphSnapshot } from "./validate";

const graph: GraphSnapshot = olvessa;
const source: SourceRef = { proposalId: "prop_test", locator: {} };

let n = 0;
const newId = () => `op_${++n}`;

function check(message: string, operations: unknown[]) {
  return validateOperations({ operations, graph, sourceText: message, source, requireEvidenceInSource: true, newId });
}

const priceChange = (after: string, extra: Record<string, unknown> = {}) => ({
  kind: "set_price_cell",
  rateCardId: "rc_gcm",
  rowId: "row_lz",
  colId: "col_gro",
  expectedRev: 1,
  before: "RM 18,000",
  after,
  evidence: "our Growth landing zone goes up to RM 19,500",
  ...extra,
});

const MESSAGE = "From 1 November our Growth landing zone goes up to RM 19,500.";

describe("sample data", () => {
  it("is a valid R12 export", () => {
    expect(() => OfferingGraphExport.parse(olvessa)).not.toThrow();
  });
});

describe("validateOperations: price changes (invariant 1)", () => {
  it("proposes a price that is written in the message, at the right place", () => {
    const [r] = check(MESSAGE, [priceChange("RM 19,500", { effectiveFrom: "2026-11-01" })]);
    expect(r.status).toBe("proposed");
    expect(r.path).toBe("Google Cloud migration › Pricing › Packages › Landing zone setup › Growth");
  });

  it("accepts formatting differences in the price but not a different number", () => {
    expect(check(MESSAGE, [priceChange("RM19500")])[0].status).toBe("proposed");
    const [r] = check(MESSAGE, [priceChange("RM 20,000")]);
    expect(r.status).toBe("dropped");
    expect(r.dropReason).toMatch(/isn't written in the source/);
  });

  it("drops a change to a private cost card", () => {
    const [r] = check("Landing zone cost is now RM 10,000", [
      { ...priceChange("RM 10,000"), rateCardId: "rc_gcm_cost", before: "RM 9,800", evidence: "Landing zone cost is now RM 10,000" },
    ]);
    expect(r.status).toBe("dropped");
    expect(r.dropReason).toMatch(/private/);
  });

  it("drops a change made against a stale revision", () => {
    const [r] = check(MESSAGE, [priceChange("RM 19,500", { expectedRev: 0 })]);
    expect(r.status).toBe("dropped");
    expect(r.dropReason).toMatch(/changed since/);
  });

  it("drops a change whose before value doesn't match the catalogue", () => {
    const [r] = check(MESSAGE, [priceChange("RM 19,500", { before: "RM 17,000" })]);
    expect(r.status).toBe("dropped");
  });

  it("drops a fee line price equal to that line's private cost", () => {
    const message = "Weekend cut-over is now RM 1,200";
    const [r] = check(message, [
      { kind: "set_fee_line_price", feeScheduleId: "fs_gcm_addons", lineId: "ln_wco", expectedRev: 1, before: "RM 3,000 per event", after: "RM 1,200", evidence: message },
    ]);
    expect(r.status).toBe("dropped");
    expect(r.dropReason).toMatch(/private cost/);
  });
});

describe("validateOperations: cost privacy (invariant 2)", () => {
  it("drops a note that would carry a cost amount", () => {
    const message = "Note for migration: our delivery cost for Growth landing zones is RM 9,800";
    const [r] = check(message, [
      { kind: "add_note", offeringId: "off_gcm", text: "Delivery cost for Growth landing zones is RM 9,800.", evidence: "our delivery cost for Growth landing zones is RM 9,800" },
    ]);
    expect(r.status).toBe("dropped");
    expect(r.dropReason).toMatch(/private cost/);
  });

  it("does not flag a real price that shares an amount with a cost", () => {
    const message = "Admin support for Workspace is now RM 1,300 / month";
    const [r] = check(message, [
      { kind: "set_fee_line_price", feeScheduleId: "fs_ws", lineId: "ln_adm", expectedRev: 1, before: "RM 1,200 / month", after: "RM 1,300 / month", evidence: message },
    ]);
    expect(r.status).toBe("proposed");
  });

  it("finds money amounts in text", () => {
    expect(moneyTokens("RM 1,200 / month and SGD 99.50")).toEqual(["MYR1200", "SGD99.5"]);
  });
});

describe("validateOperations: targets and evidence", () => {
  it("drops a change to an offering that doesn't exist", () => {
    const message = "Add proof: we moved a hospital in 4 weeks";
    const [r] = check(message, [
      { kind: "add_proof", proofKind: "case_study", title: "Hospital moved in 4 weeks", isPublic: true, offeringIds: ["off_missing"], evidence: "we moved a hospital in 4 weeks" },
    ]);
    expect(r.status).toBe("dropped");
  });

  it("drops a change whose evidence isn't in the message", () => {
    const [r] = check(MESSAGE, [priceChange("RM 19,500", { evidence: "Scale landing zone goes up to RM 19,500" })]);
    expect(r.status).toBe("dropped");
    expect(r.dropReason).toMatch(/aren't in your message/);
  });

  it("keeps an unreadable change visible as dropped", () => {
    const [r] = check(MESSAGE, [{ kind: "delete_everything", evidence: "x" }]);
    expect(r.status).toBe("dropped");
    expect(r.path).toBe("Unknown");
  });

  it("creates a told lead and its note, and removes unknown interests", () => {
    const message =
      "Met Farah Hanim today, Head of Operations at Anjung Serai Living. They want one view of store and online sales.";
    const results = check(message, [
      {
        kind: "create_opportunity",
        prospectName: "Anjung Serai Living",
        contact: { name: "Farah Hanim", role: "Head of Operations" },
        interestedOfferingIds: ["off_bq", "off_nope"],
        evidence: "Head of Operations at Anjung Serai Living",
      },
      { kind: "add_note", offeringId: "off_bq", text: "Anjung Serai Living wants one view of store and online sales.", evidence: "They want one view of store and online sales" },
    ]);
    expect(results.map((r) => r.status)).toEqual(["proposed", "proposed"]);
    const lead = results[0].op;
    expect(lead.kind === "create_opportunity" && lead.interestedOfferingIds).toEqual(["off_bq"]);
    expect(results[1].path).toBe("Data and analytics on BigQuery › Notes");
  });
});
