import type { BriefOutput, Claim, WebSource } from "@/lib/schema";

/**
 * Claim cutting (ADR-0006 D2, FR-RES-2, invariant 3). A grounded answer is
 * split into sentences; a sentence becomes a claim only if a grounding
 * support overlaps it, and it carries that support's sources. Every other
 * sentence is dropped and counted, never shown. Pure and deterministic.
 */

export type GroundingInput = {
  parts: string[];
  supports: { segment?: { startIndex?: number; endIndex?: number; partIndex?: number }; groundingChunkIndices?: number[] }[];
  chunks: { web?: { uri?: string; title?: string; domain?: string } }[];
};

type Section = Claim["section"];

/** Grounding segments are byte offsets into UTF-8 text; JavaScript strings index UTF-16 units. */
export function byteToCharIndex(text: string, byteOffset: number): number {
  return Buffer.from(text, "utf8").subarray(0, Math.max(0, byteOffset)).toString("utf8").length;
}

const ABBREVIATION = /(?:\b[A-Z]\.){1,}$|\b(?:Mr|Mrs|Ms|Dr|Sdn|Bhd|Co|Inc|Ltd|No|St|Jr|Sr|vs|etc|e\.g|i\.e)\.$/;

/**
 * Sentence spans [start, end) in characters. A sentence ends at . ! or ?
 * followed by whitespace or the end, so "RM1.69" and "mrdiy.com" stay whole;
 * and not after initials or common abbreviations ("Mr. D.I.Y. Group …").
 */
export function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]+["'”’)\]]*(?=\s|$)|\n+/g)) {
    const at = match.index ?? 0;
    if (match[0].startsWith("\n")) {
      spans.push({ start, end: at });
      start = at + match[0].length;
      continue;
    }
    const end = at + match[0].length;
    if (ABBREVIATION.test(text.slice(start, end).trimEnd())) continue;
    spans.push({ start, end });
    start = end;
  }
  if (start < text.length) spans.push({ start, end: text.length });
  return spans
    .map(({ start, end }) => {
      const raw = text.slice(start, end);
      const lead = raw.length - raw.trimStart().length;
      return { start: start + lead, end: start + raw.trimEnd().length };
    })
    .filter(({ start, end }) => end > start);
}

const clean = (sentence: string) => sentence.replace(/\*\*|__|^[-*•]\s+/g, "").replace(/\s+/g, " ").trim();
const wordCount = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length;

function hostOf(uri: string, title?: string): string {
  if (title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title)) return title.toLowerCase();
  try {
    return new URL(uri).hostname;
  } catch {
    return title ?? "source";
  }
}

/**
 * Cuts one grounded section into claims. `sourceIndex` is shared across a
 * brief's sections so the same page becomes one source.
 */
export function cutClaims(
  section: Section,
  input: GroundingInput,
  sourceIndex: Map<string, WebSource>,
  queries: string[],
  now: string,
): { claims: Claim[]; dropped: number } {
  const claims: Claim[] = [];
  let dropped = 0;

  const chunkSource = (index: number): string | null => {
    const web = input.chunks[index]?.web;
    if (!web?.uri) return null;
    const existing = sourceIndex.get(web.uri);
    if (existing) return existing.id;
    const source: WebSource = {
      id: `src_${sourceIndex.size + 1}`,
      groundingUri: web.uri,
      title: web.title ?? hostOf(web.uri),
      domain: web.domain ?? hostOf(web.uri, web.title),
      retrievedAt: now,
      queries,
    };
    sourceIndex.set(web.uri, source);
    return source.id;
  };

  input.parts.forEach((text, partIndex) => {
    if (!text) return;
    const supports = input.supports
      .filter((support) => (support.segment?.partIndex ?? 0) === partIndex)
      .map((support) => ({
        start: byteToCharIndex(text, support.segment?.startIndex ?? 0),
        end: byteToCharIndex(text, support.segment?.endIndex ?? 0),
        chunks: support.groundingChunkIndices ?? [],
      }));
    for (const span of sentenceSpans(text)) {
      const sentence = clean(text.slice(span.start, span.end));
      if (wordCount(sentence) < 3) continue;
      const sourceIds = new Set<string>();
      for (const support of supports) {
        if (support.start < span.end && support.end > span.start) {
          for (const chunk of support.chunks) {
            const id = chunkSource(chunk);
            if (id) sourceIds.add(id);
          }
        }
      }
      if (sourceIds.size === 0) {
        dropped += 1;
        continue;
      }
      claims.push({ id: `${section}_${claims.length + 1}`, section, text: sentence, sourceIds: [...sourceIds] });
    }
  });
  return { claims, dropped };
}

/** The sources a brief actually cites, keyed by ID (unused search results are not kept). */
export function citedSources(claims: Claim[], sourceIndex: Map<string, WebSource>): BriefOutput["sources"] {
  const cited = new Set(claims.flatMap((claim) => claim.sourceIds));
  return Object.fromEntries([...sourceIndex.values()].filter((source) => cited.has(source.id)).map((source) => [source.id, source]));
}

/**
 * Gate B (FR-RES-3, FR-RES-5): what later stages may use from a brief. Removed
 * facts drop out, and so does any inference left with no kept fact to rest on.
 */
export function keptBrief(brief: Pick<BriefOutput, "claims" | "inferences">) {
  const claims = brief.claims.filter((claim) => !claim.removed);
  const kept = new Set(claims.map((claim) => claim.id));
  const inferences = brief.inferences.map((item) => ({ ...item, basedOn: item.basedOn.filter((id) => kept.has(id)) })).filter((item) => item.basedOn.length > 0);
  return { claims, inferences, droppedInferences: brief.inferences.length - inferences.length };
}
