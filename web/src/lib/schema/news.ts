import { z } from "zod";
import { Id, IsoDate } from "./common";
import { Claim, WebSource } from "./deal-room";

/**
 * News scout (PRD 7.21, ADR-0014). An edition is a snapshot of sourced leads,
 * written by the scout pipeline only. Internal: not part of the R12 exchange format.
 */

export const NewsTrigger = z.enum(["expansion", "funding", "new_leader", "tender", "regulation", "digital_project", "results", "partnership", "other"]);
export type NewsTrigger = z.infer<typeof NewsTrigger>;

export const NewsBeat = z.enum(["clients", "services", "local", "tenders"]);
export type NewsBeat = z.infer<typeof NewsBeat>;

export const NewsStory = z.object({
  id: Id,
  company: z.string().min(1).max(120),
  country: z.string().max(2).optional(),
  headline: z.string().min(1).max(120),
  trigger: NewsTrigger,
  /** The sourced sentences the story rests on (invariant 3). */
  claims: z.array(Claim).min(1),
  /** Why it could be a lead for this company, in the model's words. */
  why: z.string().max(300),
  offeringIds: z.array(Id).min(1),
  /** FR-NEWS-5: calculated in code. */
  score: z.number().int().min(0).max(100),
  label: z.enum(["hot", "worth_a_look", "long_shot"]),
  /** Months since the newest dated sentence, when one is dated. */
  ageMonths: z.number().int().min(0).nullable(),
  opportunityId: Id.nullable().default(null),
});
export type NewsStory = z.infer<typeof NewsStory>;

/** `workspaces/{ws}/editions/{yyyy-mm-dd}`: one per Malaysia day (FR-NEWS-8). */
export const NewsEdition = z.object({
  /** The Malaysia day it was printed, YYYY-MM-DD. */
  id: Id,
  printedAt: IsoDate,
  printedBy: z.string(),
  beats: z.array(z.object({ key: NewsBeat, title: z.string(), claims: z.number().int().min(0) })),
  stories: z.array(NewsStory),
  sources: z.record(z.string(), WebSource),
  searchSuggestions: z.array(z.string()).default([]),
  /** FR-NEWS-2, FR-NEWS-4: what was left out, and why. */
  left: z.object({
    unsourced: z.number().int().min(0),
    known: z.array(z.string()).default([]),
    rules: z.array(z.object({ company: z.string(), reason: z.string() })).default([]),
    unmatched: z.number().int().min(0),
  }),
});
export type NewsEdition = z.infer<typeof NewsEdition>;
