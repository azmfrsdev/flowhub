import { describe, expect, it } from "vitest";
import { kelapaCloud, kelapaCloudDocuments } from "@/lib/sample/kelapa-cloud";
import { type WorkspaceGraph, marginPercent, offeringSummary, scopeRules, shortDocumentName, sourceLabel, startingPrice } from "./view";

const graph: WorkspaceGraph = { ...kelapaCloud, documents: kelapaCloudDocuments };

describe("startingPrice (FR-OFR-1)", () => {
  it("is the lowest one-off package price, not a man-day or per-unit rate", () => {
    expect(startingPrice(graph, "off_gcm", "MYR")).toEqual({ text: "From RM 6,000", detail: "Discovery workshop, Essentials" });
  });

  it("says On quote when nothing has an amount", () => {
    expect(startingPrice(graph, "off_ai", "MYR").text).toBe("On quote");
  });

  it("says so when an offering has no prices", () => {
    expect(startingPrice(graph, "no_such_offering", "MYR").text).toBe("No prices yet");
  });

  it("never reads a cost card", () => {
    const costOnly: WorkspaceGraph = { ...graph, rateCards: graph.rateCards.filter((card) => card.kind === "cost"), feeSchedules: [] };
    expect(startingPrice(costOnly, "off_gcm", "MYR").text).toBe("No prices yet");
  });
});

describe("marginPercent (FR-OFR-5)", () => {
  it("calculates from price and cost", () => {
    expect(marginPercent("RM 2,400", "RM 1,100", "MYR")).toBe(54);
  });

  it("refuses to compare different units, missing costs or quotes", () => {
    expect(marginPercent("RM 0.80 / GB", "RM 1,200", "MYR")).toBeNull();
    expect(marginPercent("RM 2,400", undefined, "MYR")).toBeNull();
    expect(marginPercent("On quote", "RM 8,000", "MYR")).toBeNull();
  });
});

describe("source chips", () => {
  const docs = new Map(kelapaCloudDocuments.map((doc) => [doc.id, doc]));

  it("shortens document names the way the chips show them", () => {
    expect(shortDocumentName("Sales deck 2026.pdf")).toBe("Sales deck");
    expect(shortDocumentName("Case studies 2025.pdf")).toBe("Case studies");
    expect(shortDocumentName("Past proposal, Teluk Logistik.pdf")).toBe("Past proposal");
  });

  it("adds the page", () => {
    expect(sourceLabel({ documentId: "doc_deck", locator: { page: 5 } }, docs)).toBe("Sales deck p.5");
  });
});

describe("offering summaries", () => {
  it("separates public from non-public results (invariant 5)", () => {
    const offering = graph.offerings.find((item) => item.id === "off_gcm")!;
    const summary = offeringSummary(graph, offering, "MYR");
    expect(summary.publicProof.every((item) => item.isPublic)).toBe(true);
    expect(summary.privateProof.every((item) => !item.isPublic)).toBe(true);
    expect(summary.subOfferings.map((child) => child.id).sort()).toEqual(["off_gcm_assess", "off_gcm_ops"]);
  });

  it("splits exclusions from company-wide rules", () => {
    const { notIncluded, companyWide } = scopeRules(graph, "off_gcm");
    expect(notIncluded.length).toBeGreaterThan(0);
    expect(companyWide.every((rule) => rule.offeringIds.length === 0)).toBe(true);
  });
});
