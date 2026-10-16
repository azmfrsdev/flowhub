import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { askOutline } from "@/lib/ask/outline";
import { copyPriceLines, graphOutline, pricingProjection } from "@/lib/deal-room/fit";
import { type WorkspaceGraph, marginPercent, startingPrice } from "@/lib/offerings/view";
import { answerLines, calculate } from "@/lib/ask/answer";
import { moneyTokens } from "@/lib/pricing/money";
import { parsePrice } from "@/lib/pricing/parse";
import { OfferingGraphExport, type PriceLineRef, type SourceRef } from "@/lib/schema";
import { costTokens } from "@/server/proposals/validate";
import { graphToDocs } from "@/server/workspace/import-graph";
import { SAMPLES } from "./index";

/** A price that starts with a currency must parse as an amount, and an amount must start with a currency (ADR-0012 D3). */
const CURRENCY_FIRST = /^(RM|MYR|SGD|S\$|USD|US\$|IDR|Rp)\s*\d/i;

/** Every source reference anywhere in a value. */
function sourcesIn(value: unknown): SourceRef[] {
  if (Array.isArray(value)) return value.flatMap(sourcesIn);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = "locator" in record && ("documentId" in record || "proposalId" in record) ? [record as SourceRef] : [];
  return [...own, ...Object.values(record).flatMap(sourcesIn)];
}

for (const sample of Object.values(SAMPLES)) {
  const graph: WorkspaceGraph = { ...sample.graph, documents: sample.documents };
  const currency = sample.graph.workspace.currency;

  describe(`sample seller: ${sample.graph.workspace.name}`, () => {
    it("validates against R12 and maps to workspace documents", () => {
      expect(() => OfferingGraphExport.parse(sample.graph)).not.toThrow();
      expect(graphToDocs(sample.graph, "ws_test").length).toBeGreaterThan(sample.graph.offerings.length);
    });

    it("refers only to offerings, partners, documents and pages it has", () => {
      const offerings = new Set(graph.offerings.map((offering) => offering.id));
      const partners = new Set(graph.partners.map((partner) => partner.id));
      const pages = new Map(graph.documents.map((doc) => [doc.id, doc.pages ?? 0]));
      const ids = [graph.offerings, graph.rateCards, graph.feeSchedules, graph.proof, graph.constraints, graph.partners, graph.notes].flatMap((items) => items.map((item) => item.id));
      expect(new Set(ids).size).toBe(ids.length);
      const featureIds = graph.offerings.flatMap((offering) => offering.features.map((feature) => feature.id));
      expect(new Set(featureIds).size).toBe(featureIds.length);

      const referenced = [
        ...graph.offerings.flatMap((offering) => (offering.parentId ? [offering.parentId] : [])),
        ...graph.rateCards.map((card) => card.offeringId),
        ...graph.feeSchedules.map((schedule) => schedule.offeringId),
        ...graph.proof.flatMap((item) => item.offeringIds),
        ...graph.constraints.flatMap((rule) => rule.offeringIds),
        ...graph.notes.flatMap((note) => (note.offeringId ? [note.offeringId] : [])),
        ...graph.documents.flatMap((doc) => doc.offeringIds),
      ];
      for (const id of referenced) expect(offerings, id).toContain(id);
      for (const id of [...graph.offerings.flatMap((offering) => offering.partnerIds), ...graph.constraints.flatMap((rule) => (rule.partnerId ? [rule.partnerId] : []))]) {
        expect(partners, id).toContain(id);
      }
      for (const source of sourcesIn(sample.graph)) {
        expect(pages.has(source.documentId!), source.documentId).toBe(true);
        expect(source.locator.page ?? 1).toBeLessThanOrEqual(pages.get(source.documentId!)!);
      }
    });

    it("writes every price so the parser reads it, with no bare numbers", () => {
      const texts = [
        ...graph.rateCards.flatMap((card) => Object.values(card.cells).flatMap((row) => Object.values(row).map((cell) => cell.value))),
        ...graph.feeSchedules.flatMap((schedule) => schedule.lines.flatMap((line) => [line.price, ...(line.cost ? [line.cost] : [])])),
      ];
      for (const text of texts) {
        const parsed = parsePrice(text, currency);
        if (CURRENCY_FIRST.test(text)) expect(parsed.kind, text).toBe("amount");
        if (parsed.kind === "amount") expect(text).toMatch(CURRENCY_FIRST);
      }
    });

    it("keeps every cost out of what a model reads (invariant 2)", () => {
      const costs = costTokens(sample.graph);
      expect(costs.size).toBeGreaterThan(5);
      const leaks = (value: unknown) => moneyTokens(JSON.stringify(value)).filter((token) => costs.has(token));
      expect(leaks(graphOutline(graph))).toEqual([]);
      expect(leaks(askOutline(graph).outline)).toEqual([]);
      for (const offering of graph.offerings) {
        const projection = pricingProjection(graph, offering.id, currency);
        expect(leaks(projection), offering.id).toEqual([]);
        expect(JSON.stringify(projection)).not.toMatch(/"cost"|"kind":"cost"|buyPrice/);
      }
    });
  });
}

/** The eval opportunities for the sample sellers (PRD 12 v3.1): their IDs and expected prices must hold against the samples. */
type ExpectedLine = { ref: PriceLineRef; quantity?: number; valueText: string; total?: string; basis?: string };
type EvalOpportunity = {
  seller: string;
  expect: {
    gaps: { offeringIds?: string[]; featureIds?: string[]; plannedFeatureIds?: string[]; proofIds?: string[]; partnerIds?: string[]; constraintId?: string; instead?: { offeringId?: string; partnerId?: string } }[];
    pricing: { lines: ExpectedLine[]; onQuote: ExpectedLine[] };
    review: { proofNeverCited: string[]; proofToCite: string[] };
  };
};

const evalDir = resolve(import.meta.dirname, "../../../../fixtures/opportunities");
const evals = readdirSync(evalDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, data: JSON.parse(readFileSync(resolve(evalDir, name), "utf8")) as EvalOpportunity }))
  .filter(({ data }) => data.seller in SAMPLES);

describe.each(evals)("eval opportunity $name", ({ data }) => {
  const sample = SAMPLES[data.seller as keyof typeof SAMPLES];
  const graph: WorkspaceGraph = { ...sample.graph, documents: sample.documents };

  it("names only entities the sample has, with planned features still planned", () => {
    const features = new Map(graph.offerings.flatMap((offering) => offering.features.map((feature) => [feature.id, feature.status] as const)));
    const ids = new Set([...graph.offerings, ...graph.proof, ...graph.partners, ...graph.constraints].map((item) => item.id));
    for (const gap of data.expect.gaps) {
      for (const id of [...(gap.offeringIds ?? []), ...(gap.proofIds ?? []), ...(gap.partnerIds ?? []), ...(gap.constraintId ? [gap.constraintId] : []), gap.instead?.offeringId, gap.instead?.partnerId]) {
        if (id) expect(ids, id).toContain(id);
      }
      for (const id of gap.featureIds ?? []) expect(features.get(id), id).toBe("active");
      for (const id of gap.plannedFeatureIds ?? []) expect(features.get(id), id).toBe("planned");
    }
    for (const id of data.expect.review.proofNeverCited) expect(graph.proof.find((item) => item.id === id)?.isPublic, id).toBe(false);
    for (const id of data.expect.review.proofToCite) expect(graph.proof.find((item) => item.id === id)?.isPublic, id).toBe(true);
  });

  it("copies each expected price and calculates each total in code", () => {
    for (const line of [...data.expect.pricing.lines, ...data.expect.pricing.onQuote]) {
      const { lines, rejected } = copyPriceLines(graph, [{ ref: line.ref, ...(line.quantity ? { quantity: { value: line.quantity, claimId: "eval" } } : {}) }], sample.graph.workspace.currency);
      expect(rejected, JSON.stringify(line.ref)).toEqual([]);
      expect(lines[0].valueText).toBe(line.valueText);
      expect(lines[0].total).toBe(line.total);
      if (line.basis) expect(lines[0].basis).toBe(line.basis);
    }
    for (const line of data.expect.pricing.onQuote) {
      expect(copyPriceLines(graph, [{ ref: line.ref }], sample.graph.workspace.currency).lines[0].unpriced).toBe(true);
    }
  });
});

describe("unit-and-period prices from the samples", () => {
  const giliran: WorkspaceGraph = { ...SAMPLES.giliran.graph, documents: SAMPLES.giliran.documents };
  const rantai: WorkspaceGraph = { ...SAMPLES["rantai-supply"].graph, documents: SAMPLES["rantai-supply"].documents };
  const kelapa: WorkspaceGraph = { ...SAMPLES["kelapa-cloud"].graph, documents: SAMPLES["kelapa-cloud"].documents };

  it("headline a subscription, a lease, a product and a range by their lowest price, keeping the unit", () => {
    expect(startingPrice(giliran, "off_payroll", "MYR")).toEqual({ text: "From RM 6 / employee / month", detail: "Giliran Payroll, Essentials" });
    expect(startingPrice(giliran, "off_hire", "MYR").text).toBe("From RM 450 / hiring site / month");
    expect(startingPrice(rantai, "off_daas", "MYR").text).toBe("From RM 72 / device / month");
    expect(startingPrice(rantai, "off_office", "MYR")).toEqual({ text: "From RM 3,099 / unit", detail: "Taviro Office 14, 50 to 199 units" });
    expect(startingPrice(rantai, "off_laptops", "MYR").text).toBe("From RM 1,789 / unit");
    // A service with a quoted price and per-unit add-ons still says On quote.
    expect(startingPrice(kelapa, "off_bq", "MYR").text).toBe("On quote");
  });

  it("Ask keeps the period when it multiplies, and adds lines that share it (FR-ASK-8)", () => {
    expect(calculate("RM 7 / employee / month", 2500, "MYR")?.text).toBe("2,500 × RM 7 = RM 17,500 / month");
    const { handles } = askOutline(giliran);
    const ref = (cardId: string) => Object.entries(handles).find(([, handle]) => handle.kind === "cell" && handle.cardId === cardId && handle.colId === "col_ent")![0];
    const answer = answerLines([{ ref: ref("rc_payroll_myr"), quantity: 2500 }, { ref: ref("rc_time_myr"), quantity: 2500 }], handles, giliran, "MYR", "2026-10-15");
    expect(answer.total).toBe("RM 27,500 / month");
    // A monthly and a one-off line are never added together.
    const setUp = Object.entries(handles).find(([, handle]) => handle.kind === "fee" && handle.lineId === "ln_setup")![0];
    const mixed = answerLines([{ ref: ref("rc_payroll_myr"), quantity: 2500 }, { ref: setUp }], handles, giliran, "MYR", "2026-10-15");
    expect(mixed.total).toBeUndefined();
  });

  it("shows a margin on a device price against its buy price", () => {
    expect(marginPercent("RM 3,299 per unit", "RM 2,890 per unit", "MYR")).toBe(12);
    expect(marginPercent("RM 3,099 per unit", "RM 2,840 per unit", "MYR")).toBe(8);
  });
});
