import { describe, expect, it } from "vitest";
import type { WebSource } from "@/lib/schema";
import { briefHtml, byteToCharIndex, citedSources, cutClaims, keptBrief, sentenceSpans } from "./claims";

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

describe("keptBrief (FR-RES-3, Gate B)", () => {
  const claim = (id: string, removed?: boolean) => ({ id, section: "snapshot" as const, text: id, sourceIds: ["src_1"], ...(removed ? { removed } : {}) });
  const brief = {
    claims: [claim("c1"), claim("c2", true), claim("c3", true)],
    inferences: [
      { id: "inf_1", section: "needs" as const, text: "rests on a kept fact", basedOn: ["c1", "c2"] },
      { id: "inf_2", section: "sector" as const, text: "rests only on removed facts", basedOn: ["c2", "c3"] },
    ],
  };

  it("drops removed facts and any inference left with nothing to rest on", () => {
    const kept = keptBrief(brief);
    expect(kept.claims.map((item) => item.id)).toEqual(["c1"]);
    expect(kept.inferences).toEqual([{ ...brief.inferences[0], basedOn: ["c1"] }]);
    expect(kept.droppedInferences).toBe(1);
  });
});

describe("briefHtml (FR-RES-7)", () => {
  const source = (id: string, domain: string) => ({ id, groundingUri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`, title: domain, domain, retrievedAt: NOW, queries: [] });
  const brief = {
    claims: [
      { id: "c1", section: "snapshot" as const, text: "Runs 14 stores <in KL>.", sourceIds: ["s2"] },
      { id: "c2", section: "news" as const, text: "A removed fact.", sourceIds: ["s1"], removed: true },
    ],
    inferences: [{ id: "inf_1", section: "needs" as const, text: "Needs a faster checkout.", basedOn: ["c1"] }],
    sources: { s1: source("s1", "removed.example"), s2: source("s2", "kept.example") },
    questions: [],
    sellerNotes: [],
  };

  it("copies only kept facts, numbers their sources from 1, and labels inferences", () => {
    const html = briefHtml("Anjung", brief);
    expect(html).toContain("Runs 14 stores &lt;in KL&gt;. [1]");
    expect(html).not.toContain("A removed fact");
    expect(html).not.toContain("removed.example");
    expect(html).toContain("Likely needs (inference)");
    expect(html).toContain('href="https://vertexaisearch.cloud.google.com/grounding-api-redirect/s2"');
  });
});
