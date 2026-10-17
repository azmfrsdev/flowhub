import { checkSellingRules } from "@/lib/deal-room/fit";
import { COUNTRIES, type Claim, type Constraint, type NewsBeat, type NewsStory, type NewsTrigger, type WebSource } from "@/lib/schema";

/**
 * News scout, the parts code decides (PRD 7.21, ADR-0014 D2, D4): what to
 * search for, which stories survive, and each lead's score. Pure and
 * deterministic; the pipeline supplies the model's grouping.
 */

/** Editions are kept one per day, keyed by the Malaysia date (FR-NEWS-8). */
export const EDITION_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ScoutHub = {
  country: string;
  offerings: { id: string; name: string; summary: string }[];
  /** Company-wide selling rules only. */
  rules: Constraint[];
  /** Public results' clients and won deals (never private results). */
  pastClients: string[];
};

export type Beat = { key: NewsBeat; title: string; focus: string };

const countryName = (code: string) => COUNTRIES[code as keyof typeof COUNTRIES] ?? code;
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** The regions a company sells in: its region rule if it has one, otherwise its own country. */
export function regionsOf(hub: Pick<ScoutHub, "country" | "rules">): string[] {
  const rule = hub.rules.find((item) => item.kind === "region" && item.values.length > 0);
  return (rule ? rule.values : [hub.country]).map((code) => countryName(code.toUpperCase()));
}

/** FR-NEWS-1, FR-NEWS-2: the four beats, built from the hub. */
export function buildBeats(hub: ScoutHub): Beat[] {
  const regions = list(regionsOf(hub));
  const services = hub.offerings.map((offering) => (offering.summary ? `${offering.name} (${offering.summary})` : offering.name));
  const names = list(hub.offerings.map((offering) => offering.name));
  const clients = [...new Set(hub.pastClients)].slice(0, 8);
  return [
    {
      key: "clients",
      title: "Companies like your clients",
      focus: clients.length
        ? `Competitors and peers of these past clients, in the same industries: ${list(clients)}. Report on the peers, not on these clients themselves.`
        : `Mid-size companies of the kind that buy ${names}.`,
    },
    { key: "services", title: "Who needs what you sell", focus: `Companies announcing a project, a problem or a change that needs any of: ${services.join("; ")}.` },
    { key: "local", title: "Your local market", focus: `Business news in ${regions}: companies expanding, opening new sites, raising money, appointing new technology leaders or modernising how they work.` },
    { key: "tenders", title: "Tenders and new rules", focus: `Public tenders, government programmes and new regulations in ${regions} that push companies to buy ${names}. Name the companies or agencies involved.` },
  ];
}

const SUFFIX = /\b(sdn|bhd|berhad|pte|ltd|limited|plc|inc|corp|corporation|holdings?|group|tbk|pt)\b/g;

/** A company name reduced for matching: "MR D.I.Y. Group (M) Berhad" and "MR DIY" match. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(m\)/g, " ")
    .replace(/[.'’]/g, "")
    .replace(SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameCompany(a: string, b: string): boolean {
  const [x, y] = [companyKey(a), companyKey(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && new RegExp(`(^| )${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(long);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_YEAR = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(20\d\d)\b/gi;

/** FR-NEWS-5: months since the newest month-and-year written in the sourced sentences, or null if none is dated. */
export function ageInMonths(texts: string[], today: Date): number | null {
  let newest: number | null = null;
  for (const text of texts) {
    for (const match of text.matchAll(MONTH_YEAR)) {
      const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
      const stamp = Number(match[2]) * 12 + month;
      if (newest === null || stamp > newest) newest = stamp;
    }
  }
  if (newest === null) return null;
  const now = today.getUTCFullYear() * 12 + today.getUTCMonth();
  return Math.max(0, now - newest);
}

const TRIGGER_WEIGHT: Record<NewsTrigger, number> = { tender: 1, expansion: 1, digital_project: 1, funding: 0.8, new_leader: 0.8, regulation: 0.7, partnership: 0.6, results: 0.5, other: 0.3 };

/** FR-NEWS-5: the lead score, out of 100, and its label. */
export function scoreLead(input: { offerings: number; ageMonths: number | null; trigger: NewsTrigger; domains: number }): { score: number; label: NewsStory["label"] } {
  const fit = Math.min(1, input.offerings / 2);
  const age = input.ageMonths;
  const fresh = age === null ? 0.4 : age <= 1 ? 1 : age <= 3 ? 0.7 : age <= 6 ? 0.4 : 0.1;
  const sources = input.domains >= 2 ? 1 : 0.5;
  const score = Math.round(35 * fit + 30 * fresh + 20 * TRIGGER_WEIGHT[input.trigger] + 15 * sources);
  return { score, label: score >= 85 ? "hot" : score >= 60 ? "worth_a_look" : "long_shot" };
}

export type DraftStory = { company: string; country?: string; headline: string; trigger: NewsTrigger; basedOn: string[]; offeringIds: string[]; why: string };

/**
 * FR-NEWS-3, FR-NEWS-4: keeps the stories that rest on sourced claims and
 * name a live offering, and leaves out known companies and rule breakers.
 * Each company appears once, in its best-scoring story.
 */
export function assembleStories(input: {
  drafts: DraftStory[];
  claims: Claim[];
  sources: Map<string, WebSource>;
  offeringIds: Set<string>;
  knownCompanies: string[];
  rules: Constraint[];
  today: Date;
  limit?: number;
}): { stories: NewsStory[]; left: { known: string[]; rules: { company: string; reason: string }[]; unmatched: number } } {
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  const domainOf = new Map([...input.sources.values()].map((source) => [source.id, source.domain]));
  const left = { known: [] as string[], rules: [] as { company: string; reason: string }[], unmatched: 0 };
  const kept: NewsStory[] = [];
  for (const draft of input.drafts) {
    const company = draft.company.trim();
    const claims = [...new Set(draft.basedOn)].flatMap((id) => (claimsById.has(id) ? [claimsById.get(id)!] : []));
    const offeringIds = [...new Set(draft.offeringIds)].filter((id) => input.offeringIds.has(id));
    if (!company || claims.length === 0 || offeringIds.length === 0) {
      left.unmatched += 1;
      continue;
    }
    if (input.knownCompanies.some((known) => sameCompany(known, company))) {
      if (!left.known.some((known) => sameCompany(known, company))) left.known.push(company);
      continue;
    }
    const country = draft.country?.trim().toUpperCase().slice(0, 2) || undefined;
    const conflicts = checkSellingRules(input.rules, { country, text: [company, draft.headline, ...claims.map((claim) => claim.text)].join(" ") });
    if (conflicts.length) {
      left.rules.push({ company, reason: conflicts[0].reason });
      continue;
    }
    const domains = new Set(claims.flatMap((claim) => claim.sourceIds.map((id) => domainOf.get(id) ?? id))).size;
    const ageMonths = ageInMonths(claims.map((claim) => claim.text), input.today);
    const { score, label } = scoreLead({ offerings: offeringIds.length, ageMonths, trigger: draft.trigger, domains });
    const story: NewsStory = { id: "", company, ...(country ? { country } : {}), headline: draft.headline.trim(), trigger: draft.trigger, claims, why: draft.why.trim(), offeringIds, score, label, ageMonths, opportunityId: null };
    const twin = kept.findIndex((other) => sameCompany(other.company, company));
    if (twin === -1) kept.push(story);
    else if (kept[twin].score < score) kept[twin] = story;
  }
  const stories = kept
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 9)
    .map((story, index) => ({ ...story, id: `story_${index + 1}` }));
  return { stories, left };
}
