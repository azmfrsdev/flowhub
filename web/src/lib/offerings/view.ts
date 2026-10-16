import { formatAmount, parsePrice } from "@/lib/pricing/parse";
import type { Constraint, DocumentRecord, FeeSchedule, Note, Offering, Partner, Proof, RateCard, ScheduledPrice, SourceRef } from "@/lib/schema";

/**
 * Pure read models for the offering pages (PRD 7.16). Everything here is
 * derived from confirmed graph entities at read time; nothing is stored.
 */

export type WorkspaceGraph = {
  offerings: Offering[];
  rateCards: RateCard[];
  feeSchedules: FeeSchedule[];
  proof: Proof[];
  constraints: Constraint[];
  partners: Partner[];
  notes: Note[];
  documents: DocumentRecord[];
};

/** Today in Malaysia, as YYYY-MM-DD: the day prices and caps are counted in. */
export function malaysiaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(now);
}

/**
 * The price in use on `day` (ADR-0001 amendment, FR-ASK-6): a scheduled price
 * takes over on its start date. Every reader of a price goes through this.
 */
export function priceOn(price: { value: string; next?: ScheduledPrice }, day: string): string {
  return price.next && day >= price.next.from ? price.next.value : price.value;
}

/** Every price string an offering sells at: pricing-card cells and fee lines. Never cost. */
function priceEntries(graph: WorkspaceGraph, offeringId: string, sections: FeeSchedule["section"][]) {
  const entries: { text: string; label: string }[] = [];
  for (const card of graph.rateCards) {
    if (card.offeringId !== offeringId || card.kind !== "pricing") continue;
    for (const row of card.rows) {
      for (const column of card.columns) {
        const cell = card.cells[row.id]?.[column.id];
        if (cell) entries.push({ text: priceOn(cell, malaysiaDay()), label: `${row.label}, ${column.label}` });
      }
    }
  }
  for (const schedule of graph.feeSchedules) {
    if (schedule.offeringId !== offeringId || !sections.includes(schedule.section)) continue;
    for (const line of schedule.lines) entries.push({ text: priceOn({ value: line.price, next: line.next }, malaysiaDay()), label: line.label });
  }
  return entries;
}

/**
 * The headline price (FR-OFR-1, FR-OFR-2): the lowest one-off, whole-job
 * amount. Man-day rates aren't a starting point. A product starts from its
 * lowest unit price ("From RM 3,099 / unit"). With neither, a subscription or
 * rental starts from its lowest recurring price ("From RM 6 / employee /
 * month"). A service's per-unit price is used only when nothing is on quote.
 * A range with no prices of its own starts where its sub-offerings start.
 */
export function startingPrice(graph: WorkspaceGraph, offeringId: string, currency: string): { text: string; detail: string | null } {
  const own = priceEntries(graph, offeringId, ["other"]);
  const entries = own.length > 0 ? own : graph.offerings.filter((child) => child.parentId === offeringId).flatMap((child) => priceEntries(graph, child.id, ["other"]));
  const product = graph.offerings.find((offering) => offering.id === offeringId)?.type === "product";
  const best: Partial<Record<"oneOff" | "recurring" | "perUnit", { amount: number; label: string; unit: string }>> = {};
  let onQuote = 0;
  for (const entry of entries) {
    const parsed = parsePrice(entry.text, currency);
    if (parsed.kind === "on_quote" || parsed.kind === "unparsed") onQuote += 1;
    if (parsed.kind !== "amount" || parsed.currency !== currency) continue;
    const kind = parsed.recurring ? "recurring" : parsed.per ? "perUnit" : "oneOff";
    const unit = `${parsed.per ? ` / ${parsed.per}` : ""}${parsed.recurring ? ` / ${parsed.recurring}` : ""}`;
    const current = best[kind];
    if (!current || parsed.amount < current.amount) best[kind] = { amount: parsed.amount, label: entry.label, unit };
  }
  const pick = best.oneOff ?? (product ? best.perUnit : undefined) ?? best.recurring ?? (onQuote > 0 ? undefined : best.perUnit);
  if (pick) return { text: `From ${formatAmount(pick.amount, currency)}${pick.unit}`, detail: pick.label };
  if (onQuote > 0) return { text: "On quote", detail: null };
  return { text: "No prices yet", detail: null };
}

/**
 * Margin as a whole percentage, calculated on screen and never stored
 * (FR-OFR-5). Only when both are plain amounts in the same currency and unit.
 */
export function marginPercent(price: string, cost: string | undefined, currency: string): number | null {
  if (!cost) return null;
  const p = parsePrice(price, currency);
  const c = parsePrice(cost, currency);
  if (p.kind !== "amount" || c.kind !== "amount" || p.amount <= 0) return null;
  if (p.currency !== c.currency || (p.per ?? "") !== (c.per ?? "") || (p.recurring ?? "") !== (c.recurring ?? "")) return null;
  return Math.round(((p.amount - c.amount) / p.amount) * 100);
}

/** "Sales deck 2026.pdf" → "Sales deck"; "Past proposal, Teluk Logistik.pdf" → "Past proposal". */
export function shortDocumentName(name: string): string {
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\s*[,–—-]\s.*$/, "")
    .replace(/\s+\d{4}$/, "")
    .trim();
}

/** The text of a source chip: "Sales deck p.5", or the document name alone. */
export function sourceLabel(source: SourceRef, documents: Map<string, DocumentRecord>): string {
  const doc = source.documentId ? documents.get(source.documentId) : undefined;
  const name = doc ? shortDocumentName(doc.name) : source.proposalId ? "Your message" : "Source";
  const { page, slide, sheet } = source.locator ?? {};
  if (page) return `${name} p.${page}`;
  if (slide) return `${name} slide ${slide}`;
  if (sheet) return `${name}, ${sheet}`;
  return name;
}

export function offeringSummary(graph: WorkspaceGraph, offering: Offering, currency: string) {
  const proof = graph.proof.filter((item) => item.offeringIds.includes(offering.id));
  const partners = graph.partners.filter((partner) => offering.partnerIds.includes(partner.id));
  return {
    included: offering.features.filter((feature) => feature.status !== "retired").length,
    price: startingPrice(graph, offering.id, currency),
    partners,
    publicProof: proof.filter((item) => item.isPublic),
    privateProof: proof.filter((item) => !item.isPublic),
    documents: graph.documents.filter((doc) => doc.offeringIds.includes(offering.id)),
    subOfferings: graph.offerings.filter((child) => child.parentId === offering.id),
  };
}

/** Scope tab: this offering's exclusions, and the company-wide selling rules (FR-OFR-4, FR-OFR-9). */
export function scopeRules(graph: WorkspaceGraph, offeringId: string) {
  return {
    notIncluded: graph.constraints.filter((rule) => rule.offeringIds.includes(offeringId)),
    companyWide: graph.constraints.filter((rule) => rule.offeringIds.length === 0),
  };
}
