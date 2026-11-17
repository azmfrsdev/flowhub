import type { Claim } from "@/lib/schema";

/** The longest a short line may be, in words. */
const MAX_SHORT_WORDS = 12;

/** Abbreviations a short line may use that a sentence spells out ("RM" for "Malaysian Ringgit", "FY" for "financial year"). */
const ABBREVIATIONS = new Set(["rm", "usd", "sgd", "us$", "s$", "idr", "thb", "php", "fy", "ai", "it", "hq", "ceo", "coo", "cfo", "cto", "yoy", "m", "b", "k", "bn", "mn"]);

type Figure = { value: number; scale: "k" | "m" | "b" | null };

const SCALE: Record<string, Figure["scale"]> = { k: "k", thousand: "k", m: "m", mn: "m", mil: "m", million: "m", b: "b", bn: "b", billion: "b" };

/** Every number in a text, with its scale when one follows it ("RM4.95B", "4.95 billion", "19,300", "11.2%", "2025"). */
function figures(text: string): Figure[] {
  return [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(thousand|billion|million|mil|bn|mn|k|m|b)?(?![\p{L}])/giu)].map((match) => ({
    value: Number(match[1].replace(/,/g, "")),
    scale: match[2] ? SCALE[match[2].toLowerCase()] : null,
  }));
}

/** The names in a short line: capitalised words, without trailing punctuation, that carry no digit and aren't a common abbreviation. */
function names(line: string): string[] {
  return line
    .split(/\s+/)
    .map((word) => word.replace(/^[("'“‘~]+|[)"'”’.,;:!?]+$/g, ""))
    .filter((word, index) => index > 0 && /^\p{Lu}/u.test(word) && !/\d/.test(word) && !ABBREVIATIONS.has(word.toLowerCase()));
}

/**
 * FR-RES-8, ADR-0024: a short line for the Research boxes is Gemini's summary of one sourced
 * sentence, kept only if code finds in that sentence every number in it (with the same scale,
 * when the line gives one) and every name. Returns the line, trimmed, or null. The sentence
 * itself is never changed, and nothing outside the Research page reads the line.
 */
export function checkedSummary(text: string, line: string): string | null {
  const short = line.replace(/\s+/g, " ").trim().replace(/[.;:]+$/, "");
  if (!short || short.split(" ").length > MAX_SHORT_WORDS) return null;
  const known = figures(text);
  for (const figure of figures(short)) {
    if (!known.some((item) => item.value === figure.value && (!figure.scale || item.scale === figure.scale))) return null;
  }
  const lower = text.toLowerCase();
  if (names(short).some((name) => !lower.includes(name.toLowerCase()))) return null;
  return short;
}

/** The one-line view of a fact: its checked short line, or for a fact without one, its first words. */
export function shortLine(claim: Pick<Claim, "short" | "text">, words = 9): string {
  if (claim.short) return claim.short;
  const all = claim.text.split(/\s+/);
  return all.length <= words ? claim.text : `${all.slice(0, words).join(" ").replace(/[,.;:]$/, "")}…`;
}

/** An inference's title, or for a brief made before titles existed, its first few words. */
export function inferenceTitle(item: { title?: string; text: string }): string {
  if (item.title) return item.title;
  const words = item.text.split(/\s+/);
  return words.length <= 7 ? item.text : `${words.slice(0, 7).join(" ").replace(/[,.;:]$/, "")}…`;
}
