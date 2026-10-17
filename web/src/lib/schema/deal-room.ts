import { z } from "zod";
import { Contact } from "./offering-graph";
import { Actor, GraphRef, Id, IsoDate } from "./common";

/**
 * Deal-room data model (ADR-0005), with the stage output shapes from
 * ADR-0006 and the ADR-0009 additions (told leads, interested-in offerings,
 * actor markers on events). Internal: not part of the R12 exchange format.
 */

export const StageKey = z.enum(["intake", "research", "fit", "write"]);
export type StageKey = z.infer<typeof StageKey>;

export const StageState = z.enum(["idle", "running", "waiting", "approved", "stale", "failed"]);
export type StageState = z.infer<typeof StageState>;

export const IntakeType = z.enum(["told", "meeting_invite", "client_email", "company_url", "tender_document", "news"]);

export const OpportunityStatus = z.enum(["new", "researching", "proposing", "sent", "won", "lost", "no_decision"]);

export const StageSummary = z.object({
  state: StageState,
  currentRunId: Id.nullable(),
  updatedAt: IsoDate,
});

export const Opportunity = z.object({
  id: Id,
  workspaceId: Id,
  prospect: z
    .object({ name: z.string().min(1), website: z.string().optional(), country: z.string().optional() })
    .nullable(),
  contact: Contact.optional(),
  persona: z.enum(["sme", "startup", "enterprise"]).default("sme"),
  intakeType: IntakeType,
  source: z.string(),
  interestedOfferingIds: z.array(Id).default([]),
  nextMeeting: z.string().optional(),
  value: z.string().nullable().default(null),
  status: OpportunityStatus,
  outcome: z
    .object({
      result: z.enum(["won", "lost", "no_decision"]),
      reason: z.string(),
      note: z.string().optional(),
      at: IsoDate,
      by: z.string(),
    })
    .nullable()
    .default(null),
  score: z.number().min(0).max(100).nullable().default(null),
  recommendation: z.enum(["go", "consider", "nogo"]).nullable().default(null),
  inputs: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("text"), text: z.string().max(20000) }),
        z.object({ kind: z.literal("file"), storagePath: z.string(), name: z.string(), contentType: z.string().optional() }),
        z.object({ kind: z.literal("url"), url: z.string() }),
        z.object({ kind: z.literal("proposal"), proposalId: Id }),
      ]),
    )
    .default([]),
  stages: z.object({
    intake: StageSummary,
    research: StageSummary,
    fit: StageSummary,
    write: StageSummary,
  }),
  latestDoc: z.object({ url: z.string(), runId: Id }).nullable().default(null),
  rev: z.number().int().nonnegative(),
  createdAt: IsoDate,
  createdBy: z.string(),
  updatedAt: IsoDate,
  deletedAt: IsoDate.nullable().default(null),
});
export type Opportunity = z.infer<typeof Opportunity>;

/* ---------- Stage outputs ---------- */

export const IntakeOutput = z.object({
  persona: z.enum(["sme", "startup", "enterprise"]),
  intakeType: IntakeType,
  prospect: z
    .object({
      name: z.string(),
      website: z.string().optional(),
      country: z.string().optional(),
      oneLine: z.string().optional(),
    })
    .nullable(),
  contacts: z.array(Contact).default([]),
  meeting: z.string().optional(),
  askingFor: z.array(z.string()).default([]),
  requirements: z
    .array(
      z.object({
        id: Id,
        text: z.string(),
        sourceLine: z.string().optional(),
        /** FR-INT-3: the page of an attached PDF the requirement comes from. */
        page: z.number().int().positive().optional(),
        /** Set by code: the source line was found on that page of the PDF's text. A scan's pages can't be checked. */
        pageChecked: z.boolean().optional(),
      }),
    )
    .default([]),
  budgetSignals: z.array(z.string()).default([]),
  deadlines: z.array(z.string()).default([]),
  /** FR-INT-6: set when no company could be identified. */
  needsCompany: z.boolean().default(false),
});
export type IntakeOutput = z.infer<typeof IntakeOutput>;

export const BriefSection = z.enum(["snapshot", "news", "hiring", "tech", "sector", "needs", "questions"]);

export const WebSource = z.object({
  id: Id,
  /** Stored exactly as Google Search grounding returned it (invariant 3). */
  groundingUri: z.string(),
  title: z.string(),
  domain: z.string(),
  publishedAt: z.string().optional(),
  retrievedAt: IsoDate,
  queries: z.array(z.string()).default([]),
});
export type WebSource = z.infer<typeof WebSource>;

export const Claim = z.object({
  id: Id,
  section: BriefSection,
  text: z.string(),
  sourceIds: z.array(Id).min(1),
  removed: z.boolean().optional(),
});
export type Claim = z.infer<typeof Claim>;

export const BriefOutput = z.object({
  sections: z.array(z.object({ key: BriefSection, status: z.enum(["ok", "nothing_found"]) })),
  claims: z.array(Claim),
  inferences: z.array(
    z.object({ id: Id, section: z.enum(["needs", "sector"]), text: z.string(), basedOn: z.array(Id).min(1) }),
  ),
  sources: z.record(z.string(), WebSource),
  droppedCount: z.number().int().nonnegative(),
  /** searchEntryPoint.renderedContent HTML, shown unchanged. */
  searchSuggestions: z.array(z.string()),
  detectedTech: z.array(
    z.object({
      category: z.string(),
      value: z.string(),
      label: z.string(),
      sourceIds: z.array(Id),
      matchesSeller: z.boolean(),
    }),
  ),
  questions: z.array(z.object({ id: Id, text: z.string(), basedOn: z.array(z.string()) })),
  sellerNotes: z.array(z.object({ id: Id, text: z.string(), by: z.string(), at: IsoDate })).default([]),
});
export type BriefOutput = z.infer<typeof BriefOutput>;

export const PriceLineRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cell"), cardId: Id, rowId: Id, colId: Id, rev: z.number().int() }),
  z.object({ kind: z.literal("fee"), scheduleId: Id, lineId: Id, rev: z.number().int() }),
]);
export type PriceLineRef = z.infer<typeof PriceLineRef>;

export const FitOutput = z.object({
  gaps: z.array(
    z.object({
      id: Id,
      text: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      /** "person": added by hand at Gate C (FR-FIT-7); `ref` is their name. */
      origin: z.object({ kind: z.enum(["intake", "claim", "note", "person"]), ref: z.string() }),
    }),
  ),
  mappings: z.array(
    z.object({
      gapId: Id,
      target: GraphRef,
      strength: z.enum(["strong", "partial", "weak"]),
      featureRefs: z.array(z.string()),
      proofRefs: z.array(z.object({ id: Id, isPublic: z.boolean() })),
      customisation: z.string().optional(),
      /** Gate C (FR-FIT-7): who wrote the customisation note, when a person did. It is then the seller's own statement. */
      customisedBy: z.string().optional(),
      /** Gate C (FR-FIT-7): who added this mapping by hand. */
      mappedBy: z.string().optional(),
    }),
  ),
  cannotMeet: z.array(
    z.object({
      gapId: Id,
      constraint: GraphRef,
      partner: GraphRef.optional(),
      /** Set by code: a company-wide selling rule the prospect breaks (FR-FIT-3). It caps the score at No-go (FR-FIT-4). */
      sellingRule: z.boolean().optional(),
    }),
  ),
  score: z.object({
    value: z.number().min(0).max(100),
    band: z.enum(["go", "consider", "nogo"]),
    components: z.object({
      coverage: z.number(),
      penalties: z.number(),
      techBonus: z.number(),
      /** FR-FIT-4: the score was held at No-go because the prospect breaks a selling rule. */
      ruleCap: z.boolean().optional(),
    }),
  }),
  reasons: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })).length(3),
  pricing: z.object({
    lines: z.array(
      z.object({
        id: Id,
        ref: PriceLineRef,
        label: z.string(),
        /** Copied by code from the graph. A model never writes this field. */
        valueText: z.string(),
        basis: z.enum(["one_time", "recurring", "variable"]),
        quantity: z.object({ value: z.number(), claimId: z.string() }).optional(),
        total: z.string().optional(),
        unpriced: z.boolean(),
      }),
    ),
  }),
});
export type FitOutput = z.infer<typeof FitOutput>;

export const ClaimSupport = z.enum(["research", "offering", "seller", "neither"]);

export const WriteOutput = z.object({
  persona: z.enum(["sme", "startup", "enterprise"]),
  tone: z.enum(["formal", "friendly", "concise"]),
  blocks: z.array(
    z.object({
      id: Id,
      section: z.string(),
      kind: z.enum(["heading", "paragraph", "bullets", "pricing_table", "quote"]),
      /** May contain {{price:<lineId>}} placeholders, rendered by code. */
      text: z.string(),
      claimIds: z.array(Id),
    }),
  ),
  claims: z.array(
    z.object({
      id: Id,
      blockId: Id,
      text: z.string(),
      support: ClaimSupport,
      refs: z.array(z.string()),
      hardCheck: z.enum(["price_not_from_graph", "unknown_ref", "non_public_proof", "cost_leak", "planned_feature"]).optional(),
      /** Written because the salesperson asked for it (FR-WRI-3); not revised away, decided at Gate D. */
      requested: z.boolean().optional(),
      decision: z.enum(["accept_as_seller", "remove"]).optional(),
    }),
  ),
  loops: z.number().int().min(0).max(2),
  doc: z.object({ id: z.string(), url: z.string(), publishedAt: IsoDate }).optional(),
});
export type WriteOutput = z.infer<typeof WriteOutput>;

/**
 * `opportunities/{id}/followUps/{writeRunId}` (C3): the follow-up email after a
 * proposal, ready to copy. FlowHub never sends it. Each sentence names the
 * proposal claims it restates; a factual sentence with none is flagged.
 */
export const FollowUp = z.object({
  writeRunId: Id,
  subject: z.string(),
  paragraphs: z.array(z.object({ sentences: z.array(z.object({ text: z.string(), claimIds: z.array(Id), flagged: z.boolean().optional() })) })),
  /** Sentences code removed: an amount, a price, or a result marked not public. */
  removed: z.number().int().nonnegative(),
  tone: z.enum(["formal", "friendly", "concise"]),
  createdAt: IsoDate,
  createdBy: z.string(),
});
export type FollowUp = z.infer<typeof FollowUp>;

/* ---------- Runs and events ---------- */

export const RunError = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() });

export const Run = z.object({
  id: Id,
  stage: StageKey,
  attempt: z.number().int().positive(),
  state: z.enum(["running", "waiting", "approved", "stale", "failed"]),
  inputs: z.object({
    upstreamRunIds: z.partialRecord(StageKey, Id),
    graphRefs: z.array(GraphRef).optional(),
    options: z
      .object({
        tone: z.enum(["formal", "friendly", "concise"]).optional(),
        instructions: z.string().max(500).optional(),
      })
      .optional(),
  }),
  /** The model's result. Written once, never edited (invariant 11). */
  output: z.unknown().nullable(),
  /** The human's copy. Locked at the gate. */
  working: z.unknown().nullable(),
  approvedAt: IsoDate.nullable(),
  approvedBy: z.string().nullable(),
  startedAt: IsoDate,
  startedBy: z.string(),
  lastEventAt: IsoDate,
  endedAt: IsoDate.nullable(),
  error: RunError.nullable(),
  metrics: z
    .object({
      groundedQueries: z.number().optional(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      ms: z.number().optional(),
    })
    .nullable(),
  rev: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  /** FR-DR-4: this run reopened an approved one at its gate, without calling a model. */
  reopenedFrom: Id.optional(),
});
export type Run = z.infer<typeof Run>;

export const RunEvent = z.object({
  /** Document ID is seq zero-padded to 6 digits, so a retried write can't duplicate. */
  seq: z.number().int().nonnegative(),
  at: IsoDate,
  actor: Actor,
  kind: z.enum(["step", "source", "warning", "error", "done"]),
  /** User-facing, e.g. "Reading anjungserai.example". */
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;
