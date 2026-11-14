import { z } from "zod";
import { Id, IsoDate } from "./common";

/**
 * Gmail inbox leads (PRD 7.27, ADR-0020). An email that the Apps Script in the
 * seller's own Google account sends in becomes an inbox item. Gemini reads it;
 * code checks every quote, the company, the offerings, known deals, selling
 * rules and the score. Written by the inbox pipeline and server actions only.
 * Internal: not part of the R12 exchange format.
 */

export const InboxVerdict = z.enum(["lead", "maybe", "existing_deal", "not_a_lead"]);
export type InboxVerdict = z.infer<typeof InboxVerdict>;

/** What a reason shows. `request`, `deadline`, `budget` and `need` count towards the score. */
export const InboxReasonKind = z.enum(["need", "request", "deadline", "budget", "other"]);
export type InboxReasonKind = z.infer<typeof InboxReasonKind>;

/**
 * - `intake_started`: a clear lead; FlowHub opened the deal and started intake, which stops at Gate A.
 * - `waiting`: a person decides: open a deal, or not a lead.
 * - `opened`: a person opened the deal.
 * - `added_to_deal`: from a company that is already a deal; shown in that deal room.
 * - `filed`: not a lead. Only the sender, subject, date and reason are kept.
 * - `dismissed`: a person said it isn't a lead. The body is removed.
 * - `reread`: a person said a "Not a lead" is a lead; the next send from Gmail reads it again.
 */
export const InboxStatus = z.enum(["intake_started", "waiting", "opened", "added_to_deal", "filed", "dismissed", "reread"]);
export type InboxStatus = z.infer<typeof InboxStatus>;

/** The email the Apps Script sends (POST /api/inbox). The body is plain text, cut to 20,000 characters by the script and again here. */
export const InboxEmail = z.object({
  messageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  threadId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  from: z.string().min(3).max(320),
  to: z.string().max(2000).optional(),
  subject: z.string().max(500).default(""),
  body: z.string().max(60_000).transform((text) => text.slice(0, 20_000)),
  receivedAt: IsoDate,
});
export type InboxEmail = z.infer<typeof InboxEmail>;

/** Where an inbox item came from: an email the Gmail script sent, or the website's Google Form (PRD 7.30, ADR-0022). */
export const InboxSource = z.enum(["gmail", "form"]);
export type InboxSource = z.infer<typeof InboxSource>;

/**
 * One answer to the website's Google Form "Talk to <seller>" (POST /api/inbox,
 * action `form`), as the same Apps Script's form trigger sends it. The work
 * email is required, and so is the consent tick (Malaysia's PDPA): without it
 * the answer is refused before anything is read.
 */
export const InboxForm = z.object({
  responseId: z.string().regex(/^[A-Za-z0-9_-]{6,120}$/),
  submittedAt: IsoDate,
  name: z.string().trim().max(200).default(""),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  company: z.string().trim().max(200).default(""),
  website: z.string().trim().max(500).default(""),
  /** The ticked services, by their names on the form. Code maps them to live offerings; unknown names are dropped and counted. */
  services: z.array(z.string().trim().max(200)).max(20).default([]),
  timeline: z.string().trim().max(100).default(""),
  message: z.string().max(30_000).default("").transform((text) => text.slice(0, 10_000)),
  consent: z.literal(true, { error: "The form's consent tick is required." }),
});
export type InboxForm = z.infer<typeof InboxForm>;

/** Gemini's reading of one email (structured output). Code checks every field before anything is kept. */
export const InboxReading = z.object({
  verdict: InboxVerdict,
  /** One line: what the email is about. For a non-lead, why it isn't one. */
  summary: z.string().min(1).max(300),
  /** The sender's company as the email writes it, such as in the signature. Kept only if it appears in the email. */
  company: z.string().max(120).optional(),
  reasons: z
    .array(
      z.object({
        kind: InboxReasonKind,
        text: z.string().min(1).max(200),
        /** Words copied from the email. Code keeps the reason only if they are there word for word. */
        quote: z.string().min(1).max(300),
      }),
    )
    .max(8),
  /** Catalogue references, such as `off_gcm` or `off_gcm/f_lz`. Code keeps only live ones. */
  matches: z.array(z.string().max(80)).max(8),
});
export type InboxReading = z.infer<typeof InboxReading>;

export const InboxReason = z.object({ kind: InboxReasonKind, text: z.string(), quote: z.string() });
export type InboxReason = z.infer<typeof InboxReason>;

export const InboxMatch = z.object({ offeringId: Id, featureId: Id.optional(), label: z.string() });
export type InboxMatch = z.infer<typeof InboxMatch>;

/** `workspaces/{ws}/inbox/gm_{messageId}` for an email, `wf_{responseId}` for a website form answer. */
export const InboxItem = z.object({
  id: Id,
  source: InboxSource.default("gmail"),
  messageId: z.string(),
  threadId: z.string(),
  from: z.object({ name: z.string(), email: z.string() }),
  subject: z.string(),
  receivedAt: IsoDate,
  triagedAt: IsoDate,
  /** The email text. Null for a non-lead (ADR-0020 D5): never stored, or removed when a person dismisses it. */
  body: z.string().nullable(),
  verdict: InboxVerdict,
  /** What Gemini said, before code checked it. Code only ever lowers a verdict. */
  modelVerdict: InboxVerdict,
  /** Gemini's one line. For a non-lead, the reason it isn't one. */
  summary: z.string(),
  reasons: z.array(InboxReason),
  /** Reasons dropped because their quote isn't in the email. */
  dropped: z.number().int().nonnegative(),
  company: z.object({
    name: z.string().nullable(),
    domain: z.string().nullable(),
    freeMail: z.boolean(),
    country: z.string().length(2).optional(),
    /** The name came from the email itself (checked word for word), not from the domain. */
    nameFromEmail: z.boolean().default(false),
  }),
  matches: z.array(InboxMatch),
  rules: z.array(z.object({ reason: z.string() })).default([]),
  /** A website form answer's own fields (PRD 7.30): what the person typed, and the services they ticked. */
  form: z
    .object({
      company: z.string().nullable(),
      website: z.string().nullable(),
      services: z.array(z.string()),
      /** Ticked names that matched no live offering, so were dropped. */
      servicesDropped: z.number().int().nonnegative(),
      timeline: z.string().nullable(),
    })
    .optional(),
  /** Set when the sender is a partner recorded in the hub. */
  partner: z.string().nullable().default(null),
  score: z.number().int().min(0).max(100),
  breakdown: z.array(z.object({ label: z.string(), points: z.number().int() })),
  opportunityId: Id.nullable(),
  /** The deal's name, for the Gmail label "FlowHub · <deal name>". */
  dealName: z.string().nullable().default(null),
  status: InboxStatus,
  decidedBy: z.string().optional(),
  decidedAt: IsoDate.optional(),
});
export type InboxItem = z.infer<typeof InboxItem>;

/** `workspaces/{ws}.inbox`: Settings › Inbox. The key itself is never stored, only its SHA-256 (`inboxKeys/{hash}`). */
export const InboxSettings = z.object({
  /** The last four characters of the key, to recognise it. */
  keyHint: z.string().max(8).nullable().default(null),
  keyHash: z.string().nullable().default(null),
  keyCreatedAt: IsoDate.nullable().default(null),
  /** Decision 1: a clear lead starts intake on its own. */
  autoIntake: z.boolean().default(true),
  /** The Gmail address the script runs in, as it last reported. */
  mailbox: z.string().max(320).nullable().default(null),
  lastSeenAt: IsoDate.nullable().default(null),
  /** The website form (PRD 7.30), as the script last reported it: the Google Form's address and the website that embeds it. */
  formUrl: z.string().max(500).nullable().default(null),
  siteUrl: z.string().max(500).nullable().default(null),
  lastFormAt: IsoDate.nullable().default(null),
});
export type InboxSettings = z.infer<typeof InboxSettings>;

/** Decision 5: at most this many emails are read per workspace per day. */
export const INBOX_DAILY_LIMIT = 30;
/** Decision 1: a clear lead scores at least this. */
export const CLEAR_LEAD = 70;
