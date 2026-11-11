import { describe, expect, it } from "vitest";
import type { FitOutput, RehearsalTurn } from "@/lib/schema";
import { approvedPrices } from "./prep";
import { REHEARSAL_LIMITS, buyerKnowledge, buyerOf, checkCoaching, checkTranscriptAmounts, rehearsalNotes, rehearsalOver } from "./rehearsal";

const line = (over: Partial<FitOutput["pricing"]["lines"][number]>): FitOutput["pricing"]["lines"][number] => ({
  id: "pl_1",
  ref: { kind: "rate", rateCardId: "rc_1", rowId: "row_lz", colId: "col_gro", rev: 1 },
  label: "Landing zone setup · Growth",
  valueText: "RM 18,000",
  basis: "one_time",
  unpriced: false,
  ...over,
} as FitOutput["pricing"]["lines"][number]);
const approved = approvedPrices({ pricing: { lines: [line({}), line({ id: "pl_2", label: "Managed support · Growth", valueText: "RM 4,500 / month", basis: "recurring" })] } });

const turn = (who: RehearsalTurn["who"], text: string, at: number): RehearsalTurn => ({ who, text, at });

describe("buyerKnowledge (FR-REH-2)", () => {
  const text = buyerKnowledge({
    seller: "Olvessa Cloud",
    presenter: "Nadia",
    prospect: "Pelita Waris Hospitals",
    buyer: { name: "Dr Farah Idris", role: "COO" },
    pushOn: ["price", "timing"],
    mood: "sceptical",
    claims: ["We moved 120 VMs for a retail chain in 9 weeks."],
    prices: approved.texts,
    probes: [{ need: "Network upgrade across four hospitals", kind: "outside", answer: "Partner Jentayu Networks covers network installation." }],
    openQuestions: ["Who on the board signs off IT spend?"],
  });

  it("holds only what the caller passes: claims, sell prices, gaps and questions", () => {
    expect(text).toContain("Dr Farah Idris, COO at Pelita Waris Hospitals");
    expect(text).toContain("RM 18,000");
    expect(text).toContain("Jentayu Networks");
    expect(text).toContain("Who on the board");
    expect(text).toContain("Price:");
    expect(text).toContain("Timing:");
    expect(text).not.toContain("Fit:");
  });

  it("never carries cost or buy-price wording of its own", () => {
    expect(text.toLowerCase()).not.toMatch(/\bcost price|buy price|margin\b/);
  });
});

describe("buyerOf", () => {
  it("uses the intake contact, or a generic decision-maker", () => {
    expect(buyerOf({ name: "Hafiz Rahman", role: "IT Manager" })).toEqual({ name: "Hafiz Rahman", role: "IT Manager" });
    expect(buyerOf({ name: "Hafiz Rahman" }).role).toBe("the decision-maker");
    expect(buyerOf(undefined).name).toBe("The decision-maker");
  });
});

describe("checkTranscriptAmounts (FR-REH-5)", () => {
  const turns = [
    turn("buyer", "What does the landing zone cost? I heard RM 12,000 elsewhere.", 5),
    turn("seller", "The landing zone is RM 18,000 at Growth.", 12),
    turn("seller", "Actually for you it's about RM 15,000, and support is RM 4,500 / month.", 40),
    turn("seller", "Again, RM 15,000.", 50),
  ];

  it("flags only the seller's unapproved amounts, once each, with the turn and time", () => {
    const flags = checkTranscriptAmounts(turns, approved);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ raw: "RM 15,000", turn: 2, at: 40 });
    expect(flags[0]?.approved.some((text) => text.includes("RM 18,000"))).toBe(true);
  });

  it("ignores amounts the buyer says", () => {
    expect(checkTranscriptAmounts([turns[0]!], approved)).toEqual([]);
  });
});

describe("checkCoaching (FR-REH-5)", () => {
  const evidence = new Map([["k1", { id: "cl_1", text: "We moved 120 VMs in 9 weeks." }]]);
  const draft = {
    mark: 8.4,
    landed: ["Led with the 120 VMs result.", "Quoted RM 18,000 confidently.", "Named the partner early."],
    fix: [
      { text: "Mention the core banking migration.", refs: ["k1"] },
      { text: "Ask who signs off.", refs: ["k9", "k1"] },
    ],
    unready: ["What happens to patient data during the cut-over?"],
    tip: "Slow down on the numbers.",
  };

  it("drops items with an amount or a private result, and resolves references", () => {
    const result = checkCoaching(draft, evidence, ["Core banking migration"], []);
    expect(result.landed).toEqual(["Led with the 120 VMs result.", "Named the partner early."]);
    expect(result.fix).toEqual([{ text: "Ask who signs off.", claimIds: ["cl_1"] }]);
    expect(result.dropped).toBe(2);
    expect(result.mark).toBe(8);
  });

  it("removes claim references the model wrote into the text", () => {
    const result = checkCoaching({ ...draft, landed: ["Handled the gap honestly (k9, k10).", "Named the guardrails (k13)."] }, evidence, [], []);
    expect(result.landed).toEqual(["Handled the gap honestly.", "Named the guardrails."]);
  });

  it("caps the mark at 6 when code flagged an amount, whatever the model said", () => {
    const result = checkCoaching(draft, evidence, [], [{ raw: "RM 15,000", turn: 2, at: 40, approved: [] }]);
    expect(result.modelMark).toBe(8);
    expect(result.mark).toBe(6);
  });
});

describe("rehearsalNotes (FR-REH-7)", () => {
  const numbers = [{ label: "One-off", value: "RM 30,000", money: true }];
  const probes = [{ need: "Network upgrade", kind: "outside" as const, answer: "Jentayu Networks covers it." }];

  it("uses the pitch prep when it exists, and the person's own notes", () => {
    const notes = rehearsalNotes({ opener: { text: "Open with the stores.", claimIds: [] }, points: [{ text: "One", claimIds: [] }, { text: "Two", claimIds: [] }] }, numbers, probes, "  Ask about the board.  ");
    expect(notes).toEqual({ opener: "Open with the stores.", points: ["One", "Two"], numbers, probes, own: "Ask about the board." });
  });

  it("still has the numbers and gaps without a pitch prep", () => {
    const notes = rehearsalNotes(null, numbers, probes, "");
    expect(notes.opener).toBeNull();
    expect(notes.points).toEqual([]);
    expect(notes.numbers).toEqual(numbers);
  });
});

describe("rehearsalOver (FR-REH-4)", () => {
  const start = "2026-11-11T10:00:00+08:00";
  it("stops at 10 minutes or 24 seller turns", () => {
    expect(rehearsalOver({ startedAt: start, turns: [] }, Date.parse(start) + 60_000)).toBeNull();
    expect(rehearsalOver({ startedAt: start, turns: [] }, Date.parse(start) + REHEARSAL_LIMITS.seconds * 1000)).toBe("time");
    const many = Array.from({ length: REHEARSAL_LIMITS.sellerTurns }, (_, index) => turn("seller", "ok", index));
    expect(rehearsalOver({ startedAt: start, turns: many }, Date.parse(start) + 1000)).toBe("turns");
  });
});
