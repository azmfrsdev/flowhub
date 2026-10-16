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

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const BRIEF_SECTIONS: [Claim["section"], string][] = [
  ["snapshot", "Snapshot"],
  ["news", "Recent news and events"],
  ["hiring", "Hiring signals"],
  ["tech", "Technology signals"],
];

/**
 * FR-RES-7: the approved brief as formatted text for use outside FlowHub. Only
 * kept facts, each with its numbered sources, and inferences labelled as such.
 * Source links are copied exactly as Google Search returned them.
 */
export function briefHtml(prospect: string, brief: Pick<BriefOutput, "claims" | "inferences" | "sources" | "questions" | "sellerNotes">): string {
  const { claims, inferences } = keptBrief(brief);
  const numbers = new Map<string, number>();
  for (const claim of claims) for (const id of claim.sourceIds) if (brief.sources[id] && !numbers.has(id)) numbers.set(id, numbers.size + 1);
  const cite = (claim: Claim) => [...new Set(claim.sourceIds)].filter((id) => numbers.has(id)).map((id) => `[${numbers.get(id)}]`).join("");
  const parts = [`<h1>Research brief: ${escapeHtml(prospect)}</h1>`];
  for (const [section, title] of BRIEF_SECTIONS) {
    const items = claims.filter((claim) => claim.section === section);
    if (items.length) parts.push(`<h2>${title}</h2><ul>${items.map((claim) => `<li>${escapeHtml(claim.text)} ${cite(claim)}</li>`).join("")}</ul>`);
  }
  for (const [section, title] of [["sector", "Sector pressures"], ["needs", "Likely needs"]] as const) {
    const items = inferences.filter((item) => item.section === section);
    if (items.length) parts.push(`<h2>${title} (inference)</h2><ul>${items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>`);
  }
  if (brief.questions.length) parts.push(`<h2>Questions to ask</h2><ol>${brief.questions.map((question) => `<li>${escapeHtml(question.text)}</li>`).join("")}</ol>`);
  if (brief.sellerNotes.length) parts.push(`<h2>Our notes</h2><ul>${brief.sellerNotes.map((note) => `<li>${escapeHtml(note.text)} (${escapeHtml(note.by)})</li>`).join("")}</ul>`);
  const sources = [...numbers.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => brief.sources[id]);
  if (sources.length) {
    const link = (uri: string, label: string) => (/^https?:\/\//i.test(uri) ? `<a href="${escapeHtml(uri)}">${escapeHtml(label)}</a>` : escapeHtml(label));
    parts.push(`<h2>Sources</h2><ol>${sources.map((source) => `<li>${link(source.groundingUri, source.domain)}${source.title && source.title !== source.domain ? ` · ${escapeHtml(source.title)}` : ""}</li>`).join("")}</ol>`);
  }
  return parts.join("\n");
}
