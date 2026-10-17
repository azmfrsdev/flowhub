import { describe, expect, it } from "vitest";
import { gmailComposeUrl, withLinks } from "@/lib/gmail";
import type { FitOutput } from "@/lib/schema";
import { type PrepDraft, approvedPrices, askEvidence, checkPracticeAmounts, checkPrepDraft, prepNumbers, sampleAnswers } from "./prep";

const evidence = new Map([
  ["k1", { id: "cl_1", text: "The group runs over 1,400 stores." }],
  ["k2", { id: "cl_2", text: "Dashboards bring stock and sales into one place." }],
]);

const line = (over: Partial<FitOutput["pricing"]["lines"][number]>): FitOutput["pricing"]["lines"][number] => ({
  id: "pl_1",
  ref: { kind: "fee", scheduleId: "fs_1", lineId: "fl_1", rev: 1 },
  label: "Reporting foundation",
  valueText: "RM 48,000",
  basis: "one_time",
  unpriced: false,
  ...over,
});
const fit: Pick<FitOutput, "gaps" | "mappings" | "cannotMeet" | "pricing"> = {
  gaps: [
    { id: "g_1", text: "One view of sales", priority: "high", origin: { kind: "intake", ref: "r1" } },
    { id: "g_2", text: "Store tablets", priority: "low", origin: { kind: "intake", ref: "r2" } },
  ],
  mappings: [{ gapId: "g_1", target: { type: "offering", id: "off_bq", rev: 1 }, strength: "strong", featureRefs: [], proofRefs: [] }],
  cannotMeet: [{ gapId: "g_2", constraint: { type: "constraint", id: "con_hw", rev: 1 } }],
  pricing: { lines: [line({}), line({ id: "pl_2", label: "Managed operations", valueText: "RM 3,500 / month", basis: "recurring" })] },
};

describe("checkPrepDraft (FR-PREP-1 to FR-PREP-3)", () => {
  const askRefs = askEvidence({ claims: [{ id: "c_1", text: "The group is expanding to 2,000 stores." }], questions: [] }, fit);
  const draft: PrepDraft = {
    opener: { text: "You're growing fast, and your data should keep up.", refs: ["k1"] },
    points: [
      { text: "One place for stock and sales.", refs: ["k2"] },
      { text: "It costs RM 48,000.", refs: ["k1"] },
      { text: "Unsupported point.", refs: [] },
    ],
    likely: [
      { question: "How long will it take?", why: "Timing matters", answer: "The dashboards bring stock and sales into one place.", refs: ["k2"], watch: "" },
      { question: "How much?", why: "Budget", answer: "About RM 40,000.", refs: ["k1"], watch: "" },
    ],
    ask: [
      { question: "Which stores open first?", why: "Rollout order", ref: "b1" },
      { question: "Made up?", why: "", ref: "b99" },
    ],
  };
  const checked = checkPrepDraft(draft, evidence, askRefs, ["Secret Client"]);

  it("keeps items that restate claims and drops amounts and unsupported items", () => {
    expect(checked.opener?.claimIds).toEqual(["cl_1"]);
    expect(checked.points.map((point) => point.text)).toEqual(["One place for stock and sales."]);
    expect(checked.likely.map((item) => item.question)).toEqual(["How long will it take?"]);
    expect(checked.dropped).toBe(4);
  });
  it("keeps a question to ask only when its research reference exists", () => {
    expect(checked.ask).toEqual([{ id: "a1", question: "Which stores open first?", why: "Rollout order", basis: "research", basisText: "The group is expanding to 2,000 stores." }]);
  });
});

describe("prepNumbers (FR-PREP-1)", () => {
  it("copies the subtotals from the pricing and counts the needs met", () => {
    const numbers = prepNumbers(fit);
    expect(numbers).toContainEqual({ label: "Needs we meet", value: "1 of 2", money: false });
    expect(numbers).toContainEqual({ label: "Outside what we offer", value: "1", money: false });
    expect(numbers.filter((number) => number.money).map((number) => number.value)).toEqual(expect.arrayContaining([expect.stringContaining("48,000")]));
  });
});

describe("checkPracticeAmounts (FR-PREP-4)", () => {
  const approved = approvedPrices(fit);
  it("flags an amount that isn't an approved price, once", () => {
    const flags = checkPracticeAmounts("It's RM 40,000, so RM40,000 all in.", approved);
    expect(flags).toHaveLength(1);
    expect(flags[0].raw).toBe("RM 40,000");
    expect(flags[0].approved.join(" ")).toContain("RM 48,000");
  });
  it("accepts the approved prices however they're written", () => {
    expect(checkPracticeAmounts("The foundation is RM48,000 and operations RM 3,500 a month.", approved)).toEqual([]);
  });
});

describe("sampleAnswers (FR-PREP-4, ADR-0016 D5)", () => {
  const prep = {
    numbers: [
      { label: "One-time", value: "RM 30,000", money: true },
      { label: "Recurring", value: "RM 9,000 / month", money: true },
      { label: "Needs we meet", value: "5 of 6", money: false },
    ],
    probes: [{ need: "Hardware supply or installation.", kind: "outside" as const, answer: "Outside what we offer." }],
  };
  const samples = sampleAnswers(prep, { answer: "The dashboards bring stock and sales into one place." });

  it("uses the suggested answer as the strong sample", () => {
    expect(samples.strong).toBe("The dashboards bring stock and sales into one place.");
  });
  it("makes the weak sample promise a need outside scope and state an amount that isn't approved", () => {
    expect(samples.weak).toContain("hardware supply or installation");
    expect(samples.weak).toContain("RM 24,000");
    const flags = checkPracticeAmounts(samples.weak, { texts: ["One-time: RM 30,000"], amounts: new Set(["MYR30000", "MYR9000"]) });
    expect(flags.map((flag) => flag.raw)).toEqual(["RM 24,000"]);
  });
});

describe("Gmail drafts (FR-SEND-1, ADR-0016 D1)", () => {
  it("fills in the recipient, subject and body, encoded", () => {
    const url = gmailComposeUrl({ to: "siti@example.com", subject: "Our proposal & next steps", body: "Hi Siti,\n\nThanks." }, "me@example.com");
    expect(url.startsWith("https://mail.google.com/mail/?view=cm&fs=1&authuser=me%40example.com&to=siti%40example.com&su=Our%20proposal%20%26%20next%20steps&body=")).toBe(true);
    expect(decodeURIComponent(url.split("&body=")[1])).toBe("Hi Siti,\n\nThanks.");
  });
  it("cuts a very long body short", () => {
    const url = gmailComposeUrl({ subject: "Long", body: "word ".repeat(3000) });
    expect(url.length).toBeLessThanOrEqual(7500);
    expect(decodeURIComponent(url.split("&body=")[1]).endsWith("…")).toBe(true);
  });
  it("splits a sign-off from the end of a long last paragraph and puts the links above it", () => {
    const text = withLinks(["Dear Team, thank you for your time today.", "Please let us know if you are free for a short call next week to walk through the details. Best regards, Aisyah"], [{ label: "The slides", url: "https://docs.google.com/p/1" }]);
    expect(text).toBe("Dear Team, thank you for your time today.\n\nPlease let us know if you are free for a short call next week to walk through the details.\n\nThe slides: https://docs.google.com/p/1\n\nBest regards, Aisyah");
  });
  it("puts the links above a short sign-off", () => {
    expect(withLinks(["Hi Siti,", "Here is the proposal.", "Best regards, Nadia"], [{ label: "The proposal", url: "https://docs.google.com/d/1" }])).toBe(
      "Hi Siti,\n\nHere is the proposal.\n\nThe proposal: https://docs.google.com/d/1\n\nBest regards, Nadia",
    );
  });
});
