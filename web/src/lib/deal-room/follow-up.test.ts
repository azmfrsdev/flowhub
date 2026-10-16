import { describe, expect, it } from "vitest";
import type { WriteOutput } from "@/lib/schema";
import { checkFollowUp, followUpEvidence, followUpText } from "./follow-up";

const claim = (id: string, text: string, support: WriteOutput["claims"][number]["support"], decision?: "accept_as_seller" | "remove"): WriteOutput["claims"][number] => ({ id, blockId: "b1", text, support, refs: [], ...(decision ? { decision } : {}) });

describe("followUpEvidence (C3)", () => {
  it("offers only backed or kept claims, and never one with a price or an amount", () => {
    const evidence = followUpEvidence({
      claims: [
        claim("c1", "We moved 120 VMs for a retail chain in 9 weeks.", "offering"),
        claim("c2", "An unsupported boast.", "neither"),
        claim("c3", "We answer within one working day.", "neither", "accept_as_seller"),
        claim("c4", "Landing zone setup is {{price:pl_1}}.", "offering"),
        claim("c5", "Their budget is around RM 300,000.", "research"),
        claim("c6", "A removed sentence.", "research", "remove"),
      ],
    });
    expect([...evidence.entries()]).toEqual([
      ["k1", { id: "c1", text: "We moved 120 VMs for a retail chain in 9 weeks." }],
      ["k2", { id: "c3", text: "We answer within one working day." }],
    ]);
  });
});

describe("checkFollowUp (C3)", () => {
  const evidence = new Map([["k1", { id: "c1" }]]);
  const draft = {
    subject: "Your Google Cloud migration proposal",
    paragraphs: [
      {
        sentences: [
          { text: "Thank you for meeting us on Tuesday.", kind: "courtesy" as const, refs: [] },
          { text: "We moved 120 VMs for a retail chain in 9 weeks.", kind: "claim" as const, refs: ["k1"] },
          { text: "We are ISO 27001 certified.", kind: "claim" as const, refs: [] },
          { text: "The Growth package is RM 18,000.", kind: "claim" as const, refs: ["k1"] },
          { text: "Like we did for Clinic Group X.", kind: "claim" as const, refs: ["k1"] },
        ],
      },
    ],
  };

  it("keeps courtesy and backed sentences, flags an unbacked claim, and removes amounts and private results", () => {
    const result = checkFollowUp(draft, evidence, ["Clinic Group X"], "Following up");
    expect(result.removed).toBe(2);
    expect(result.paragraphs[0].sentences).toEqual([
      { text: "Thank you for meeting us on Tuesday.", claimIds: [] },
      { text: "We moved 120 VMs for a retail chain in 9 weeks.", claimIds: ["c1"] },
      { text: "We are ISO 27001 certified.", claimIds: [], flagged: true },
    ]);
    expect(result.subject).toBe("Your Google Cloud migration proposal");
  });

  it("falls back to a plain subject when the model's states an amount", () => {
    expect(checkFollowUp({ ...draft, subject: "Your RM 18,000 proposal" }, evidence, [], "Following up").subject).toBe("Following up");
  });

  it("copies as plain text, subject first", () => {
    expect(followUpText({ subject: "Hello", paragraphs: [{ sentences: [{ text: "One.", claimIds: [] }, { text: "Two.", claimIds: [] }] }, { sentences: [{ text: "Three.", claimIds: [] }] }] })).toBe("Subject: Hello\n\nOne. Two.\n\nThree.");
  });
});
