import { moneyTokens } from "@/lib/pricing/money";
import type { WriteOutput } from "@/lib/schema";

/**
 * The Reviewer's hard checks (ADR-0006 D5, FR-WRI-8). Code, not the model,
 * has the last word: these override whatever the Reviewer model said.
 */

export const PRICE_PLACEHOLDER = /\{\{price:([A-Za-z0-9_-]+)\}\}/g;

/** FR-FIT-5, invariant 1: prices in a draft come only from placeholders, filled from the approved pricing lines. */
export function renderPrices(text: string, lines: { id: string; valueText: string; total?: string }[]): { text: string; unknown: string[] } {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const unknown: string[] = [];
  const rendered = text.replace(PRICE_PLACEHOLDER, (_, id: string) => {
    const line = byId.get(id);
    if (!line) {
      unknown.push(id);
      return "on quote";
    }
    return line.total ? `${line.valueText} (${line.total})` : line.valueText;
  });
  return { text: rendered, unknown };
}

export type HardCheckContext = {
  /** Amounts a draft may state: ones that appear in approved research facts or seller notes. */
  allowedMoney: Set<string>;
  /** The seller's cost amounts that are never also a price. Never shown to a model. */
  costMoney: Set<string>;
  /** Titles and client names of results marked not public (invariant 5). */
  nonPublicNames: string[];
};

export type HardCheckResult = { priceNotFromGraph: string[]; costLeak: string[]; nonPublic: string[] };

export function hardChecks(text: string, context: HardCheckContext): HardCheckResult {
  const written = text.replace(PRICE_PLACEHOLDER, "");
  const amounts = moneyTokens(written);
  const lower = text.toLowerCase();
  return {
    costLeak: amounts.filter((amount) => context.costMoney.has(amount)),
    priceNotFromGraph: amounts.filter((amount) => !context.costMoney.has(amount) && !context.allowedMoney.has(amount)),
    nonPublic: context.nonPublicNames.filter((name) => name.trim().length >= 4 && lower.includes(name.trim().toLowerCase())),
  };
}

/** Hard checks a person may overrule at Gate D, by keeping the sentence as their own statement. The rest can only be removed. */
export const SOFT_CHECKS = new Set(["unknown_ref", "planned_feature"]);

/** Classifies refs: research facts, inferences and stated needs back research; catalogue entities back offering; notes back seller. A roadmap feature (planned:) backs nothing on its own. */
export function supportFromRefs(refs: string[], known: Set<string>): WriteOutput["claims"][number]["support"] {
  const valid = refs.filter((ref) => known.has(ref));
  if (valid.some((ref) => /^(c|i|r):/.test(ref))) return "research";
  // "price" is a {{price:…}} placeholder: backed by the catalogue, filled by code.
  if (valid.some((ref) => /^(o|f|p|x|t):/.test(ref) || ref === "price")) return "offering";
  if (valid.some((ref) => /^n:/.test(ref))) return "seller";
  return "neither";
}

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

/** Gate D "Remove": takes a flagged sentence out of its block. Null when it can't be found word for word. */
export function removeSentence(blockText: string, sentence: string): string | null {
  const target = normalise(sentence);
  if (!target) return null;
  const lines = blockText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalise(lines[index]);
    const at = line.indexOf(target);
    if (at === -1) continue;
    const rest = normalise(`${line.slice(0, at)} ${line.slice(at + target.length)}`).replace(/^[-•]\s*$/, "");
    if (rest && rest !== "-") lines[index] = rest;
    else lines.splice(index, 1);
    return lines.join("\n");
  }
  return null;
}

/** "12 claims: 11 research or offering, 1 seller statement" (FR-WRI-5). */
export function reviewSummary(claims: WriteOutput["claims"]): string {
  const live = claims.filter((claim) => claim.decision !== "remove");
  const backed = live.filter((claim) => claim.support === "research" || claim.support === "offering").length;
  const seller = live.filter((claim) => claim.support === "seller" || claim.decision === "accept_as_seller").length;
  const open = live.filter((claim) => claim.support === "neither" && !claim.decision).length;
  const parts = [`${backed} research or offering`];
  if (seller) parts.push(`${seller} seller ${seller === 1 ? "statement" : "statements"}`);
  if (open) parts.push(`${open} unsupported`);
  return `${live.length} ${live.length === 1 ? "claim" : "claims"}: ${parts.join(", ")}`;
}
