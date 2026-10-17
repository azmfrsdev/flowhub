import { z } from "zod";
import { Id, IsoDate } from "./common";

/**
 * The client deck (PRD 7.22, ADR-0015): `opportunities/{id}/decks/{writeRunId}`.
 * The checked text the model wrote, the facts code took from the deal, photo
 * credits and speaker notes. The .pptx is rendered from this record on demand.
 * Internal: not part of the R12 exchange format.
 */

export const DECK_SLIDES = ["title", "heard", "fit", "deliver", "plan", "investment", "proof", "next"] as const;
export type DeckSlide = (typeof DECK_SLIDES)[number];

/** A line on a slide, with the proposal claims it restates (FR-DECK-3). */
export const DeckItem = z.object({ text: z.string(), claimIds: z.array(Id) });
export type DeckItem = z.infer<typeof DeckItem>;

export const DeckPhoto = z.object({
  url: z.string(),
  thumbnail: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  title: z.string(),
  creator: z.string(),
  license: z.enum(["cc0", "pdm", "by", "by-sa"]),
  licenseVersion: z.string().optional(),
  licenseUrl: z.string().optional(),
  sourceUrl: z.string(),
  /** The search it was found with: scene words only, never a company name. */
  query: z.string().optional(),
});
export type DeckPhoto = z.infer<typeof DeckPhoto>;

export const DeckNotes = z.array(z.object({ header: z.string(), bullets: z.array(z.string()) }));

export const ClientDeck = z.object({
  writeRunId: Id,
  /** The working copy's rev the deck was written from (FR-DECK-7). */
  rev: z.number().int().nonnegative(),
  title: z.object({ prospect: z.string(), seller: z.string(), headline: z.string(), date: z.string(), presenter: z.string() }),
  heard: z.object({ standfirst: DeckItem.nullable(), today: z.array(DeckItem), change: z.array(DeckItem), closing: DeckItem.nullable() }),
  /** Code-built from the Gate C fit map (FR-DECK-4). */
  fit: z.object({
    needs: z.array(z.object({ text: z.string(), priority: z.enum(["high", "medium", "low"]), offerings: z.array(z.object({ name: z.string(), strength: z.enum(["strong", "partial", "weak"]), note: z.string().optional() })) })),
    outside: z.array(z.object({ need: z.string(), partner: z.string().optional() })),
  }),
  deliver: z.object({ cards: z.array(z.object({ title: z.string(), text: z.string(), claimIds: z.array(Id) })), closing: DeckItem.nullable() }),
  plan: z.object({ phases: z.array(z.object({ name: z.string(), detail: z.string(), duration: z.string().optional(), claimIds: z.array(Id) })), closing: DeckItem.nullable() }),
  /** Code-built from the approved pricing lines; prices copied by code (invariant 1). */
  investment: z.object({ groups: z.array(z.object({ title: z.string(), lines: z.array(z.object({ label: z.string(), price: z.string() })), subtotal: z.string().nullable() })) }),
  /** Public results only (invariant 5). */
  proof: z.array(z.object({ title: z.string(), body: z.string(), client: z.string().optional() })),
  next: z.object({ headline: z.string(), steps: z.array(DeckItem) }),
  notes: z.record(z.string(), DeckNotes),
  photos: z.object({ title: DeckPhoto.nullable(), proof: DeckPhoto.nullable() }),
  /** FR-DECK-3: items code dropped (no claim behind them, an amount, or a private result). */
  dropped: z.number().int().nonnegative(),
  createdAt: IsoDate,
  createdBy: z.string(),
  slides: z.object({ id: z.string(), url: z.string(), createdAt: IsoDate }).nullable().default(null),
});
export type ClientDeck = z.infer<typeof ClientDeck>;
