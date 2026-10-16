import { describe, expect, it } from "vitest";
import { moneyTokens } from "@/lib/pricing/money";
import { hardChecks, removeSentence, renderPrices, reviewSummary, supportFromRefs } from "./review";

const context = {
  allowedMoney: new Set(moneyTokens("Revenue was RM4.954 billion in 2025.")),
  costMoney: new Set(moneyTokens("RM 1,100 RM 8,000")),
  nonPublicNames: ["Core banking data migration", "Bank Seri Mutiara"],
};

describe("renderPrices (invariant 1)", () => {
  it("fills placeholders from the approved lines, and never invents one", () => {
    const { text, unknown } = renderPrices("Landing zone: {{price:pl_1}}. Migration: {{price:pl_9}}.", [{ id: "pl_1", valueText: "RM 18,000" }]);
    expect(text).toBe("Landing zone: RM 18,000. Migration: on quote.");
    expect(unknown).toEqual(["pl_9"]);
  });

  it("shows a computed total next to a per-unit price", () => {
    expect(renderPrices("{{price:pl_2}}", [{ id: "pl_2", valueText: "RM 380 / VM", total: "RM 22,800" }]).text).toBe("RM 380 / VM (RM 22,800)");
  });
});

describe("hardChecks (FR-WRI-8)", () => {
  it("lets placeholders and sourced research figures through", () => {
    expect(hardChecks("We quote {{price:pl_1}} for a company with RM4.954 billion in revenue.", context)).toEqual({ priceNotFromGraph: [], costLeak: [], nonPublic: [] });
  });

  it("flags a price the model typed itself", () => {
    expect(hardChecks("The landing zone costs RM 18,000.", context).priceNotFromGraph).toEqual(["MYR18000"]);
  });

  it("hard-blocks a cost value, even written differently", () => {
    expect(hardChecks("Our consultant costs us RM1,100 a day.", context).costLeak).toEqual(["MYR1100"]);
  });

  it("hard-blocks a non-public result or client name", () => {
    expect(hardChecks("We delivered a core banking data migration last year.", context).nonPublic).toEqual(["Core banking data migration"]);
  });
});

describe("supportFromRefs", () => {
  const known = new Set(["c:snapshot_1", "o:off_gcm", "n:note_1"]);
  it("needs a known ref to count as supported", () => {
    expect(supportFromRefs(["c:snapshot_1"], known)).toBe("research");
    expect(supportFromRefs(["o:off_gcm"], known)).toBe("offering");
    expect(supportFromRefs(["n:note_1"], known)).toBe("seller");
    expect(supportFromRefs(["o:made_up"], known)).toBe("neither");
    expect(supportFromRefs([], known)).toBe("neither");
  });
});

describe("removeSentence (Gate D)", () => {
  it("removes a flagged sentence from a paragraph", () => {
    expect(removeSentence("We know retail. We are ISO 27001 certified. We start fast.", "We are ISO 27001 certified.")).toBe("We know retail. We start fast.");
  });

  it("removes a bullet that held only the flagged claim", () => {
    expect(removeSentence("- Landing zone\n- We are ISO 27001 certified.\n- Migration waves", "We are ISO 27001 certified.")).toBe("- Landing zone\n- Migration waves");
  });

  it("returns null when the sentence isn't there word for word", () => {
    expect(removeSentence("Something else entirely.", "We are ISO 27001 certified.")).toBeNull();
  });
});

describe("reviewSummary (FR-WRI-5)", () => {
  it("counts backed claims, seller statements and open ones", () => {
    const claim = (support: "research" | "offering" | "seller" | "neither", decision?: "accept_as_seller" | "remove") => ({ id: "x", blockId: "b", text: "t", support, refs: [], ...(decision ? { decision } : {}) });
    expect(reviewSummary([claim("research"), claim("offering"), claim("neither", "accept_as_seller"), claim("neither", "remove")])).toBe("3 claims: 2 research or offering, 1 seller statement");
    expect(reviewSummary([claim("research"), claim("neither")])).toBe("2 claims: 1 research or offering, 1 unsupported");
  });
});
