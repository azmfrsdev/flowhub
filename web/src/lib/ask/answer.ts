import { type WorkspaceGraph, priceOn } from "@/lib/offerings/view";
import { moneyTokens } from "@/lib/pricing/money";
import { formatAmount, parsePrice } from "@/lib/pricing/parse";
import type { AnswerCite, AnswerLine } from "@/lib/schema";
import type { PriceHandle } from "./outline";

/**
 * Ask answers (FR-ASK-8). The model picks price lines; code copies each price
 * word for word and does every sum (invariant 1). Nothing here calls a model.
 */

export const PRICE_SLOT = /\{\{\s*price:\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** The price in use today on a handle's line, or null when the cell isn't offered. */
export function copyHandlePrice(handle: PriceHandle, graph: WorkspaceGraph, day: string): string | null {
  if (handle.kind === "cell") {
    const card = graph.rateCards.find((item) => item.id === handle.cardId && item.kind === "pricing");
    const cell = card?.cells[handle.rowId]?.[handle.colId];
    return cell ? priceOn(cell, day) : null;
  }
  const line = graph.feeSchedules.find((item) => item.id === handle.scheduleId)?.lines.find((item) => item.id === handle.lineId);
  return line ? priceOn({ value: line.price, next: line.next }, day) : null;
}

const quantityText = (n: number) => n.toLocaleString("en-MY");

/**
 * "80 × RM 380 = RM 30,400", with any minimum the price states applied and
 * said out loud. Null when the price isn't a plain amount.
 */
export function calculate(
  valueText: string,
  quantity: number,
  currency: string,
): { text: string; amount: number; currency: string; recurring?: string } | null {
  const parsed = parsePrice(valueText, currency);
  if (parsed.kind !== "amount" || !(quantity > 0)) return null;
  const unit = formatAmount(parsed.amount, parsed.currency);
  const billed = Math.max(quantity, parsed.minQuantity ?? 0);
  const raw = parsed.amount * billed;
  const amount = Math.max(raw, parsed.minAmount ?? 0);
  const period = parsed.recurring ? ` / ${parsed.recurring}` : "";
  let text = `${quantityText(billed)} × ${unit} = ${formatAmount(raw, parsed.currency)}${period}`;
  if (billed > quantity) text = `The minimum is ${quantityText(billed)}${parsed.per ? ` ${parsed.per}s` : ""}: ${text}`;
  if (amount > raw) text = `${text}, so the minimum of ${formatAmount(amount, parsed.currency)}${period} applies`;
  return { text, amount, currency: parsed.currency, ...(parsed.recurring ? { recurring: parsed.recurring } : {}) };
}

/**
 * Copies the chosen lines and calculates their totals. Unknown handles are
 * left out and returned, so the caller can say so rather than guess.
 */
export function answerLines(
  selections: { ref: string; quantity?: number }[],
  handles: Record<string, PriceHandle>,
  graph: WorkspaceGraph,
  currency: string,
  day: string,
): { lines: AnswerLine[]; total?: string; unknown: string[] } {
  const lines: AnswerLine[] = [];
  const unknown: string[] = [];
  // Amounts to add up: all one-off, or all in the same period ("RM 7 / employee / month" × 2,500 is monthly).
  const amounts: { amount: number; currency: string; recurring?: string }[] = [];
  let summable = true;
  const seen = new Set<string>();
  for (const selection of selections) {
    const handle = handles[selection.ref];
    if (!handle) {
      unknown.push(selection.ref);
      continue;
    }
    if (seen.has(selection.ref)) continue;
    seen.add(selection.ref);
    const valueText = copyHandlePrice(handle, graph, day) ?? "Not offered";
    const calc = selection.quantity ? calculate(valueText, selection.quantity, currency) : null;
    lines.push({ ref: selection.ref, offeringId: handle.offeringId, label: handle.label, where: handle.where, valueText, ...(calc ? { calc: calc.text } : {}) });

    const parsed = parsePrice(valueText, currency);
    if (parsed.kind !== "amount") summable = false;
    else if (calc) amounts.push(calc);
    else if (parsed.per) summable = false;
    else amounts.push({ amount: parsed.amount, currency: parsed.currency, ...(parsed.recurring ? { recurring: parsed.recurring } : {}) });
  }
  const alike = amounts.every((item) => item.currency === amounts[0]?.currency && item.recurring === amounts[0]?.recurring);
  const total =
    summable && alike && amounts.length >= 2 && amounts.length === lines.length
      ? `${formatAmount(
          amounts.reduce((sum, item) => sum + item.amount, 0),
          amounts[0].currency,
        )}${amounts[0].recurring ? ` / ${amounts[0].recurring}` : ""}`
      : undefined;
  return { lines, ...(total ? { total } : {}), unknown };
}

/** Puts the copied prices into the model's reply. A slot for a line it didn't pick is copied too; an unknown one says so. */
export function fillPrices(reply: string, valueFor: (ref: string) => string | null): string {
  return reply.replace(PRICE_SLOT, (_, ref: string) => valueFor(ref) ?? "(price not found)");
}

/**
 * Invariant 1 and 2 on the answer text: with the slots taken out, any amount
 * the message itself didn't contain was typed by the model, and any private
 * cost must never appear. Either way the caller drops the prose.
 */
export function typedMoney(reply: string, message: string, costTokens: Set<string>): boolean {
  const allowed = new Set(moneyTokens(message));
  const tokens = moneyTokens(reply.replace(PRICE_SLOT, ""));
  return tokens.some((token) => !allowed.has(token) || costTokens.has(token));
}

/** Turns the IDs the model cites into links, keeping only records it was allowed to see. */
export function resolveCites(ids: string[], graph: WorkspaceGraph): AnswerCite[] {
  const cites: AnswerCite[] = [];
  const seen = new Set<string>();
  const live = graph.offerings.filter((offering) => !offering.restricted && offering.status !== "retired");
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const offering = live.find((item) => item.id === id);
    if (offering) {
      cites.push({ kind: "offering", id, label: offering.name, href: `/offerings/${id}` });
      continue;
    }
    const owner = live.find((item) => item.features.some((feature) => feature.id === id && feature.status === "active"));
    if (owner) {
      const feature = owner.features.find((item) => item.id === id)!;
      cites.push({ kind: "feature", id, label: `${owner.name} › ${feature.name}`, href: `/offerings/${owner.id}/scope` });
      continue;
    }
    const proof = graph.proof.find((item) => item.id === id && item.isPublic && !item.restricted);
    if (proof) {
      cites.push({ kind: "proof", id, label: proof.title, href: proof.offeringIds[0] ? `/offerings/${proof.offeringIds[0]}/sales` : "/offerings" });
      continue;
    }
    const partner = graph.partners.find((item) => item.id === id && !item.restricted);
    if (partner) {
      const offeringId = live.find((item) => item.partnerIds.includes(id))?.id;
      cites.push({ kind: "partner", id, label: partner.name, href: offeringId ? `/offerings/${offeringId}/partners` : "/offerings" });
      continue;
    }
    const rule = graph.constraints.find((item) => item.id === id && !item.restricted);
    if (rule) {
      cites.push({ kind: "constraint", id, label: rule.statement, href: rule.offeringIds[0] ? `/offerings/${rule.offeringIds[0]}/scope` : "/settings" });
    }
  }
  return cites;
}
