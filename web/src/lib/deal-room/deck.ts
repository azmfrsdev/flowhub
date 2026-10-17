import type { WorkspaceGraph } from "@/lib/offerings/view";
import { moneyTokens } from "@/lib/pricing/money";
import type { ClientDeck, DeckItem, DeckPhoto, FitOutput } from "@/lib/schema";
import { pricingGroups } from "./pricing-groups";

/**
 * The client deck (PRD 7.22, ADR-0015), the parts code decides. The model's
 * text restates the approved proposal's claims and code checks every item;
 * the fit, investment and proof slides are built here from the deal itself.
 * Pure and deterministic.
 */

/** What each text slot can hold: its box on the slide, measured at its font size (ADR-0015 consequences). */
export const DECK_BUDGET = {
  standfirst: 150,
  today: 110,
  change: 150,
  closing: 140,
  cardTitle: 42,
  cardText: 130,
  phaseName: 34,
  phaseDetail: 100,
  duration: 18,
  nextHeadline: 70,
  step: 90,
  noteBullet: 200,
  proofBody: 170,
  needText: 150,
  outsideNeed: 100,
  offeringNote: 80,
} as const;

export const DECK_LIMITS = { today: 3, change: 3, cards: 6, phases: 5, steps: 3, needs: 4, proof: 3, priceRows: 10, noteGroups: 4, noteBullets: 4 } as const;

type DraftItem = { text: string; refs: string[] };
export type DeckDraft = {
  heard: { standfirst: DraftItem; today: DraftItem[]; change: DraftItem[]; closing: DraftItem };
  deliver: { cards: { title: string; text: string; refs: string[] }[]; closing: DraftItem };
  plan: { phases: { name: string; detail: string; duration: string; refs: string[] }[]; closing: DraftItem };
  next: { headline: string; steps: DraftItem[] };
  notes: Record<string, { header: string; bullets: string[] }[]>;
};

/** Cuts text to its slot at a word boundary. The prompt asks for less; this only guards the layout. */
export function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6))).replace(/[,;:.\s-]+$/, "")}…`;
}

/** An amount, a price placeholder, or a private result's title or client never reaches a client deck. */
export function leaks(text: string, nonPublicNames: string[]): boolean {
  const lower = text.toLowerCase();
  return moneyTokens(text).length > 0 || text.includes("{{price:") || nonPublicNames.some((name) => name.trim().length >= 4 && lower.includes(name.trim().toLowerCase()));
}

/**
 * FR-DECK-3: keeps the model's items that restate a proposal claim, with no
 * amount and no private result; a timeline duration stays only if its numbers
 * appear in a claim it cites. Speaker notes lose any bullet that leaks.
 */
export function checkDeckDraft(draft: DeckDraft, evidence: Map<string, { id: string; text: string }>, nonPublicNames: string[]) {
  let dropped = 0;
  const idsOf = (refs: string[]) => [...new Set(refs.map((ref) => evidence.get(ref.trim())?.id).filter((id): id is string => Boolean(id)))];
  const textsOf = (refs: string[]) => refs.map((ref) => evidence.get(ref.trim())?.text ?? "").join(" ");
  const item = (raw: DraftItem | undefined, max: number): DeckItem | null => {
    const text = raw?.text?.trim() ?? "";
    if (!text) return null;
    const claimIds = idsOf(raw?.refs ?? []);
    if (claimIds.length === 0 || leaks(text, nonPublicNames)) {
      dropped += 1;
      return null;
    }
    return { text: clamp(text, max), claimIds };
  };
  const list = (raws: DraftItem[] | undefined, max: number, limit: number) => (raws ?? []).map((raw) => item(raw, max)).filter((kept): kept is DeckItem => kept !== null).slice(0, limit);

  const cards = (draft.deliver?.cards ?? [])
    .map((card) => {
      const claimIds = idsOf(card.refs ?? []);
      if (!card.title?.trim() || claimIds.length === 0 || leaks(`${card.title} ${card.text}`, nonPublicNames)) {
        dropped += 1;
        return null;
      }
      return { title: clamp(card.title, DECK_BUDGET.cardTitle), text: clamp(card.text ?? "", DECK_BUDGET.cardText), claimIds };
    })
    .filter((card): card is NonNullable<typeof card> => card !== null)
    .slice(0, DECK_LIMITS.cards);

  const phases = (draft.plan?.phases ?? [])
    .map((phase) => {
      const claimIds = idsOf(phase.refs ?? []);
      if (!phase.name?.trim() || claimIds.length === 0 || leaks(`${phase.name} ${phase.detail}`, nonPublicNames)) {
        dropped += 1;
        return null;
      }
      const duration = phase.duration?.trim() ?? "";
      const numbers = duration.match(/\d+/g) ?? [];
      const cited = textsOf(phase.refs ?? []);
      const durationKept = duration && numbers.length > 0 && numbers.every((number) => new RegExp(`\\b${number}\\b`).test(cited)) && !leaks(duration, nonPublicNames);
      return { name: clamp(phase.name, DECK_BUDGET.phaseName), detail: clamp(phase.detail ?? "", DECK_BUDGET.phaseDetail), ...(durationKept ? { duration: clamp(duration, DECK_BUDGET.duration) } : {}), claimIds };
    })
    .filter((phase): phase is NonNullable<typeof phase> => phase !== null)
    .slice(0, DECK_LIMITS.phases);

  const headline = draft.next?.headline?.trim() ?? "";
  const notes = Object.fromEntries(
    Object.entries(draft.notes ?? {}).map(([slide, groups]) => [
      slide,
      (groups ?? [])
        .slice(0, DECK_LIMITS.noteGroups)
        .map((group) => ({
          header: clamp(group.header ?? "", 40),
          bullets: (group.bullets ?? []).filter((bullet) => {
            if (!leaks(bullet, nonPublicNames)) return bullet.trim().length > 0;
            dropped += 1;
            return false;
          }).slice(0, DECK_LIMITS.noteBullets).map((bullet) => clamp(bullet, DECK_BUDGET.noteBullet)),
        }))
        .filter((group) => group.header && group.bullets.length > 0),
    ]),
  );

  return {
    heard: {
      standfirst: item(draft.heard?.standfirst, DECK_BUDGET.standfirst),
      today: list(draft.heard?.today, DECK_BUDGET.today, DECK_LIMITS.today),
      change: list(draft.heard?.change, DECK_BUDGET.change, DECK_LIMITS.change),
      closing: item(draft.heard?.closing, DECK_BUDGET.closing),
    },
    deliver: { cards, closing: item(draft.deliver?.closing, DECK_BUDGET.closing) },
    plan: { phases, closing: item(draft.plan?.closing, DECK_BUDGET.closing) },
    next: { headline: headline && !leaks(headline, nonPublicNames) ? clamp(headline, DECK_BUDGET.nextHeadline) : "", steps: list(draft.next?.steps, DECK_BUDGET.step, DECK_LIMITS.steps) },
    notes,
    dropped,
  };
}

/** FR-DECK-4: the fit slide, from the Gate C fit map. High-priority needs first; names come from the graph. */
export function deckFit(fit: Pick<FitOutput, "gaps" | "mappings" | "cannotMeet">, graph: Pick<WorkspaceGraph, "offerings" | "partners">): ClientDeck["fit"] {
  const offeringName = (type: string, id: string) => {
    if (type === "offering") return graph.offerings.find((offering) => offering.id === id)?.name;
    if (type === "feature") return graph.offerings.find((offering) => offering.features.some((feature) => feature.id === id))?.name;
    return undefined;
  };
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const outsideIds = new Set(fit.cannotMeet.map((item) => item.gapId));
  const needs = [...fit.gaps]
    .filter((gap) => !outsideIds.has(gap.id))
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .map((gap) => {
      const offerings: ClientDeck["fit"]["needs"][number]["offerings"] = [];
      for (const mapping of fit.mappings.filter((item) => item.gapId === gap.id)) {
        const name = offeringName(mapping.target.type, mapping.target.id);
        if (!name || offerings.some((offering) => offering.name === name)) continue;
        offerings.push({ name, strength: mapping.strength, ...(mapping.customisation ? { note: clamp(mapping.customisation, DECK_BUDGET.offeringNote) } : {}) });
      }
      return { text: clamp(gap.text, DECK_BUDGET.needText), priority: gap.priority, offerings };
    })
    .filter((need) => need.offerings.length > 0)
    .slice(0, DECK_LIMITS.needs);
  const outside = fit.cannotMeet.slice(0, 2).flatMap((item) => {
    const gap = fit.gaps.find((candidate) => candidate.id === item.gapId);
    if (!gap) return [];
    const partner = item.partner ? graph.partners.find((candidate) => candidate.id === item.partner!.id)?.name : undefined;
    return [{ need: clamp(gap.text, DECK_BUDGET.outsideNeed), ...(partner ? { partner } : {}) }];
  });
  return { needs, outside };
}

/** FR-DECK-4, invariant 1: the investment slide, with prices copied from the approved lines and grouped as the proposal's table is. */
export function deckInvestment(lines: FitOutput["pricing"]["lines"]): ClientDeck["investment"] {
  let room: number = DECK_LIMITS.priceRows;
  const groups = pricingGroups(lines).map((group) => {
    const shown = group.lines.slice(0, Math.max(0, room));
    room -= shown.length;
    return {
      title: group.title,
      lines: shown.map((line) => ({ label: line.label, price: line.unpriced ? "On quote" : line.total ? `${line.valueText} (${line.total})` : line.valueText })),
      subtotal: shown.length === group.lines.length ? group.subtotal : null,
    };
  });
  return { groups: groups.filter((group) => group.lines.length > 0) };
}

/**
 * Invariant 5: the proof slide shows only results marked public, for the
 * offerings this deal maps to. The ones the fit map relied on come first.
 */
export function deckProof(fit: Pick<FitOutput, "mappings">, graph: Pick<WorkspaceGraph, "proof" | "offerings">): ClientDeck["proof"] {
  const cited = fit.mappings.flatMap((mapping) => mapping.proofRefs.map((ref) => ref.id));
  const mapped = new Set(
    fit.mappings.flatMap((mapping) => {
      if (mapping.target.type === "offering") return [mapping.target.id];
      const parent = graph.offerings.find((offering) => offering.features.some((feature) => feature.id === mapping.target.id));
      return parent ? [parent.id] : [];
    }),
  );
  const publicProof = graph.proof.filter((item) => item.isPublic && (cited.includes(item.id) || item.offeringIds.some((id) => mapped.has(id))));
  const ordered = [...publicProof.filter((item) => cited.includes(item.id)), ...publicProof.filter((item) => !cited.includes(item.id))];
  return ordered.slice(0, DECK_LIMITS.proof).map((item) => ({ title: clamp(item.title, 70), body: clamp(item.body, DECK_BUDGET.proofBody), ...(item.clientName ? { client: item.clientName } : {}) }));
}

/** A photo search keeps scene words only: never a word of the prospect's or the seller's name ("MR D.I.Y." drops "mr" and "diy"). */
export function photoQuery(query: string, names: string[]): string {
  const letters = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const banned = new Set(names.flatMap((name) => name.split(/\s+/)).map(letters).filter((word) => word.length >= 2));
  return query
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((word) => word && !banned.has(letters(word)))
    .join(" ")
    .slice(0, 60);
}

const LICENCE_NAME: Record<DeckPhoto["license"], string> = { cc0: "CC0", pdm: "Public Domain Mark", by: "CC BY", "by-sa": "CC BY-SA" };

/** The credit line printed under a photo (FR-DECK-5). */
export function photoCredit(photo: DeckPhoto): string {
  const licence = `${LICENCE_NAME[photo.license]}${photo.licenseVersion && photo.license !== "pdm" ? ` ${photo.licenseVersion}` : ""}`;
  return `Photo: "${photo.title}" by ${photo.creator}, ${licence}, via Openverse. ${photo.sourceUrl}`;
}
