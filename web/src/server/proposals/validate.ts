/**
 * Validates Ask or tell operations before a person sees them (ADR-0009 D2,
 * PRD FR-ASK-3). Pure: no Firestore, no model. Every rule here is code, so the
 * guarantees hold whatever the model returns:
 *
 *  - the operation matches its Zod schema
 *  - every target exists, is live, and is at the revision the model saw
 *  - nothing touches a cost card or a cost value (invariant 2)
 *  - every price appears in the source text, word for word (invariant 1).
 *    For a document, the source is the text of the page the change cites.
 *  - the words the change rests on appear in the source (messages only)
 *
 * A failing operation is kept with status "dropped" and a reason, never fixed.
 */
import {
  type CheckedOperation,
  type Constraint,
  type DocumentRecord,
  type FeeSchedule,
  type Offering,
  Operation,
  type Partner,
  type Proof,
  type RateCard,
  type SourceRef,
} from "@/lib/schema";
import { moneyTokens } from "@/lib/pricing/money";
import { evidenceAppearsIn, normalisePrice, normaliseText, priceAppearsIn } from "@/lib/text/match";

export type GraphSnapshot = {
  offerings: Offering[];
  rateCards: RateCard[];
  feeSchedules: FeeSchedule[];
  proof: Proof[];
  constraints: Constraint[];
  partners: Partner[];
  documents?: DocumentRecord[];
};

export type ValidationInput = {
  /** Raw operations from the model, before any parsing. */
  operations: unknown[];
  graph: GraphSnapshot;
  /** The message text, or the extracted text of the document page(s). */
  sourceText: string;
  source: SourceRef;
  /** For messages, the evidence must be found in the text. */
  requireEvidenceInSource: boolean;
  /** Operations a person edited: they vouch for the values they typed, so the in-source checks skip them. */
  personEdited?: Set<string>;
  /** Assigns stable IDs to operations. */
  newId: () => string;
  /** Re-checking stored operations at Apply: keep the IDs they already have. */
  keepIds?: boolean;
  /**
   * A document's text by page number. Each operation is checked against the
   * page it cites, and its source becomes that page. A quote the page doesn't
   * contain isn't kept.
   */
  pages?: Map<number, string>;
};

export { evidenceAppearsIn, normalisePrice, normaliseText, priceAppearsIn } from "@/lib/text/match";
export { moneyTokens };

/**
 * Cost amounts that never appear in any price, so finding one in an operation
 * or an answer means a cost is leaking. Amounts, not whole strings, are
 * compared, so a cost of "RM 1,200" never blocks a real price of "RM 1,200 / month".
 */
export function costTokens(graph: GraphSnapshot): Set<string> {
  const costs = new Set<string>();
  const prices = new Set<string>();
  const add = (set: Set<string>, s: string) => moneyTokens(s).forEach((t) => set.add(t));
  for (const card of graph.rateCards) {
    for (const row of Object.values(card.cells)) {
      for (const cell of Object.values(row)) {
        add(card.kind === "cost" ? costs : prices, cell.value);
        if (cell.next) add(card.kind === "cost" ? costs : prices, cell.next.value);
      }
    }
  }
  for (const schedule of graph.feeSchedules) {
    for (const line of schedule.lines) {
      add(prices, line.price);
      if (line.next) add(prices, line.next.value);
      if (line.cost) add(costs, line.cost);
    }
  }
  for (const partner of graph.partners) {
    if (partner.buyPrice) add(costs, partner.buyPrice);
  }
  return new Set([...costs].filter((c) => !prices.has(c)));
}

function textFields(op: Operation): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(op);
  return out;
}

const live = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => x.deletedAt === null);

export function validateOperations(input: ValidationInput): CheckedOperation[] {
  const { graph } = input;
  const offerings = new Map(live(graph.offerings).map((o) => [o.id, o]));
  const cards = new Map(live(graph.rateCards).map((c) => [c.id, c]));
  const schedules = new Map(live(graph.feeSchedules).map((s) => [s.id, s]));
  const leaks = costTokens(graph);

  const results: CheckedOperation[] = [];

  const offeringName = (id: string) => offerings.get(id)?.name ?? "Unknown offering";
  const hasNewOpportunity = input.operations.some(
    (o) => typeof o === "object" && o !== null && (o as { kind?: string }).kind === "create_opportunity",
  );

  for (const raw of input.operations) {
    const existingId = input.keepIds && typeof raw === "object" && raw !== null ? (raw as { id?: unknown }).id : undefined;
    const withId = typeof raw === "object" && raw !== null ? { ...raw, id: typeof existingId === "string" ? existingId : input.newId() } : raw;
    const parsed = Operation.safeParse(withId);
    if (!parsed.success) {
      results.push({
        op: fallbackOp(withId, input.newId()),
        status: "dropped",
        dropReason: "It didn't match a change FlowHub knows how to make.",
        path: "Unknown",
        source: input.source,
      });
      continue;
    }
    const op = parsed.data;
    const vouched = input.personEdited?.has(op.id) ?? false;
    // A document's change is checked against the page it cites; a message's against the message.
    const pageText = input.pages && op.page ? input.pages.get(op.page) : undefined;
    const sourceText = input.pages ? (pageText ?? "") : input.sourceText;
    const source: SourceRef = input.pages
      ? { ...input.source, locator: op.page ? { page: op.page } : {}, ...(pageText && evidenceAppearsIn(op.evidence, pageText) ? { quote: op.evidence.slice(0, 400) } : {}) }
      : input.source;
    let path = "";
    let href: string | undefined;
    let drop: string | undefined;
    // A file's change must cite a page the file has: it's the only source its price can be checked against.
    if (input.pages && op.kind !== "link_document" && !vouched && (!op.page || pageText === undefined)) {
      drop = "It doesn't say which page of the file it comes from.";
    }

    const requireOfferings = (ids: string[]) => {
      const missing = ids.filter((id) => !offerings.has(id));
      if (missing.length) drop ??= "It points at an offering that doesn't exist.";
    };
    const requirePrice = (price: string) => {
      if (!vouched && !priceAppearsIn(price, sourceText)) {
        drop ??= `The price "${price}" isn't written in the source, so FlowHub won't use it.`;
      }
    };

    switch (op.kind) {
      case "create_opportunity": {
        path = "Opportunities › New";
        href = "/opportunities";
        // Unknown interests are removed rather than blocking the whole lead.
        op.interestedOfferingIds = op.interestedOfferingIds.filter((id) => offerings.has(id));
        // FR-ASK-7: the company must be named in the source. A website or contact detail
        // the source doesn't contain is the model's guess, so it's removed (intake looks for it instead).
        if (!vouched) {
          const source = normaliseText(sourceText);
          if (!source.includes(normaliseText(op.prospectName))) drop ??= "The company's name isn't in your message.";
          if (op.website && !source.includes(normaliseText(op.website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "")))) op.website = undefined;
          if (op.contact && !source.includes(normaliseText(op.contact.name))) op.contact = undefined;
          if (op.contact?.email && !source.includes(normaliseText(op.contact.email))) op.contact.email = undefined;
          if (op.contact?.phone && !normalisePrice(sourceText).includes(normalisePrice(op.contact.phone))) op.contact.phone = undefined;
        }
        break;
      }
      case "add_note": {
        if (op.offeringId) {
          requireOfferings([op.offeringId]);
          path = `${offeringName(op.offeringId)} › Notes`;
          href = `/offerings/${op.offeringId}/notes`;
        } else if (op.opportunityRef === "new_opportunity") {
          if (!hasNewOpportunity) drop ??= "It refers to a new opportunity that isn't being created.";
          path = "New opportunity › Notes";
        } else {
          drop ??= "A note needs an offering or an opportunity.";
          path = "Notes";
        }
        break;
      }
      case "add_feature": {
        requireOfferings([op.offeringId]);
        path = `${offeringName(op.offeringId)} › Scope › What's included`;
        href = `/offerings/${op.offeringId}/scope`;
        break;
      }
      case "update_feature": {
        const offering = offerings.get(op.offeringId);
        path = `${offeringName(op.offeringId)} › Scope › What's included`;
        href = `/offerings/${op.offeringId}/scope`;
        if (!offering) drop ??= "It points at an offering that doesn't exist.";
        else if (!offering.features.some((f) => f.id === op.featureId)) drop ??= "That feature doesn't exist.";
        else if (offering.rev !== op.expectedRev) drop ??= "The offering changed since FlowHub read it. Ask again.";
        break;
      }
      case "set_price_cell": {
        const card = cards.get(op.rateCardId);
        if (!card) {
          drop ??= "That rate card doesn't exist.";
          path = "Pricing";
          break;
        }
        const row = card.rows.find((r) => r.id === op.rowId);
        const col = card.columns.find((c) => c.id === op.colId);
        path = `${offeringName(card.offeringId)} › Pricing › ${card.name} › ${row?.label ?? "?"} › ${col?.label ?? "?"}`;
        href = `/offerings/${card.offeringId}/pricing`;
        if (card.kind === "cost") drop ??= "Cost prices are private and can't be changed this way.";
        else if (!row || !col) drop ??= "That line or column doesn't exist.";
        else if (card.rev !== op.expectedRev) drop ??= "The rate card changed since FlowHub read it. Ask again.";
        else {
          const current = card.cells[op.rowId]?.[op.colId]?.value ?? null;
          if (current !== op.before) drop ??= "The current price isn't what FlowHub expected. Ask again.";
          else if (current !== null && normalisePrice(current) === normalisePrice(op.after)) drop ??= "That's already the price in the hub.";
        }
        requirePrice(op.after);
        break;
      }
      case "set_fee_line_price": {
        const schedule = schedules.get(op.feeScheduleId);
        const line = schedule?.lines.find((l) => l.id === op.lineId);
        path = schedule
          ? `${offeringName(schedule.offeringId)} › Pricing › ${schedule.name} › ${line?.label ?? "?"}`
          : "Pricing";
        if (schedule) href = `/offerings/${schedule.offeringId}/pricing`;
        if (!schedule) drop ??= "That price list doesn't exist.";
        else if (!line) drop ??= "That line doesn't exist.";
        else if (schedule.rev !== op.expectedRev) drop ??= "The price list changed since FlowHub read it. Ask again.";
        else if (line.price !== op.before) drop ??= "The current price isn't what FlowHub expected. Ask again.";
        else if (normalisePrice(line.price) === normalisePrice(op.after)) drop ??= "That's already the price in the hub.";
        else if (line.cost && normalisePrice(line.cost) === normalisePrice(op.after)) {
          drop ??= "That value matches a private cost, so FlowHub won't use it as a price.";
        }
        requirePrice(op.after);
        break;
      }
      case "add_fee_line": {
        const schedule = schedules.get(op.feeScheduleId);
        path = schedule ? `${offeringName(schedule.offeringId)} › Pricing › ${schedule.name}` : "Pricing";
        if (schedule) href = `/offerings/${schedule.offeringId}/pricing`;
        if (!schedule) drop ??= "That price list doesn't exist.";
        else if (schedule.rev !== op.expectedRev) drop ??= "The price list changed since FlowHub read it. Ask again.";
        requirePrice(op.price);
        break;
      }
      case "add_proof": {
        requireOfferings(op.offeringIds);
        path = `${op.offeringIds.map(offeringName).join(", ")} › Sales material › Results you can cite`;
        href = `/offerings/${op.offeringIds[0]}/sales`;
        break;
      }
      case "add_constraint": {
        requireOfferings(op.offeringIds);
        path = op.offeringIds.length
          ? `${op.offeringIds.map(offeringName).join(", ")} › Scope › Not included`
          : "Settings › Selling rules";
        href = op.offeringIds.length ? `/offerings/${op.offeringIds[0]}/scope` : "/settings";
        break;
      }
      case "add_partner": {
        requireOfferings(op.offeringIds);
        path = op.offeringIds.length ? `${op.offeringIds.map(offeringName).join(", ")} › Partners` : "Partners";
        if (op.offeringIds.length) href = `/offerings/${op.offeringIds[0]}/partners`;
        break;
      }
      case "link_document": {
        requireOfferings(op.offeringIds);
        path = `${op.offeringIds.map(offeringName).join(", ")} › Sales material › Files`;
        href = `/offerings/${op.offeringIds[0]}/sales`;
        if (graph.documents && !graph.documents.some((doc) => doc.id === op.documentId)) drop ??= "That file no longer exists.";
        break;
      }
    }

    if ((op.kind === "set_price_cell" || op.kind === "set_fee_line_price") && op.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(op.effectiveFrom)) {
      drop ??= "FlowHub couldn't read when the new price starts.";
    }
    if (input.requireEvidenceInSource && !vouched && !evidenceAppearsIn(op.evidence, sourceText)) {
      drop ??= "The words it rests on aren't in your message.";
    }
    if (textFields(op).some((f) => moneyTokens(f).some((t) => leaks.has(t)))) {
      drop ??= "It contains a private cost value.";
    }

    results.push({ op, status: drop ? "dropped" : "proposed", ...(drop ? { dropReason: drop } : {}), path, ...(href && !drop ? { href } : {}), source });
  }
  return results;
}

/** A minimal valid operation used to display something the model got wrong. */
function fallbackOp(raw: unknown, id: string): Operation {
  const evidence =
    typeof raw === "object" && raw !== null && typeof (raw as { evidence?: unknown }).evidence === "string"
      ? (raw as { evidence: string }).evidence
      : "(none)";
  return { id, kind: "add_note", evidence, text: "(unreadable change)" };
}
