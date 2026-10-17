import { describe, expect, it } from "vitest";
import type { FitOutput } from "@/lib/schema";
import { olvessa } from "@/lib/sample/olvessa";
import { type DeckDraft, checkDeckDraft, clamp, deckFit, deckInvestment, deckProof, photoQuery } from "./deck";

const graph = olvessa;
const evidence = new Map([
  ["k1", { id: "cl_1", text: "The group operates over 1,400 stores across Malaysia and Brunei." }],
  ["k2", { id: "cl_2", text: "A landing zone and migration waves move workloads in about 8 to 10 weeks." }],
  ["k3", { id: "cl_3", text: "Dashboards bring stock and sales data into one reporting layer." }],
]);
const nonPublic = graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);
const empty = { text: "", refs: [] };
const draft = (overrides: Partial<DeckDraft> = {}): DeckDraft => ({
  heard: { standfirst: { text: "You run 1,400 stores on data spread across systems.", refs: ["k1"] }, today: [{ text: "Stock data sits in separate systems.", refs: ["k3"] }], change: [], closing: empty },
  deliver: { cards: [{ title: "Landing zone", text: "A secure base for every workload.", refs: ["k2"] }], closing: empty },
  plan: { phases: [{ name: "Migrate", detail: "Waves of workloads.", duration: "8 to 10 weeks", refs: ["k2"] }], closing: empty },
  next: { headline: "Start with a discovery workshop", steps: [{ text: "Agree the first migration wave.", refs: ["k2"] }] },
  notes: { heard: [{ header: "Line to land", bullets: ["They told us stock data is scattered.", "Our price is RM 48,000 for this."] }] },
  ...overrides,
});

describe("client deck text (FR-DECK-3)", () => {
  it("keeps items that restate a proposal claim, with their claim IDs", () => {
    const checked = checkDeckDraft(draft(), evidence, nonPublic);
    expect(checked.heard.standfirst).toEqual({ text: "You run 1,400 stores on data spread across systems.", claimIds: ["cl_1"] });
    expect(checked.deliver.cards[0]).toMatchObject({ title: "Landing zone", claimIds: ["cl_2"] });
  });

  it("drops an item with no claim behind it, an amount, or a private result, and counts it", () => {
    const privateTitle = graph.proof.find((item) => !item.isPublic)!.title;
    const checked = checkDeckDraft(
      draft({
        heard: { standfirst: { text: "Made up fact.", refs: ["k9"] }, today: [{ text: "Costs RM 12,000 a month today.", refs: ["k1"] }, { text: `Like ${privateTitle}.`, refs: ["k1"] }], change: [], closing: empty },
      }),
      evidence,
      nonPublic,
    );
    expect(checked.heard.standfirst).toBeNull();
    expect(checked.heard.today).toEqual([]);
    expect(checked.dropped).toBe(4); // three heard items and one note bullet with an amount
  });

  it("keeps a timeline duration only when its numbers are in a cited claim", () => {
    const kept = checkDeckDraft(draft(), evidence, nonPublic).plan.phases[0];
    expect(kept.duration).toBe("8 to 10 weeks");
    const guessed = checkDeckDraft(draft({ plan: { phases: [{ name: "Migrate", detail: "Waves.", duration: "6 weeks", refs: ["k2"] }], closing: empty } }), evidence, nonPublic).plan.phases[0];
    expect(guessed.duration).toBeUndefined();
    expect(guessed.name).toBe("Migrate");
  });

  it("removes speaker-note bullets that state an amount", () => {
    const notes = checkDeckDraft(draft(), evidence, nonPublic).notes.heard;
    expect(notes).toEqual([{ header: "Line to land", bullets: ["They told us stock data is scattered."] }]);
  });

  it("clamps text to its slot at a word boundary", () => {
    expect(clamp("one two three four five", 12)).toBe("one two…");
    expect(clamp("short", 12)).toBe("short");
  });
});

const fit: Pick<FitOutput, "gaps" | "mappings" | "cannotMeet"> = {
  gaps: [
    { id: "g1", text: "Move servers to the cloud", priority: "medium", origin: { kind: "intake", ref: "r1" } },
    { id: "g2", text: "One view of stock and sales", priority: "high", origin: { kind: "intake", ref: "r2" } },
    { id: "g3", text: "Penetration testing", priority: "low", origin: { kind: "intake", ref: "r3" } },
  ],
  mappings: [
    { gapId: "g1", target: { type: "offering", id: "off_gcm", rev: 1 }, strength: "strong", featureRefs: [], proofRefs: [{ id: "prf_120vm", isPublic: true }, { id: "prf_bank", isPublic: false }] },
    { gapId: "g2", target: { type: "feature", id: "f_sd", rev: 1 }, strength: "partial", featureRefs: [], proofRefs: [], customisation: "Custom stock dashboard" },
  ],
  cannotMeet: [{ gapId: "g3", constraint: { type: "constraint", id: "c1", rev: 1 }, partner: { type: "partner", id: "ptn_sempadan", rev: 1 } }],
};

describe("client deck facts built by code (FR-DECK-4)", () => {
  it("draws the fit from the fit map, high priority first, with names from the graph", () => {
    const deck = deckFit(fit, graph);
    expect(deck.needs.map((need) => need.text)).toEqual(["One view of stock and sales", "Move servers to the cloud"]);
    expect(deck.needs[0].offerings).toEqual([{ name: "Data and analytics on BigQuery", strength: "partial", note: "Custom stock dashboard" }]);
    expect(deck.outside).toEqual([{ need: "Penetration testing", partner: "Sempadan Security" }]);
  });

  it("never carries a partner's buy price (invariant 2)", () => {
    const json = JSON.stringify(deckFit(fit, graph));
    for (const partner of graph.partners) if (partner.buyPrice) expect(json).not.toContain(partner.buyPrice);
  });

  it("copies prices from the approved lines and keeps the proposal's groups (invariant 1)", () => {
    const lines: FitOutput["pricing"]["lines"] = [
      { id: "l1", ref: { kind: "fee", scheduleId: "s1", lineId: "a", rev: 1 } as never, label: "Landing zone", valueText: "RM 18,000", basis: "one_time", unpriced: false },
      { id: "l2", ref: { kind: "fee", scheduleId: "s1", lineId: "b", rev: 1 } as never, label: "Migration wave", valueText: "RM 6,000", basis: "one_time", unpriced: false },
      { id: "l3", ref: { kind: "fee", scheduleId: "s1", lineId: "c", rev: 1 } as never, label: "Managed operations", valueText: "RM 2,500 / month", basis: "recurring", unpriced: false },
    ];
    const deck = deckInvestment(lines);
    expect(deck.groups[0]).toEqual({ title: "One-time", lines: [{ label: "Landing zone", price: "RM 18,000" }, { label: "Migration wave", price: "RM 6,000" }], subtotal: "RM 24,000" });
    expect(deck.groups[1].lines[0].price).toBe("RM 2,500 / month");
  });

  it("shows only public results for the offerings in this deal (invariant 5)", () => {
    const proof = deckProof(fit, graph);
    const titles = proof.map((item) => item.title);
    const privateTitles = graph.proof.filter((item) => !item.isPublic).map((item) => item.title);
    expect(titles.length).toBeGreaterThan(0);
    for (const title of privateTitles) expect(titles).not.toContain(title);
    expect(titles[0]).toBe(graph.proof.find((item) => item.id === "prf_120vm")!.title);
    expect(titles).not.toContain(graph.proof.find((item) => item.id === "prf_450")!.title); // Workspace rollout isn't in this deal
  });

  it("keeps company names out of photo searches", () => {
    expect(photoQuery("MR DIY retail store aisle", ["MR D.I.Y. Group (M) Berhad", "Olvessa Cloud"])).toBe("retail store aisle");
    expect(photoQuery("modern data centre, servers!", ["Olvessa Cloud"])).toBe("modern data centre servers");
  });
});
