import { describe, expect, it } from "vitest";
import type { WebSource } from "@/lib/schema";
import { byteToCharIndex, citedSources, cutClaims, sentenceSpans } from "./claims";

const NOW = "2026-10-15T09:00:00+08:00";
const bytes = (text: string, fragment: string) => {
  const start = Buffer.byteLength(text.slice(0, text.indexOf(fragment)), "utf8");
  return { startIndex: start, endIndex: start + Buffer.byteLength(fragment, "utf8") };
};

describe("sentenceSpans", () => {
  it("doesn't split after initials or company abbreviations", () => {
    const text = "Mr. D.I.Y. Group sells hardware. It runs 1,300 stores. Mynews Sdn. Bhd. is listed.";
    const sentences = sentenceSpans(text).map(({ start, end }) => text.slice(start, end));
    expect(sentences).toEqual(["Mr. D.I.Y. Group sells hardware.", "It runs 1,300 stores.", "Mynews Sdn. Bhd. is listed."]);
  });

  it("doesn't split inside a decimal number or a domain", () => {
    const text = "Revenue rose to RM1.69 billion in 2025. It moved to mrdiy.com in 2024! Is that all?";
    const sentences = sentenceSpans(text).map(({ start, end }) => text.slice(start, end));
    expect(sentences).toEqual(["Revenue rose to RM1.69 billion in 2025.", "It moved to mrdiy.com in 2024!", "Is that all?"]);
  });
});

describe("byteToCharIndex", () => {
  it("maps UTF-8 byte offsets to string positions", () => {
    const text = "Kedai — 42 cawangan. Café opens.";
    const { startIndex } = bytes(text, "Café");
    expect(text.slice(byteToCharIndex(text, startIndex))).toBe("Café opens.");
  });
});

describe("cutClaims (FR-RES-2, invariant 3)", () => {
  const text = "Anjung operates 42 stores — mostly in the Klang Valley. It was founded in 1998. Its customers love it.";
  const input = {
    parts: [text],
    supports: [
      { segment: bytes(text, "Anjung operates 42 stores — mostly in the Klang Valley"), groundingChunkIndices: [0] },
      { segment: bytes(text, "founded in 1998"), groundingChunkIndices: [1, 0] },
    ],
    chunks: [{ web: { uri: "https://redirect/a", title: "thestar.com.my", domain: "thestar.com.my" } }, { web: { uri: "https://redirect/b", title: "wikipedia.org" } }],
  };

  it("keeps only supported sentences, each with its sources, and counts the rest", () => {
    const index = new Map<string, WebSource>();
    const { claims, dropped } = cutClaims("snapshot", input, index, ["anjung stores"], NOW);
    expect(claims.map((claim) => claim.text)).toEqual(["Anjung operates 42 stores — mostly in the Klang Valley.", "It was founded in 1998."]);
    expect(claims[1].sourceIds.sort()).toEqual(["src_1", "src_2"]);
    expect(dropped).toBe(1);
  });

  it("stores the grounding link exactly as given", () => {
    const index = new Map<string, WebSource>();
    cutClaims("snapshot", input, index, [], NOW);
    expect([...index.values()].map((source) => source.groundingUri)).toEqual(["https://redirect/a", "https://redirect/b"]);
    expect(index.get("https://redirect/b")?.domain).toBe("wikipedia.org");
  });

  it("drops everything when there is no grounding at all", () => {
    const { claims, dropped } = cutClaims("news", { parts: [text], supports: [], chunks: [] }, new Map(), [], NOW);
    expect(claims).toEqual([]);
    expect(dropped).toBe(3);
  });

  it("shares sources across sections and keeps only the cited ones", () => {
    const index = new Map<string, WebSource>();
    const a = cutClaims("snapshot", input, index, [], NOW);
    const b = cutClaims("news", input, index, [], NOW);
    expect(index.size).toBe(2);
    expect(Object.keys(citedSources([...a.claims, ...b.claims], index)).sort()).toEqual(["src_1", "src_2"]);
  });
});
