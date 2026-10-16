import { z } from "zod";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { FeeBasis } from "@/lib/schema";

/**
 * Ask or tell (ADR-0009 D2, PRD 7.17): what the model reads and what it
 * returns. The outline carries IDs and names only: no price, no cost, nothing
 * restricted, and no proof that isn't public (invariants 1, 2, 5 and 7). Each
 * price line gets a short handle ("p7"). The model names handles, and code
 * turns them back into cells and lines, fills in revisions and current values,
 * and copies every price.
 */

export type PriceHandle =
  | { kind: "cell"; offeringId: string; cardId: string; rowId: string; colId: string; label: string; where: string }
  | { kind: "fee"; offeringId: string; scheduleId: string; lineId: string; label: string; where: string };

export function askOutline(graph: WorkspaceGraph) {
  const visible = <T extends { restricted: boolean }>(items: T[]) => items.filter((item) => !item.restricted);
  const offerings = visible(graph.offerings).filter((offering) => offering.status !== "retired");
  const names = new Map(offerings.map((offering) => [offering.id, offering.name]));
  const handles: Record<string, PriceHandle> = {};
  const priceLines: { ref: string; offeringId: string; line: string; offered: boolean; basis?: string }[] = [];

  for (const card of visible(graph.rateCards)) {
    const offering = names.get(card.offeringId);
    if (card.kind !== "pricing" || !offering) continue;
    for (const row of card.rows) {
      for (const column of card.columns) {
        const ref = `p${priceLines.length + 1}`;
        handles[ref] = { kind: "cell", offeringId: card.offeringId, cardId: card.id, rowId: row.id, colId: column.id, label: `${row.label}, ${column.label}`, where: `${offering} › Pricing › ${card.name}` };
        const group = row.groupLabel ? `${row.groupLabel} › ` : "";
        const note = column.note ? ` (${column.note})` : "";
        priceLines.push({ ref, offeringId: card.offeringId, line: `${card.name} › ${group}${row.label} › ${column.label}${note}`, offered: Boolean(card.cells[row.id]?.[column.id]) });
      }
    }
  }
  for (const schedule of visible(graph.feeSchedules)) {
    const offering = names.get(schedule.offeringId);
    if (!offering) continue;
    for (const line of schedule.lines) {
      const ref = `p${priceLines.length + 1}`;
      handles[ref] = { kind: "fee", offeringId: schedule.offeringId, scheduleId: schedule.id, lineId: line.id, label: line.label, where: `${offering} › Pricing › ${schedule.name}` };
      priceLines.push({ ref, offeringId: schedule.offeringId, line: `${schedule.name} › ${line.label}`, offered: true, basis: line.basis });
    }
  }

  const constraints = visible(graph.constraints);
  return {
    handles,
    outline: {
      offerings: offerings.map((offering) => ({
        id: offering.id,
        name: offering.name,
        type: offering.type,
        parentId: offering.parentId,
        summary: offering.summary,
        features: offering.features.filter((feature) => feature.status === "active").map(({ id, name, description }) => ({ id, name, description })),
        notIncluded: constraints
          .filter((rule) => rule.offeringIds.includes(offering.id))
          .map(({ id, statement, insteadText }) => ({ id, statement, insteadText: insteadText ?? null })),
        resultsYouCanCite: visible(graph.proof)
          .filter((item) => item.isPublic && item.offeringIds.includes(offering.id))
          .map(({ id, kind, title, body, clientName }) => ({ id, kind, title, body: body.slice(0, 300), clientName: clientName ?? null })),
      })),
      priceLines,
      priceLists: visible(graph.feeSchedules)
        .filter((schedule) => names.has(schedule.offeringId))
        .map(({ id, offeringId, name, section }) => ({ id, offeringId, name, section })),
      partners: visible(graph.partners).map(({ id, name, relationship, covers }) => ({ id, name, relationship, covers })),
      sellingRules: constraints.filter((rule) => rule.offeringIds.length === 0).map(({ id, kind, statement }) => ({ id, kind, statement })),
    },
  };
}

/**
 * One change as the model writes it: a small, strict shape per kind, so each
 * kind's required fields are required in the structured output too. Code maps
 * it onto the stored Operation shapes, and the validator then checks it
 * (src/server/proposals/validate.ts).
 */
const evidence = z.string().describe("The exact words from the message this change rests on, copied unchanged.");
const exactPrice = z.string().describe('The price copied exactly as the message writes it, with currency and unit, e.g. "RM 19,500". Never rounded or reformatted.');
const contact = {
  contactName: z.string().optional().describe("The contact person's name, only as written in the message."),
  contactRole: z.string().optional().describe("Their job title, only as written."),
  contactEmail: z.string().optional().describe("Only if the message gives it."),
  contactPhone: z.string().optional().describe("Only if the message gives it."),
};

export const ModelChange = z.union([
  z.object({
    kind: z.literal("set_price"),
    evidence,
    priceRef: z.string().describe(`The price line's ref from "priceLines", e.g. "p7".`),
    newPrice: exactPrice,
    startsOn: z.string().optional().describe("When the new price starts, as YYYY-MM-DD. Only if the message gives a date."),
  }),
  z.object({
    kind: z.literal("create_opportunity"),
    evidence,
    prospectName: z.string().describe("The prospect company's name, as written."),
    website: z.string().optional().describe("Only if the message gives the website. Never guess one."),
    ...contact,
    nextMeeting: z.string().optional().describe('The next meeting, with a weekday resolved against today, e.g. "Thu 15 Oct 2026, 10:00".'),
    interestedOfferingIds: z.array(z.string()).describe("IDs of the offerings they're interested in."),
    summary: z.string().describe("One sentence on what they want."),
  }),
  z.object({
    kind: z.literal("add_note"),
    evidence,
    offeringId: z.string().describe("The offering the note belongs to."),
    linkToNewOpportunity: z.boolean().describe("True when the note is about a lead you're also creating."),
    text: z.string().describe("The note, written plainly in the third person."),
  }),
  z.object({ kind: z.literal("add_feature"), evidence, offeringId: z.string(), name: z.string(), description: z.string() }),
  z.object({ kind: z.literal("update_feature"), evidence, offeringId: z.string(), featureId: z.string(), name: z.string().optional(), description: z.string().optional() }),
  z.object({ kind: z.literal("add_fee_line"), evidence, priceListId: z.string().describe('An ID from "priceLists".'), label: z.string(), price: exactPrice, basis: FeeBasis }),
  z.object({
    kind: z.literal("add_proof"),
    evidence,
    offeringIds: z.array(z.string()),
    proofKind: z.enum(["case_study", "metric", "logo", "testimonial"]),
    title: z.string(),
    body: z.string(),
    isPublic: z.boolean().describe("True only if the message says it may be shared or cited publicly."),
  }),
  z.object({
    kind: z.literal("add_constraint"),
    evidence,
    offeringIds: z.array(z.string()).describe("Offerings it excludes something from. Empty for a company-wide selling rule."),
    ruleKind: z.enum(["region", "industry", "min_deal_size", "integration", "scope", "other"]),
    statement: z.string(),
    values: z.array(z.string()).optional(),
    insteadText: z.string().optional().describe("What the company offers instead."),
  }),
  z.object({
    kind: z.literal("add_partner"),
    evidence,
    name: z.string(),
    relationship: z.enum(["partner", "vendor", "supplier"]),
    covers: z.array(z.string()),
    offeringIds: z.array(z.string()),
    ...contact,
  }),
]);
export type ModelChange = z.infer<typeof ModelChange>;

export const AskOrTellOutput = z.object({
  intent: z.enum(["tell", "ask", "unclear"]),
  /** Ask: the answer, with {{price:pN}} where a price goes. Otherwise one short sentence. */
  reply: z.string(),
  changes: z.array(ModelChange),
  /** Ask: the price lines the answer uses, with a quantity when the question gives one. */
  priceLines: z.array(z.object({ ref: z.string(), quantity: z.number().optional() })),
  /** Ask: IDs of the offerings, features, results, partners and rules the answer rests on. */
  cites: z.array(z.string()),
  notInHub: z.boolean(),
});
export type AskOrTellOutput = z.infer<typeof AskOrTellOutput>;

const UNKNOWN = "unknown";

/**
 * Turns the model's changes into raw operations. Revisions and "before"
 * values come from the graph, never from the model. An unknown handle maps to
 * an unknown target, so the validator drops it with a reason.
 */
export function toOperations(changes: ModelChange[], handles: Record<string, PriceHandle>, graph: WorkspaceGraph): unknown[] {
  const person = (change: { contactName?: string; contactRole?: string; contactEmail?: string; contactPhone?: string }) =>
    change.contactName ? { name: change.contactName, role: change.contactRole, email: change.contactEmail, phone: change.contactPhone } : undefined;
  return changes.map((change) => {
    switch (change.kind) {
      case "create_opportunity":
        return {
          kind: change.kind,
          evidence: change.evidence,
          prospectName: change.prospectName,
          website: change.website || undefined,
          contact: person(change),
          interestedOfferingIds: change.interestedOfferingIds,
          nextMeeting: change.nextMeeting || undefined,
          summary: change.summary,
        };
      case "add_note":
        return {
          kind: change.kind,
          evidence: change.evidence,
          offeringId: change.offeringId || undefined,
          opportunityRef: change.linkToNewOpportunity ? "new_opportunity" : undefined,
          text: change.text,
        };
      case "add_feature":
        return change;
      case "update_feature": {
        const offering = graph.offerings.find((item) => item.id === change.offeringId);
        return { ...change, expectedRev: offering?.rev ?? 0 };
      }
      case "set_price": {
        const handle = handles[change.priceRef];
        const base = { evidence: change.evidence, after: change.newPrice, effectiveFrom: change.startsOn || undefined };
        if (handle?.kind === "fee") {
          const schedule = graph.feeSchedules.find((item) => item.id === handle.scheduleId);
          const line = schedule?.lines.find((item) => item.id === handle.lineId);
          return { kind: "set_fee_line_price", ...base, feeScheduleId: handle.scheduleId, lineId: handle.lineId, expectedRev: schedule?.rev ?? 0, before: line?.price ?? "" };
        }
        const card = handle ? graph.rateCards.find((item) => item.id === handle.cardId) : undefined;
        return {
          kind: "set_price_cell",
          ...base,
          rateCardId: handle?.cardId ?? UNKNOWN,
          rowId: handle?.rowId ?? UNKNOWN,
          colId: handle?.colId ?? UNKNOWN,
          expectedRev: card?.rev ?? 0,
          before: handle ? (card?.cells[handle.rowId]?.[handle.colId]?.value ?? null) : null,
        };
      }
      case "add_fee_line": {
        const schedule = graph.feeSchedules.find((item) => item.id === change.priceListId);
        const { priceListId, ...rest } = change;
        return { ...rest, feeScheduleId: priceListId, expectedRev: schedule?.rev ?? 0 };
      }
      case "add_proof":
        return change;
      case "add_constraint": {
        const { ruleKind, values, ...rest } = change;
        return { ...rest, constraintKind: ruleKind, values: values ?? [] };
      }
      case "add_partner": {
        const who = person(change);
        return { kind: change.kind, evidence: change.evidence, name: change.name, relationship: change.relationship, covers: change.covers, offeringIds: change.offeringIds, contacts: who ? [who] : [] };
      }
    }
  });
}
