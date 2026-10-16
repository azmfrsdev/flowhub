import { describe, expect, it } from "vitest";
import { checkSummary, summaryIsCurrent } from "./notes-summary";

const notes = [
  { id: "abc", text: "Retail buyers sign when we show the 9-week migration plan.", at: "2026-10-10T09:00:00+08:00" },
  { id: "def", text: "Lost Bukit Damai on price: they had a quote at RM 120,000.", at: "2026-10-12T09:00:00+08:00" },
];

describe("checkSummary (FR-OFR-8)", () => {
  it("keeps lines that cite real notes and maps refs to note IDs", () => {
    const result = checkSummary([{ section: "sells", text: "A clear 9-week plan wins retail buyers.", refs: ["n1"] }], notes);
    expect(result).toEqual({ lines: [{ section: "sells", text: "A clear 9-week plan wins retail buyers.", noteIds: ["abc"] }], dropped: 0 });
  });

  it("drops a line that cites no real note", () => {
    expect(checkSummary([{ section: "watch", text: "Competitors are cutting prices.", refs: ["n9"] }], notes)).toEqual({ lines: [], dropped: 1 });
  });

  it("drops a line whose amount isn't written in the notes it cites", () => {
    const draft = [
      { section: "loses" as const, text: "We lose when a rival quotes RM 120,000.", refs: ["n2"] },
      { section: "loses" as const, text: "We lose when a rival quotes RM 100,000.", refs: ["n2"] },
      { section: "loses" as const, text: "We lose when a rival quotes RM 120,000.", refs: ["n1"] },
    ];
    const result = checkSummary(draft, notes);
    expect(result.lines.map((line) => line.noteIds)).toEqual([["def"]]);
    expect(result.dropped).toBe(2);
  });
});

describe("summaryIsCurrent", () => {
  const summary = { noteIds: ["abc", "def"], generatedAt: "2026-10-13T09:00:00+08:00" };
  it("is current for the same notes, and out of date once one is added or removed", () => {
    expect(summaryIsCurrent(summary, notes)).toBe(true);
    expect(summaryIsCurrent(summary, [notes[0]])).toBe(false);
    expect(summaryIsCurrent(summary, [...notes, { id: "ghi", text: "", at: "2026-10-14T09:00:00+08:00" }])).toBe(false);
  });
});
