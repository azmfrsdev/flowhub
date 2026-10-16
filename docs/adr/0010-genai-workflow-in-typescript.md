---
status: accepted
date: 2026-10-13
deciders: FlowHub maintainers
---

# ADR-0010: The agents become a GenAI workflow in TypeScript, on Cloud Run

Supersedes [ADR-0002](0002-agent-implementation-language.md) and [ADR-0003](0003-agent-hosting.md). Amends [ADR-0001](0001-offering-graph-data-model.md) (D5, D6), [ADR-0006](0006-agent-design.md) (D1, D6, D7, D9) and [ADR-0004](0004-ui-component-library.md) (the handoff contract).

## Context and problem statement

ADR-0002 put the agents in Python ADK, and ADR-0003 hosted them on Agent Runtime, behind a go/no-go gate on 2026-10-05.

On 2026-10-13:
- **No application code exists,** and the hosting gate was never run. Submission is on 2026-10-18.
- **The hackathon rules don't ask for agents.** Submissions must use Gemini or Gemma, *or* be built on an agentic platform, and must be deployed on Cloud Run or Firebase. All four judging criteria are worded around GenAI, not agents.
- **The design is already a workflow, not an autonomous agent.** In ADR-0006, code chooses every step (`StageRouter`), every stage is a fixed pipeline, and the trust invariants take decisions away from the model: prices, citations, scores, references. A person decides when to move on at each gate.
- **The Python teammate assumed in ADR-0002 was not recruited.** The maintainer is fluent in TypeScript.

The question: keep two languages and a second runtime for an agent framework the requirements don't need, or build the same stages as a TypeScript workflow inside the web app?

## Decision drivers

- **Five days to build,** for one person, from nothing.
- **Every invariant stays enforced in code.** They are the pitch, and none of them depends on ADK.
- **Gemini features stay visibly load-bearing:** Google Search grounding, URL context, file understanding, structured output and function calling. These are Gemini API features, available from the TypeScript Gen AI SDK.
- **The least infrastructure:** one service, one deploy, one language.

## Considered options

| Option | Pros | Cons |
|---|---|---|
| A. Keep ADR-0002 and ADR-0003: Python ADK on Agent Runtime | Strongest platform story for the "Best use of Google Cloud AI tools" side prize. Managed tracing. `adk eval` | Two toolchains, Zod → JSON Schema → Pydantic generation, two price parsers, an untested runtime, and a language the maintainer is less fluent in. Not achievable in five days |
| B. Python ADK on a second Cloud Run service (ADR-0003's fallback) | Keeps ADK | Most of A's cost remains, and the platform story weakens |
| **C. A TypeScript workflow in the Next.js server, calling Gemini through the Gen AI SDK on Agent Platform** | One language and one deploy. Zod schemas go straight into Gemini's structured output. One price parser. Every stage, gate and invariant from ADR-0005 and ADR-0006 stays as designed | No ADK workflow agents or `adk eval`. A small eval script replaces it. The deck has to explain "agent roles, orchestrated in code" |

## Decision outcome

**Chosen: C.**

### D1. Each stage is a TypeScript pipeline in the web app's server code

- Pipelines live in `web/src/server/pipelines/<stage>.ts`: `intake`, `research`, `fit`, `write`, `ingest`, and `ask` (ADR-0009).
- **A pipeline is a list of named steps.** A small runner executes them in order and writes a progress event to Firestore before and after each step. That gives the deal room's live log (FR-DR-2) and a trace per run.
- **The agent roles stay as named steps:** Intake, Researcher, Fit Analyst, Pricing, Writer, Reviewer, and Ask or tell. Each has its own prompt, schema and tools. Research runs its searches in parallel (`Promise.all`). Write and review loops at most twice, and code decides when to stop.
- **Deterministic steps are plain functions in the same pipeline:** claim cutting, reference checks, the score, price copying and the hard checks. The UI marks them as Calculated (ADR-0009 D4).
- **No model sees chat history.** Each call gets only its instruction and the inputs code loaded from Firestore.

### D2. Cloud Tasks still holds each run; the route runs the pipeline in-process

- The server action that passes a gate still enqueues a Cloud Tasks task with `{ workspaceId, opportunityId, runId }` (ADR-0006 D6).
- `/api/internal/run-stage` still accepts only the Cloud Tasks service account's OIDC token. It now **runs the pipeline in the same process** and holds the request until the run ends.
- The web service's request timeout is raised to 15 minutes, so CPU stays allocated for the whole run. Runs still survive the browser leaving.
- The browser still never calls a model or the internal route (invariant 9). It still gets progress only through Firestore listeners.

### D3. Gemini through the Gen AI SDK, on Agent Platform

- Package: `@google/genai`, with `vertexai: true`, the project ID and a location. Credentials come from the Cloud Run service identity; there are no API keys.
- **Tools used:** Google Search grounding (research), URL context (the prospect's site), file understanding (PDF uploads, including scanned pages), structured output (every stage), and function calling (Pricing, and price questions in Ask or tell).
- **Model names live only in `web/src/server/ai/models.ts`.** They are verified against the Agent Platform model list, including the serving location, when the app is scaffolded. Gemini 3 or later remains the minimum.
- **Embeddings and vector search are dropped for the submission.** The sample catalogue is small enough to give the Fit Analyst the whole confirmed outline. This amends ADR-0001 D7; full-text search (FR-TR-3) was already a Should item.
- **Document AI is dropped.** Gemini reads scanned PDF pages directly.

### D4. One schema, one parser

- **ADR-0001 D5, amended:** Zod stays the single source of truth. It still generates `docs/schema/offering-graph.v1.schema.json` as the published exchange format (R12). Pydantic generation is removed.
- Gemini's structured output takes JSON Schema derived from the Zod definitions, one smaller schema per extraction pass (as ADR-0001 D5 already describes).
- **ADR-0001 D6, amended:** the price parser exists once, in TypeScript. `fixtures/price-strings.json` stays as its test fixture.

### D5. Prompts, templates and evals

- Prompts live in `web/src/server/prompts/<role>.md`, versioned with the code.
- The proposal template lives in `web/src/server/templates/sme.json`. The startup and enterprise templates are deferred (ADR-0009).
- **Evals:** `npm run eval` runs the PRD section 12 checks over `fixtures/opportunities/` and `fixtures/messages/` against the local stack and the Firestore emulator. CI runs it only when `web/src/server/` or `fixtures/` change.

### D6. Design source (amends ADR-0004)

No Claude Design handoff was produced. The design source for the submission is the mockup canvas (page "v2 · Offering-centred"), made on 2026-10-13. Its palette becomes FlowHub's tokens: converted to OKLCH, using shadcn's variable names, with a `.dark` block. Tailwind CSS v4 and shadcn/ui stay as decided.

## Consequences

**Good**
- **One language, one deploy, one schema and one parser.** Days of setup are removed from a five-day build.
- **Every invariant is unchanged and still enforced in code.** The stage pipelines map one-to-one onto ADR-0006's stage table.
- **The Gemini features the judges look for are all still used,** and each does real work.

**Bad**
- **The platform story is weaker:** no ADK and no Agent Runtime. The deck should say why: the trust rules make this a workflow by design, with a person at every gate.
- **We write our own small step runner and eval script** instead of using ADK's.
- **One Cloud Run service does both serving and long runs.** Its timeout and concurrency are set for runs. Splitting the worker into a second service later is a deploy change, not a redesign, because the route already takes IDs only.

## Confirmation

- **At scaffold:** `@google/genai` calls Gemini on Agent Platform from Cloud Run using the service identity. Google Search grounding returns `groundingSupports`, and structured output accepts the Zod-derived schemas. Model names are pinned in `models.ts`.
- **Before the first deploy:** a budget alert exists on the project, and the Google Search grounding terms are read (the open item from ADR-0006).
- **Tests:** the ADR-0006 confirmation tests carry over unchanged, now in TypeScript: claim cutting, price rendering, hard checks, the score formula, and idempotent runs.

## More information

- **Amended 2026-10-15 (at build time, D5): the eval runs in memory, not on the emulator.**
  - `npm run eval` runs the real pipelines against Gemini, with each seller's sample catalogue loaded from `fixtures/sample/` into memory. The run context's two storage hooks, `graph()` and `readFile()`, are swapped for in-memory ones, and Ask or tell is split into `readMessage` (model and checks) and the part that saves. Nothing is read from or written to Firestore or Cloud Storage.
  - Why: the Firestore emulator doesn't start on the maintainer's machine (ADR-0011), and tests must never share a database with dev. In memory, the eval runs the same way locally and in CI, with no Java.
  - Gates are taken as approved unchanged. Research is skipped unless `--research` is passed, because the eval prospects are fictional and grounded search is billed per prompt. Planted claims go in as the salesperson's instructions to the Writer, as a person would ask for them.
  - The eval exits 1 if a PRD section 12 target is missed. CI still needs Gemini credentials (Workload Identity Federation from GitHub) before it can run there.
- Hackathon rules, read on 2026-10-12: https://aibuildercup.com/themes.html
- Gen AI SDK for TypeScript and JavaScript: https://github.com/googleapis/js-genai
- ADR-0005 (runs, events, caps, server-only writes) and ADR-0007 (Google Docs access) are unchanged.
