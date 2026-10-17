import "server-only";
import { DeckPhoto } from "@/lib/schema";

/**
 * FR-DECK-5, ADR-0015 D4: photos for the client deck come only from Openverse,
 * under licences that allow use in a client document with a credit: CC0, the
 * Public Domain Mark, CC BY and CC BY-SA. A failed or empty search means no
 * photo, never a guess.
 */

const SEARCH = "https://api.openverse.org/v1/images/";
const LICENCES = ["cc0", "pdm", "by", "by-sa"] as const;
const USER_AGENT = "FlowHub/1.0 (AI Builder Cup 2026; client deck photos)";
const MAX_BYTES = 6 * 1024 * 1024;

type Result = {
  url?: string;
  tags?: { name?: string }[];
  thumbnail?: string;
  width?: number;
  height?: number;
  title?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
};

/** Words that mark a photo of a product, a brand or an advert: a client deck shows scenes, not someone else's trademark. */
const BRANDED = /\b(logo|brand|branded|packag\w*|advert\w*|poster|label|signage|trademark|product|billboard|mascot|wrapper)\b/i;

/**
 * How well a photo matches the search: its title must name at least one search
 * word, and each word in the title counts more than one in the tags. Branded photos never match; titles with catalogue codes,
 * acronyms or several proper names (an event, an agency, a named shop) rank low.
 */
function relevance(item: Result, wanted: string[]): number {
  const title = item.title ?? "";
  const tags = (item.tags ?? []).map((tag) => (tag.name ?? "").toLowerCase());
  if (BRANDED.test(`${title} ${tags.join(" ")}`)) return -1;
  // The title must name what's in the picture; tags alone are often generated and loose.
  const inTitle = wanted.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title.toLowerCase())).length;
  if (inTitle === 0) return -1;
  let score = inTitle * 3;
  for (const word of wanted) if (tags.some((tag) => tag.includes(word))) score += 1;
  const names = title.split(/\s+/).slice(1).filter((word) => /^[A-Z][a-z]+/.test(word) && !wanted.some((wantedWord) => word.toLowerCase().startsWith(wantedWord))).length;
  if (/\d{3,}/.test(title) || /\b[A-Z]{3,}\b/.test(title)) score -= 3;
  if (names >= 2) score -= 2;
  return score;
}

/** Some providers send names URL-encoded ("%C1lvaro%20Serrano"). */
function readable(text: string): string {
  try {
    return /%[0-9A-F]{2}/i.test(text) ? decodeURIComponent(text) : text;
  } catch {
    return text;
  }
}

async function search(params: Record<string, string>): Promise<Result[]> {
  try {
    const query = new URLSearchParams({ license: LICENCES.join(","), category: "photograph", page_size: "20", mature: "false", aspect_ratio: "wide", ...params });
    const response = await fetch(`${SEARCH}?${query}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    return ((await response.json()) as { results?: Result[] }).results ?? [];
  } catch {
    return [];
  }
}

/** A photo Openverse found, with the tags the chooser reads. */
export type PhotoCandidate = { photo: DeckPhoto; tags: string[] };

/**
 * Wide photos under an allowed licence that match one of the searches and
 * aren't branded, best first, with what their credit lines need. Openverse's
 * filters thin the results a lot, so every search runs twice at once (large
 * photos only, then any size), and photos with the same title count once.
 * (Anonymous requests allow 20 results.) The pipeline has Gemini choose.
 */
export async function searchPhotos(queries: string[], avoid: string[] = [], limit = 12): Promise<PhotoCandidate[]> {
  const searches = queries.map((query) => query.trim()).filter(Boolean).slice(0, 3);
  if (searches.length === 0) return [];
  const wanted = [...new Set(searches.flatMap((query) => query.toLowerCase().split(/\s+/)).filter((word) => word.length >= 4).map((word) => word.replace(/s$/, "")))];
  const rounds = await Promise.all(searches.flatMap((q) => [search({ q, size: "large" }).then((items) => items.map((item) => ({ item, q }))), search({ q }).then((items) => items.map((item) => ({ item, q })))]));
  const seen = new Set<string>();
  return rounds
    .flat()
    .filter(({ item }) => {
      const key = (item.title ?? item.url ?? "").toLowerCase().trim();
      const ok =
        item.url?.startsWith("https://") &&
        item.foreign_landing_url &&
        (LICENCES as readonly string[]).includes(item.license ?? "") &&
        (item.width ?? 0) >= 1000 &&
        (item.width ?? 0) > (item.height ?? 0) * 1.2 &&
        !avoid.includes(item.url) &&
        !seen.has(key);
      if (ok) seen.add(key);
      return ok;
    })
    .map((entry) => ({ ...entry, score: relevance(entry.item, wanted) }))
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .flatMap(({ item, q }) => {
      const parsed = DeckPhoto.safeParse({
        url: item.url,
        ...(item.thumbnail ? { thumbnail: item.thumbnail } : {}),
        width: item.width,
        height: item.height,
        title: readable(item.title ?? "Untitled").slice(0, 120),
        creator: readable(item.creator ?? "Unknown").slice(0, 80),
        license: item.license,
        ...(item.license_version ? { licenseVersion: item.license_version } : {}),
        ...(item.license_url ? { licenseUrl: item.license_url } : {}),
        sourceUrl: item.foreign_landing_url,
        query: q,
      });
      return parsed.success ? [{ photo: parsed.data, tags: (item.tags ?? []).map((tag) => tag.name ?? "").filter(Boolean).slice(0, 12) }] : [];
    });
}

/** The photo's bytes as a data URI for the .pptx, from the original or, failing that, the Openverse thumbnail. */
export async function photoData(photo: DeckPhoto | null): Promise<string | null> {
  if (!photo) return null;
  for (const url of [photo.url, photo.thumbnail].filter((value): value is string => Boolean(value?.startsWith("https://")))) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
      const type = response.headers.get("content-type")?.split(";")[0] ?? "";
      if (!response.ok || !["image/jpeg", "image/png"].includes(type)) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) continue;
      return `${type};base64,${bytes.toString("base64")}`;
    } catch {
      continue;
    }
  }
  return null;
}
