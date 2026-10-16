---
status: accepted
date: 2026-09-25
deciders: FlowHub maintainers
---

# ADR-0001: Offering graph data model

## Context and problem statement

The offering graph is the seller's structured memory: what they sell, at what price, with what proof, and what they will not do. It is one of the two things that must be visibly at the core of FlowHub (the other is cited research). The Fit Analyst matches prospect gaps against it, the Pricing agent reads prices only through function calls into it, and the Writer and Reviewer cite it the way the Researcher cites the web.

`docs/requirements/CARRIED-REQUIREMENTS.md` (R1 to R12) gives tested entity shapes from a relational model. This ADR confirms them and decides how they map to Firestore. It also settles the question the requirements leave open: whether rate card cells are separate documents or a map on the card.

Out of scope, for later ADRs: opportunity and deal-room state (R8 beyond the row shape), agent hosting, and agent implementation language.

## Decision drivers

- **Trust invariants hold by construction, not by remembering a filter.** Agents see only confirmed entities, cost never reaches generation, and workspaces never leak into each other.
- **Every entity, row and cell cites its source** (document, version, page), so the seller's own material can be cited like a web source.
- **Rate cards stay editable as grids.** Columns are data, cells are free text, and adding a column is a form, never a migration (R2).
- **One schema drives everything:** extraction, the review screen, storage, agent tools and the exchange format (R12).
- **Realistic scale:** a workspace holds tens to low hundreds of entities. A rate card is at most a few hundred cells.
- **Four weeks to build**, on free tiers.

## Decision outcome

Accepted on 2026-09-25: seven decisions, D1 to D7 below. Each lists the options that were considered.

### Collection layout

```
workspaces/{ws}                       name, currency (e.g. "MYR"), createdAt
  members/{uid}
  offerings/{id}                      R1: parentId, features[], technology[], partnerIds[]
  rateCards/{id}                      R2: offeringId, kind, columns[], rows[], cells{}
  feeSchedules/{id}                   R3: offeringId, lines[]
  proof/{id}                          R4: offeringIds[], isPublic
  constraints/{id}                    R5: offeringIds[] (empty = applies to the whole seller)
  partners/{id}                       R6: covers[], technology[], contacts[]
  documents/{id}                      kind, currentVersionId, textStatus
    versions/{id}                     storagePath, textStatus, extraction{status, proposalPath, error}
  chunks/{id}                         embedding, text, ref, restricted, live
  auditEvents/{id}                    action, entityType, entityId, before, after, actor, at
  opportunities/{id}                  R8, decided in a later ADR
```

### Common envelope on every graph entity

```ts
type SourceRef = {
  documentId: string;
  versionId: string;
  locator: { page?: number; slide?: number; sheet?: string; range?: string };
  quote?: string;                 // at most ~300 chars, shown in citation chips and used by the Reviewer
};

type Envelope = {
  id: string;
  workspaceId: string;            // redundant with the path; kept for export, audits and collection-group queries
  rev: number;                    // +1 on every write; citations pin {type, id, rev}
  origin: 'extracted' | 'manual' | 'imported';
  sources: SourceRef[];
  restricted: boolean;
  lastVerified?: { by: string; at: Timestamp };   // offerings and rate cards (R10)
  deletedAt: Timestamp | null;
  deleteBatchId: string | null;   // restore brings back everything deleted together (R10)
  createdAt: Timestamp; updatedAt: Timestamp; updatedBy: string;
};
```

### Entity shapes

```ts
type TechPair = { category: TechCategory; value: string /* catalogue key or 'other' */; label: string };  // R7

type Offering = Envelope & {
  parentId: string | null;        // sub-offering if own terms, owner or client (R1); UI and extraction cap depth at 2
  name: string; summary: string; description: string;
  status: 'active' | 'pilot' | 'retired';
  owner?: string;
  features: { id: string; name: string; description: string; status: string; sources?: SourceRef[] }[];  // array order is the order
  technology: TechPair[];         // seller's integrations; matched against the prospect's detected stack
  partnerIds: string[];           // R6
};

type RateCard = Envelope & {
  offeringId: string;
  kind: 'pricing' | 'cost';
  name: string; note?: string;
  columns: { id: string; label: string; note?: string; sources?: SourceRef[] }[];     // package, tier or provider
  rows:    { id: string; label: string; groupLabel?: string; sources?: SourceRef[] }[];  // heading renders when groupLabel changes
  cells: Record<string /* rowId */, Record<string /* colId */, {
    value: string;                // free text: "1.5%", "RM 0.50", "1.2% min RM 0.20", "Waived", "On quote"
    isCurrent?: boolean;
    sources?: SourceRef[];
  }>>;                            // only cells with a value exist; clearing a cell deletes the key
};

type FeeSchedule = Envelope & {
  offeringId: string; name: string;
  lines: {                        // array order is the order: one-time, then recurring, then variable
    id: string; groupLabel?: string; label: string;
    basis: 'one_time' | 'monthly' | 'annual' | 'per_transaction' | 'per_unit' | 'hourly' | 'daily' | 'other';
    price: string; cost?: string; // free text; margin is derived on screen only, never stored
    paidTo?: string; owner?: string; note?: string; sources?: SourceRef[];
  }[];
};

type Proof = Envelope & {
  kind: 'case_study' | 'metric' | 'logo' | 'testimonial';
  title: string; body: string; clientName?: string;
  isPublic: boolean;              // the Writer may cite only public proof
  offeringIds: string[];
};

type Constraint = Envelope & {
  kind: 'region' | 'industry' | 'min_deal_size' | 'integration' | 'other';
  statement: string;              // "We do not take projects under RM 20,000"
  values: string[];               // optional machine-matchable values: country codes, industry keys
  offeringIds: string[];          // empty means the constraint applies to every offering
};

type Partner = Envelope & {
  name: string; covers: string[]; technology: TechPair[];
  contacts: { name: string; role?: string; email?: string }[];   // contacts belong to the partner (R6)
  note?: string;
};
```

**Mapping to the proposal's entity names:**

- **Tier** is not a separate entity. Tiers and packages are rate card columns, and what each tier includes is expressed as rows and cells ("10 pages", "Included", "RM 5,000").
- **RateLine** is a fee schedule line.
- **PastProposal** is a document with `kind: 'past_proposal'`. It is a source for Proof extraction and a style example for the Writer, not a graph entity.

### D1. Scope by workspace path

| Option | Pros | Cons |
|---|---|---|
| **A. Collections nested under `workspaces/{ws}`** | Security rules, vector queries, export and delete are all scoped by path, so a missed filter cannot leak across workspaces | Cross-workspace admin queries need collection-group queries (none are needed) |
| B. Top-level collections with a `workspaceId` field | Flexible cross-workspace queries | Every query and every rule must remember the filter. One miss is a leak |

**Chosen: A.** `workspaceId` is still stored on every document, because it costs nothing and the exported file needs it.

### D2. Typed peer collections, with links as ID arrays

| Option | Pros | Cons |
|---|---|---|
| A. One document per offering, with everything embedded | One read per offering | Proof and partners are shared across offerings, so this duplicates them and breaks R6. Also risks the document size limit |
| **B. A collection per entity type, links as ID arrays** | Matches R1 to R7 one to one. `array-contains` answers "proof for offering X". Each type is validated separately | No referential integrity: readers ignore IDs that are dangling or point at deleted items |
| C. A generic `nodes` plus `edges` collection | True graph traversal | Every read is a join, typed validation is lost, and it is overkill at hundreds of nodes |

**Chosen: B.** A link is stored on the side that points at offerings: RateCard, FeeSchedule, Proof and Constraint each hold `offeringId` or `offeringIds`. Offering holds `partnerIds`. Because a workspace graph is small, the usual read path is to **load the whole confirmed graph once**. Nothing needs multi-hop graph queries.

### D3. A rate card is one document, with cells as a nested map

| Option | Pros | Cons |
|---|---|---|
| **A. Columns, rows and a `cells[rowId][colId]` map, all on the card document** | One read renders the grid and one write saves it, atomically. The same shape as the exchange format. Audit gets a clean before and after | Capped at 1 MiB per document. Two people editing the same card conflict |
| B. `columns`, `rows` and `cells` subcollections | Per-cell writes, and no size cap | A 10 × 20 grid takes about 230 reads to render. Ordering, deletes and atomic saves span many documents |

**Chosen: A.** At about 300 bytes per cell including source pointers, a card holds roughly 3,000 cells before reaching the limit, far beyond real price sheets.

- The `cells` field is exempt from single-field indexing.
- A save is conditional on `rev`, so a stale editor gets a conflict instead of silently overwriting.
- If a card ever goes past about 500 KB, split it into several cards (by group). Moving to subcollections is not the escape route.

The same reasoning puts **fee schedule lines** in an array on the schedule document, and **features** in an array on the offering. In both, array order is the display order, so no `order` fields need renumbering.

### D4. Extraction lands in a staging proposal, never in the live graph

| Option | Pros | Cons |
|---|---|---|
| A. Extracted entities written to the live collections with `status: 'draft'` | One shape and one place | Every agent query must filter on status. One missed filter breaks invariant 6 |
| **B. Each document version gets a proposal file in exchange format. Confirming it writes the entities to the live graph** | Agents cannot see unconfirmed data, because it is not in the collections they read. Re-uploads become a diff | A confirm step has to be built |

**Chosen: B.**

- **Where the proposal lives:** extraction writes the proposal JSON (R12 shape) to Cloud Storage. The version document holds only its status (`pending`, `ready`, `failed` or `confirmed`) plus any error, and the review screen streams that status.
- **Confirming:** the proposal is validated, diffed against the live entities whose `sources` point at earlier versions of the same document, and written in a batch. Confirming sets `lastVerified`.
- **Re-uploads (R9):** a new version replaces entities extracted from the old one. An entity a human edited since it was confirmed shows up as a conflict in the diff, so the edit is never silently overwritten.

### D5. One Zod schema as the source of truth

| Option | Pros | Cons |
|---|---|---|
| **A. Zod definitions in TypeScript, which generate a JSON Schema** | One definition drives form validation, Firestore converters, the extraction schema passed to Gemini's structured output, and the R12 format | If the agents are written in Python, they need generated models |
| B. A hand-written JSON Schema as the contract | Language-neutral | Weaker ergonomics in the TypeScript web app, and types have to be generated back |
| C. A separate definition in each layer | None | They drift apart |

**Chosen: A.** The generated `docs/schema/offering-graph.v1.schema.json` is committed and is the published, versioned exchange contract (R12). If ADK agents end up in Python, they generate Pydantic models from that file in CI.

Gemini's structured output accepts only a subset of JSON Schema. Extraction therefore runs as several passes, one per entity family (offerings and features, pricing, proof, constraints and partners), each with a smaller derived schema. This also tends to extract more accurately than one large prompt.

### D6. Prices stay free text, and a parser in code reads them

| Option | Pros | Cons |
|---|---|---|
| A. Free text only | Satisfies R2 and R3 | The Pricing agent would do arithmetic on strings, which means the model does the maths |
| B. Free text plus a stored parsed copy | Fast | The copy is derived data that goes stale when the parser changes |
| **C. Free text plus a deterministic parser that runs at read time inside the Pricing tools** | Always consistent, with all arithmetic done in code | The parser's coverage has to be scoped deliberately |

**Chosen: C.**

- **Parser coverage:** a plain amount, a percentage, a percentage with a minimum, "waived", and "on quote". Currency comes from the text ("RM" means MYR), or else from the workspace currency.
- **Unparsed values:** the tool returns them verbatim, marked `unpriced`. The Writer presents them as "on quote" and never invents a figure.
- **Cost:** agent tools return typed projections that have no cost fields, and never return `cost`-kind rate cards. A unit test asserts that no tool output schema contains a cost field.

### D7. One `chunks` collection serves search and fit retrieval

| Option | Pros | Cons |
|---|---|---|
| A. Embed entities only | Small index | Does not cover document contents, which R11 requires |
| **B. One collection holding entity chunks and document-passage chunks** | One vector index and one query path for search (R11) and for the Fit Analyst's evidence retrieval | Entities must be re-embedded on every write, and the entity text must be rendered without cost fields |

**Chosen: B.**

- **Chunk fields:** each chunk holds `ref: {type, id, rev}` or `{documentId, versionId, locator}`, plus the `restricted` flag and `live` (false when soft-deleted or unconfirmed).
- **Vector index:** a composite index prefilters on `live` and `restricted`.
- **Embedding size:** 768-dimension embeddings from the Gemini embedding model. Firestore vector fields top out at 2048 dimensions, below the model's default.
- **How the Fit Analyst reads:** it always gets a compact outline of the whole confirmed graph (IDs, names, one-line summaries, constraints) in context. It uses vector retrieval to pull detail and quotable evidence.

### Trust layer (R10) on this model

- **Soft delete:**
  - Deleting an offering sets `deletedAt` and one shared `deleteBatchId` on the offering, its sub-offerings, and their rate cards and fee schedules. It also sets `live: false` on their chunks. Restoring reverses everything with that batch ID.
  - Proof and constraints linked to several offerings are not deleted. Readers ignore references to deleted offerings.
- **Audit:** `auditEvents` uses the fixed vocabulary. A grid save or technology-set save is one `update` event that holds the before and after state.
- **Staleness:** the Fit Analyst warns when it relies on an offering or rate card whose `lastVerified.at` is more than 90 days old.
- **Citations:** a fit map, artefact or review report stores `{type, id, rev}` for each entity it relied on. The UI shows "changed since" when the current `rev` is higher.

## Consequences

**Good**

- **Workspace isolation, confirmed-only reads and cost privacy are structural:** they come from paths, staging and typed projections, not from filters someone has to remember.
- **Grids render and save in one round trip.** Adding a column or tier is a data edit.
- **One schema** serves extraction, review, storage, tools and export. The R12 exchange format falls out almost for free, and demo data resets by import.
- **Provenance goes down to the cell,** so the Reviewer can check "supported by the offering graph" against a quote, not just an ID.

**Bad**

- **No referential integrity.** Dangling IDs are tolerated and filtered at read time, and an integrity check belongs in the import validator.
- **Concurrent edits to one card conflict at card level.** This is acceptable for small teams.
- **The re-upload diff and the confirm step** are real UI work in week 1.
- **Every entity write re-embeds a chunk.** This is cheap at this scale, but it is a second write path to keep consistent. It should run in the same server action, not a trigger, so failures are visible.

## Confirmation

- A unit test asserts that the agent tool output schemas contain no `cost` field, and that `cost`-kind cards are unreachable.
- Firestore rules tests, run in the emulator, show that one workspace's member cannot read another's documents.
- A round-trip test, export → import → export, produces an identical file for the synthetic demo catalogue.
- A parser test covers the free-text price examples from R2.

## More information

- **Amended by [ADR-0009](0009-offering-centred-hub-and-ask-or-tell.md) (2026-10-13):** staged extraction (D4) becomes a typed proposal in Firestore, shared with Ask or tell. New fields: offering type, partner relationship and buy price (cost), document offering links, notes, provenance.
- **Amended by [ADR-0010](0010-genai-workflow-in-typescript.md) (2026-10-13):** no Pydantic generation (D5), one TypeScript price parser (D6), and no `chunks` collection or vector search for the submission (D7).
- **Amended 2026-10-15 (at build time, PRD FR-ASK-6):** a price cell and a fee line may carry `next: { value, from }`, a scheduled price change.
  - `value` stays the price in use. From the `from` date (`YYYY-MM-DD`, Malaysia time) code reads `next.value` instead, through one helper, so the Pricing step, Ask answers and the Pricing tab all agree.
  - It arrives through Ask or tell ("from 1 November it goes up to RM 19,500"). The new price is still free text, copied word for word from its source.
  - Notes gain `deletedAt`, so applying and then undoing a proposal soft-deletes the note like every other entity.
- Requirements: `docs/requirements/CARRIED-REQUIREMENTS.md`, R1 to R12.
- Deviations from the proposal (`docs/proposal/`):
  - Tier folds into rate card columns.
  - PastProposal is a document kind, not an entity.
  - The proposal's wording was updated to match on 2026-09-25.
- Follow-up ADRs:
  - Agent implementation language. Decide it early in week 2, ahead of the hosting decision, because D5's schema pipeline depends on it.
  - Agent hosting: Agent Engine or Cloud Run (due 2026-10-05).
  - Opportunity and deal-room state.
  - Persona output templates.
