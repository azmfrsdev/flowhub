import { describe, expect, it } from "vitest";
import { checkedSummary, inferenceTitle, shortLine } from "./brief-figures";

// Sentences and Gemini's lines from a live research run on 2026-11-17 (public news about a listed retailer).
describe("checkedSummary (FR-RES-8, ADR-0024)", () => {
  it("keeps a summary whose numbers and names are all in the sentence", () => {
    expect(checkedSummary("In 2024, the group generated 4.65 billion Malaysian Ringgit in annual revenue.", "RM4.65 billion annual revenue in 2024")).toBe("RM4.65 billion annual revenue in 2024");
    expect(
      checkedSummary(
        "In February 2026, the company reported that its net profit for the full year 2025 rose 11.2% to RM632.69 million on a 6.5% increase in revenue to RM4.95 billion.",
        "FY2025 net profit rose 11.2% to RM632.69M on RM4.95B revenue",
      ),
    ).toBe("FY2025 net profit rose 11.2% to RM632.69M on RM4.95B revenue");
    expect(checkedSummary("The company employed approximately 19,300 people.", "~19,300 staff")).toBe("~19,300 staff");
    expect(checkedSummary("DIY Club App.", "Launched DIY Club App")).toBe("Launched DIY Club App");
  });

  it("drops a summary with a number the sentence doesn't have", () => {
    // "Q3": the sentence says "third quarter", so 3 is not in it.
    expect(checkedSummary("By the third quarter of 2025, the company had 1,528 stores and employed approximately 19,300 people.", "1,528 stores and ~19,300 staff by Q3 2025")).toBeNull();
    expect(checkedSummary("It runs 140 stores.", "150 stores")).toBeNull();
  });

  it("drops a summary that changes a number's scale", () => {
    expect(checkedSummary("Revenue reached RM4.95 million.", "RM4.95B revenue")).toBeNull();
  });

  it("drops a summary with a name the sentence doesn't have, or longer than twelve words", () => {
    expect(checkedSummary("The retailer is hiring data analysts.", "Hiring data analysts in Penang")).toBeNull();
    expect(checkedSummary("It sells home goods.", "It sells home goods and hardware and toys and stationery and sports gear widely")).toBeNull();
  });
});

describe("shortLine", () => {
  it("shows the short line, or the first words of a fact without one", () => {
    expect(shortLine({ text: "It runs 140 stores.", short: "140 stores" })).toBe("140 stores");
    expect(shortLine({ text: "With 140 stores and 30 more coming, the group needs one view of stock." })).toBe("With 140 stores and 30 more coming, the group…");
  });
});

describe("inferenceTitle", () => {
  it("uses the title, or the first words of a brief made before titles", () => {
    expect(inferenceTitle({ title: "Thin margins", text: "Grocers compete on price." })).toBe("Thin margins");
    expect(inferenceTitle({ text: "With 140 stores and 30 more coming, they need one view of stock." })).toBe("With 140 stores and 30 more coming…");
  });
});
