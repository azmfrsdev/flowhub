---
status: accepted
date: 2026-09-29
deciders: FlowHub maintainers
---

# ADR-0006: Agent design

## Context and problem statement

**What's already decided:**
- The agents are Python ADK (ADR-0002), deployed to Agent Runtime (ADR-0003).
- They run as stateless stages that read from and write to Firestore (ADR-0003, ADR-0005).
- The PRD sets what each agent must do (section 8), the speed targets (section 11) and the eval targets (section 12).
- CLAUDE.md sets the trust invariants: prices only come from function calls, cost stays private, research claims need a grounding source, the Reviewer blocks unsupported claims, only public proof is cited, and agents read only confirmed entities.

**What this ADR decides:**
- how the agents are structured and invoked
- how each trust invariant is enforced, **in code wherever possible rather than in prompts**
- the stage output schemas that ADR-0005 left open
- how the server holds an agent call
- how Google Search grounding sources are stored and shown

**Facts checked on 2026-09-29:**
- **ADK:** `output_schema` can be combined with tools only on some models, Gemini 3 among them. Built-in tools like Google Search come with limits on combining them with other tools; ADK Python 1.16 and later work around those limits, and so does wrapping the tool in its own agent with `AgentTool`.
- **Grounding with Google Search:**
  - Each response carries grounding metadata: `groundingChunks` (the sources, as `vertexaisearch.cloud.google.com/grounding-api-redirect/…` links with titles) and `groundingSupports` (text segments mapped to chunk indices).
  - **Search Suggestions must be displayed**, using the HTML and CSS Google provides in `searchEntryPoint.renderedContent`.
  - The service terms, as quoted in secondary sources, prohibit caching or syndicating grounded results, but allow storing the text of grounded results for up to two years, including so users can review their history and so it can be reinserted into later prompts. **The exact wording must be verified** (see Confirmation): the terms page couldn't be fetched today.

## Decision drivers

- **Invariants enforced by code are demonstrable.** "The model is told to cite" is weak. "An uncited sentence cannot reach the brief" is a judging point (technical merit is 40%).
- **Speed targets** (p50): intake 10 s, brief 90 s, fit and pricing 60 s, write and review 120 s.
- **Visible ADK use** (workflow agents, tools, grounding, structured output, eval), without adding complexity for its own sake.
- **Cost.** Grounded queries and Pro-tier tokens are the expensive parts, and the caps (FR-CAP-1) bound them.
- **Web content is untrusted input.** Prospect websites can contain prompt injection.

## Decision outcome

**Chosen: decisions D1 to D9 below.**

### D1. One ADK app, with a stage router and a pipeline per stage

| Option | Pros | Cons |
|---|---|---|
| **A. One ADK app deployed once. The root agent routes to a pipeline per stage** | One deployment, one set of traces, and shared tools and schemas | The root agent needs a small amount of routing code |
| B. One Agent Runtime deployment per stage | Stages are isolated | Four deployments to manage and pay for, and duplicated shared code |
| C. A single agent with every tool, prompted to "do the next stage" | Very little code | Can't be tested or bounded, invariants can't be enforced, and it drifts |

**Chosen: A.**
- **How a call starts:** it carries only `{ workspaceId, opportunityId, runId }` (ADR-0005 D5).
- **The router:** the root agent, `StageRouter`, is a **custom agent**. In ADK that's a Python class extending `BaseAgent`, with its own `_run_async_impl` method holding plain code. It loads the run document, exits if the run has already finished (idempotency), and hands over to that stage's pipeline.
- **The pipelines** are ADK workflow agents: `SequentialAgent`, `ParallelAgent` and `LoopAgent`. Deterministic steps (validation, rendering, writing to Firestore) are **custom agents too**, so they appear in the same trace as the model steps.
- **Every model agent uses `include_contents='none'`.** It sees only its own instruction and the inputs that code has loaded from Firestore into session state, never chat history. This keeps each stage stateless (invariant 8).

**Ingestion runs through the same app.** An upload is an `ingest` stage with its own pipeline (ADR-0001 D4 passes).
- This **replaces the Eventarc-triggered Cloud Run job** in the proposal.
- Uploads already end in a server action ("finalise upload"), so that action queues the ingest run in the same way as the deal-room stages (D6).
- The result is one way of invoking agents, one trace view and one less service.

### D2. Grounding is enforced by code, from the grounding metadata

| Option | Pros | Cons |
|---|---|---|
| A. Prompt the model to cite its sources | Simple | Citations can be invented or missing. Not demonstrable |
| **B. Derive claims from `groundingSupports`. Any sentence not covered is dropped and counted** | "Every claim has a source" becomes true by construction. Deterministic and testable | A claim's granularity follows the grounding segments, so the section prompts must ask for short factual sentences |
| C. A second model verifies the citations | Catches some problems | More cost and latency, and it's still a model judging a model |

**Chosen: B.**
- The Researcher's grounded calls return prose for their section. Code then:
  - splits the prose into claims along the `groundingSupports` segments
  - attaches the chunk indices as source IDs
  - **drops every sentence that has no support,** adding it to `droppedCount` (FR-RES-2)
- **Inferences** ("Likely needs", "Sector pressures", FR-RES-3) come from a separate reasoning step. It sees only the kept claims, and must return each inference with the claim IDs it rests on. Code drops any inference with no valid claim IDs.
- **Sources** keep the grounding link **exactly as provided** (`groundingUri`), plus its title, domain and retrieval time. "Open original" follows that link. Whether we may also store a resolved canonical URL depends on the terms review. Until then, only the provided link is stored.
- **Search Suggestions:** the `searchEntryPoint.renderedContent` of each grounded call is stored with the brief and **displayed unchanged in the brief panel** (S12b). This is a compliance requirement, and the design brief is updated to include it.

### D3. The model never writes a price

| Option | Pros | Cons |
|---|---|---|
| A. The Pricing agent reads prices through tools and writes the estimate | Matches the proposal's wording | The model still types the numbers, so a typo or an invented figure is possible |
| **B. The Pricing agent chooses references only. Code copies the values. The Writer uses price placeholders that code fills** | Invariant 1 holds by construction. No price digits ever come from a model | Pricing and the Writer need a placeholder convention |

**Chosen: B.**
- **Pricing agent (Flash):**
  - It gets the tools `list_pricing(offering_id)` and `get_rate_card(card_id)`.
  - Both return **public projections**: `pricing`-kind cards only, with no cost fields, and each value marked as parsed or unparsed.
  - It outputs a selection: the column per rate card, the line references, an optional quantity with the claim ID that justifies it, and a rationale.
- **Code** then:
  - checks every reference exists and is confirmed
  - **copies `valueText` from the offering graph** into the output
  - groups the lines by basis (one-time, recurring, variable)
  - computes line totals only when the price parser (ADR-0002) understands both the price and the quantity
  - marks anything else "On quote"
- **The Writer** writes `{{price:<lineRef>}}` wherever a price belongs. Code renders the placeholder from the approved fit output. A digit sequence in the draft that looks like a price and didn't come from a placeholder is flagged by the Reviewer checks (D5).

### D4. The go/no-go score is computed in code, and a model explains it

| Option | Pros | Cons |
|---|---|---|
| A. The Fit Analyst outputs the score | Simple | Not repeatable, not explainable, and easy to game with wording |
| **B. Code computes the score from the fit components. The model writes the three reasons, citing those components** | Repeatable and explainable. Testable in the eval set | The weights need a first guess and tuning |

**Chosen: B.** The first version of the formula:
- **Weights:** each gap carries a priority weight (high 3, medium 2, low 1) and a strength value (strong 1.0, partial 0.6, weak 0.3, none 0).
- **Coverage** is the weighted sum of strengths divided by the sum of weights, as a percentage.
- **Penalty:** 15 points for each high-priority *cannot meet* that has no partner.
- **Bonus:** up to 5 points for overlap between the prospect's detected technology and the seller's integrations.
- **Result:** clamped to 0–100. The bands are Go at 70 or above, Consider at 40–69, No-go below 40 (PRD Q5).

The components are stored in `FitOutput.score.components`, and every reason must cite a component or a gap ID.

### D5. The Reviewer combines a model with hard checks, in a loop of up to 2 revisions

The model part: **the Reviewer (Pro)** splits the draft into atomic claims. It classifies each one against the evidence it's given (approved brief claims, offering-graph refs, priced lines, seller notes) as research, offering, seller or neither, and returns the refs.

**Code then runs hard checks that override the model:**

| Check | Result if it fails |
|---|---|
| A ref points to something that doesn't exist, or isn't confirmed | The claim becomes **Neither** |
| A price-like number or currency amount didn't come from a placeholder | The claim becomes **Neither** |
| A non-public proof name or client name appears in the text | **Block**, and the text is revised |
| **Any seller cost value appears in the text** (string match against the workspace's cost values) | **Hard block.** It can't be accepted as a seller statement |

**The loop:** `LoopAgent(max_iterations=2)` runs Writer then Reviewer. It exits early once no claim is Neither. Claims still marked Neither after two rounds go to Gate D for the human to decide (FR-WRI-4, FR-WRI-5).

### D6. How the server holds an agent call: Cloud Tasks and an internal route

| Option | Pros | Cons |
|---|---|---|
| A. The server action calls Agent Runtime and waits on the stream | Simplest | The run is tied to the browser's request. A closed tab or navigation can cut it off, which breaks FR-DR-3 |
| **B. The server action queues a Cloud Tasks task. The task calls an internal Next.js route, which calls Agent Runtime and holds the stream until the run ends** | Runs survive the browser leaving. Retries and deadlines are handled for us. The free tier is 1 million operations a month | One more managed service, and the internal route must only accept Cloud Tasks |
| C. Pub/Sub push | Similar | Harder to set per-task deadlines and retries, and less natural for one job per run |

**Chosen: B.**
- **The internal route** is `/api/internal/run-stage`. It only accepts OIDC tokens from the Cloud Tasks service account.
- **Retries and deadlines:** at most 2 attempts, with a 15-minute deadline. The stalled-run rule from ADR-0005 D5 stays as the backstop.
- **Only Next.js calls the agents,** so invariant 9 still holds. The Agent Runtime call carries only IDs.

### D7. Models are chosen by tier, and pinned in one config file

| Agent or step | Tier | Why |
|---|---|---|
| Intake, extraction passes, Pricing selection, research section calls (grounded) | **Flash** | Speed and cost. Research runs several grounded calls in parallel |
| Research inferences, Fit Analyst, Writer, Reviewer | **Pro** | Reasoning, fit judgement, long-form writing, strict classification |
| Coach (C1) | **Live** (native audio) | Real-time voice |
| Retrieval | **Gemini embeddings**, at 768 dimensions (ADR-0001 D7) | Firestore's vector limit |

- **All model names are pinned in `agents/config/models.toml`,** and no agent contains a model name.
- **Names are verified when the app is scaffolded** against the Agent Platform model list, including which region or the `global` endpoint serves each one. On 2026-09-29, secondary sources listed Gemini 3.x Pro and Flash models as current, but the official model page couldn't be reached to confirm the exact names.
- Because `output_schema` combined with tools needs a Gemini 3-class model, **Gemini 3 or later is the minimum.**

### D8. Web content is untrusted

- **Read-only research:** research agents have only read-only tools (search, URL context). No tool that writes or sends anything is reachable from a stage that reads web content.
- **The Writer never sees raw web text.** It gets only the *approved* claims, as short sourced sentences, so instructions hidden in a web page reach it at most as a claim the human has already reviewed.
- **Structured outputs are validated with Pydantic, and every ID is checked** against Firestore. An injected "cite offering X" can't point at an entity that doesn't exist.
- **No profiling of private individuals** (FR-INT-5). Research queries are built in code from the approved company name and domain, not from free text the model writes.

### D9. Prompts, templates and evals live as files

- **Prompts** live in `agents/prompts/<agent>.md`, one per agent, versioned with the code.
- **Persona output templates** (SME, enterprise, freelancer, startup) live in `agents/templates/<persona>.json`. Each defines the sections, the required evidence for each section, and length limits (FR-WRI-1, FR-WRI-2, FR-WRI-10). This is the "templates as JSON" pattern: adding a persona means adding a template, not adding an agent.
- **Evals:**
  - `adk eval` runs against `fixtures/opportunities/` (the PRD section 12 set).
  - Custom metrics are the section 12 checks, implemented as deterministic functions over the stage outputs: sources present, prices traceable, no cost leaks, planted claims flagged, constraint conflicts caught.

### Stage pipelines

| Stage | Pipeline (in ADK terms) | Code steps (custom agents) |
|---|---|---|
| `intake` | `IntakeAgent` (Flash, `output_schema=IntakeOutput`, reads attached files through file understanding) | Validate, then write `output` and `working`, set the stage to `waiting` |
| `research` | `ParallelAgent`: `SnapshotSearch`, `NewsSearch`, `HiringSearch` (each Flash, grounded) and `TechScan` (Flash, URL context on the prospect's site). Then `InferenceAgent` (Pro) | `ClaimExtractor` (D2), `TechMapper` (maps detected technology onto R7 pairs and matches the seller's integrations), write the output |
| `fit` | `FitAnalyst` (Pro). It gets the compact confirmed-graph outline plus a `search_graph` vector tool (ADR-0001 D7). Then `PricingAgent` (Flash, D3) | Constraint pre-check (runs first: deterministic value matching, then the model for free-text statements), ref validation, `ScoreCalculator` (D4), `PriceRenderer` (D3), write the output |
| `write` | `LoopAgent(max 2)` of `WriterAgent` (Pro, persona template) and `ReviewerAgent` (Pro) | Placeholder rendering, hard checks (D5), write the output. **At Gate D:** `DocPublisher` renders `working` into the Google Doc |
| `ingest` | Extraction passes (Flash, each with a smaller derived schema, ADR-0001 D4) | Spreadsheets parsed in code (not by the model), OCR routing, proposal JSON to Cloud Storage, status updates |

**Pricing runs after the Fit Analyst, not in parallel with it** as the proposal shows, because pricing needs the fit mappings. The parallelism is in research instead.

### Stage output schemas

These fill in ADR-0005's outline. The Zod versions are written at build time.

```ts
type WebSource = { id: string; groundingUri: string; title: string; domain: string;
                   publishedAt?: string; retrievedAt: string; queries: string[] };
type Claim = { id: string; section: BriefSection; text: string; sourceIds: string[]; removed?: boolean };
type Inference = { id: string; section: 'needs' | 'sector'; text: string; basedOn: string[] };
type BriefSection = 'snapshot' | 'news' | 'hiring' | 'tech' | 'sector' | 'needs' | 'questions';

type BriefOutput = {
  sections: { key: BriefSection; status: 'ok' | 'nothing_found' }[];
  claims: Claim[]; inferences: Inference[]; sources: Record<string, WebSource>;
  droppedCount: number; searchSuggestions: string[];     // renderedContent HTML, shown unchanged
  detectedTech: { category: string; value: string; label: string; sourceIds: string[]; matchesSeller: boolean }[];
  questions: { id: string; text: string; basedOn: string[] }[];
  sellerNotes: { id: string; text: string; by: string; at: string }[];   // added in working
};

type GraphRef = { type: 'offering' | 'feature' | 'proof' | 'constraint' | 'partner'; id: string; rev: number };
type PriceLineRef = { kind: 'cell'; cardId: string; rowId: string; colId: string; rev: number }
                  | { kind: 'fee'; scheduleId: string; lineId: string; rev: number };

type FitOutput = {
  gaps: { id: string; text: string; priority: 'high' | 'medium' | 'low';
          origin: { kind: 'intake' | 'claim' | 'note'; ref: string } }[];
  mappings: { gapId: string; target: GraphRef; strength: 'strong' | 'partial' | 'weak';
              featureRefs: GraphRef[]; proofRefs: (GraphRef & { isPublic: boolean })[]; customisation?: string }[];
  cannotMeet: { gapId: string; constraint: GraphRef; partner?: GraphRef }[];
  score: { value: number; band: 'go' | 'consider' | 'nogo';
           components: { coverage: number; penalties: number; techBonus: number } };
  reasons: { text: string; refs: string[] }[];                 // exactly 3
  staleWarnings: { ref: GraphRef; lastVerifiedAt: string | null }[];
  pricing: { lines: { id: string; ref: PriceLineRef; label: string; valueText: string;   // valueText is copied by code
                      basis: 'one_time' | 'recurring' | 'variable'; quantity?: { value: number; claimId: string };
                      total?: string; unpriced: boolean }[] };
};

type WriteOutput = {
  persona: 'sme' | 'enterprise' | 'freelancer' | 'startup'; tone: 'formal' | 'friendly' | 'concise';
  blocks: { id: string; section: string; kind: 'heading' | 'paragraph' | 'bullets' | 'pricing_table' | 'quote';
            text: string; claimIds: string[] }[];               // text may contain {{price:<lineId>}}
  claims: { id: string; blockId: string; text: string; support: 'research' | 'offering' | 'seller' | 'neither';
            refs: string[]; hardCheck?: 'price_not_from_graph' | 'unknown_ref' | 'non_public_proof' | 'cost_leak';
            decision?: 'accept_as_seller' | 'remove' }[];       // decision is set by the human in working
  loops: number;
  reply?: { text: string; limit: number };                       // freelancer (FR-WRI-2)
  doc?: { id: string; url: string; publishedAt: string };        // set at Gate D
};
```

## Consequences

**Good**

- **Invariants 1, 2, 3 and 5 are enforced in code** and can be shown in the demo and tested in evals: grounded claims from metadata, prices copied by code, cost blocked by string match, proof filtered by projection.
- **The ADK features used each do real work:** workflow agents (sequential, parallel, loop), custom agents for code steps, tools, grounding, structured output, `adk eval`, and Agent Runtime traces.
- **Scores are repeatable and explainable,** and the eval set can pin them.
- **One way to invoke agents** (Cloud Tasks → internal route → Agent Runtime) serves ingestion and every deal-room stage, and runs survive the browser leaving.

**Bad**

- **Claim granularity depends on how the grounding segments fall.** The section prompts must produce short, factual sentences, and the eval set watches the claim counts.
- **The score weights are a first guess** and need tuning on the eval set.
- **Cloud Tasks is one more service to set up** (queue, service account, OIDC on the internal route).
- **Dropping Eventarc changes the proposal's architecture.** Figure 1, the products table and the request flow were updated to match on 2026-09-29.
- **The design brief needs a Search Suggestions area** in S12b. It is updated alongside this ADR.

## Confirmation

**Before the first deploy (the 5 Oct gate):**
- Read the **Grounding with Google Search service terms** verbatim. Confirm:
  - storing the text of grounded results in Firestore for review and reinsertion into later prompts
  - how links must be shown, and whether a resolved URL may be stored
  - whether copying the brief (FR-RES-7) or putting grounded content in a Google Doc for the prospect is allowed

  Record the answers here, and change D2 if needed.
- Verify and pin the model names in `agents/config/models.toml`.

**Tests:**
- `ClaimExtractor` drops an unsupported sentence and counts it.
- `PriceRenderer` never outputs a value that isn't in the offering graph.
- The hard checks catch a planted cost string and a planted non-public client name.
- The score formula gives the fixture results.
- `StageRouter` exits without doing anything on a finished `runId`.

**Eval set:** the PRD section 12 metrics pass the thresholds before 14 Oct.

## More information

- **Amended by [ADR-0007](0007-google-docs-access.md) (2026-09-29):** `DocPublisher` runs in the web app's finalise server action with the user's short-lived `drive.file` token, not in the agent pipeline. The agents never hold a Google user credential.
- **Amended by [ADR-0010](0010-genai-workflow-in-typescript.md) (2026-10-13):** the stage pipelines are TypeScript modules in the web app, not ADK agents (D1). The internal route runs them in-process (D6). Model names live in `web/src/server/ai/models.ts` (D7). Prompts, the template and evals move under `web/` (D9). Vector retrieval is dropped for the submission. Every invariant and code check in D2 to D5 and D8 is unchanged.
- **Amended by [ADR-0009](0009-offering-centred-hub-and-ask-or-tell.md) (2026-10-13):** an `ask` pipeline is added, with typed proposals and a validator. The Fit Analyst reads each offering's Scope (Not included) and the company-wide selling rules.
- **Amended by [ADR-0008](0008-hub-first-and-light-multi-user.md) (2026-09-29):** the freelancer template and `WriteOutput.reply` are removed. The templates are SME and enterprise (shared) and startup. The eval set is 4 SME, 3 startup and 3 enterprise. A stretch `ask` pipeline (Ask the hub, PRD C6) is added.
- **Amended 2026-10-15 (at build time, PRD FR-INT-1 and FR-INT-3 as changed in 7.0):** Intake accepts one attached file as well as pasted text and a URL.
  - The file is stored with the opportunity, not in the hub's documents, because it's the prospect's file. It counts against the daily upload cap. Its type is read from its first bytes, never from the upload's label.
  - Gemini Flash reads a PDF or an image directly, alongside the pasted text. A saved email is read as text.
  - A requirement from a PDF carries a page, and code decides it. The requirement's source line is looked up in the PDF's own text: the page is kept, moved to where the line really is, or removed. A scan has no text, so its page stays, marked unchecked.
  - Jobs now have a kind, so the internal route runs both stages and file reads (ADR-0009 D2 as amended).
- **Amended 2026-10-15 (D4, PRD FR-FIT-4 as changed): a selling-rule break caps the score.** When code finds that the prospect breaks a company-wide selling rule (industry or region), that Cannot meet is marked `sellingRule`, and the score is held at 39, No-go, however well the rest fits. The components record `ruleCap`, and the score card says why. A person who removes that gap at Gate C lifts the cap. The eval found the need: a tobacco distributor scored Consider. In the same change, the Pricing step accepts a stated need as the source of a quantity, and code checks the number is written there (FR-FIT-5).
- PRD sections 7.5 to 7.9, 8, 11 and 12. ADR-0001 (graph, retrieval, extraction passes), ADR-0002 (Python, price parser), ADR-0003 (hosting, stateless stages), ADR-0005 (runs, events, idempotency).
- Sources checked on 2026-09-29:
  - ADK LlmAgent (`output_schema` with tools is supported on Gemini 3.0): https://adk.dev/agents/llm-agents/
  - ADK tool limitations and workarounds: https://adk.dev/tools/limitations/
  - Grounding with Google Search (Agent Platform): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-search
  - Search Suggestions display requirement (Firebase AI Logic docs): https://firebase.google.com/docs/ai-logic/grounding-google-search
