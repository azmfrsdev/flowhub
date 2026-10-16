---
status: accepted
date: 2026-09-29
deciders: FlowHub maintainers
---

# ADR-0005: Deal-room data model

## Context and problem statement

ADR-0001 modelled the offering graph. This ADR models everything that happens to one opportunity: the flat opportunity row (R8), the four stages and their gates (PRD section 6), the agents' outputs and the human's edits to them, live progress, artefacts, outcomes and the usage caps (FR-CAP-1).

**Constraints already decided:**
- **Firestore is the system of record.** Each stage is a stateless invocation that reads its inputs from Firestore and writes its progress and outputs back (ADR-0003).
- **Only the Next.js server calls the agents,** and the browser gets progress only through Firestore listeners (CLAUDE.md invariant 9).
- **Everything is scoped under `workspaces/{ws}`** (ADR-0001 D1).
- **The Zod schema is the source of truth,** and generates the JSON Schema and the Pydantic models (ADR-0001 D5, ADR-0002).

**What the PRD requires of the data:**

| Requirement | Detail | PRD reference |
|---|---|---|
| Reloads lose nothing | State comes from the server, so closing or reloading the tab keeps every result | FR-DR-3 |
| Re-running a stage | Later stages are marked out of date, and their old outputs are kept as history | FR-DR-4 |
| Artefact history | Re-running writing creates a new version, and earlier Doc links stay listed | FR-WRI-9 |
| Showing what the human changed | The gate bar shows the human's changes to the agent's output | Design brief section 7 |
| Pinned citations | Citations point at the offering-graph revision they relied on | ADR-0001 |

## Decision drivers

- **Invariants hold by construction,** not by remembering a filter. This applies to workspace isolation, confirmed-only reads and cost privacy.
- **A small list row.** The opportunities list and the deal-room listener must not re-download large outputs on every progress event.
- **A clean audit.** The agent's original output and the human's approved version are both kept, so "what the human changed" can always be shown.
- **One writer per field, and idempotent retries.** Nothing breaks when a stage is retried or a tab is reopened.
- **Free-tier quotas.** Firestore allows 20,000 writes and 50,000 reads a day.

## Decision outcome

**Chosen: decisions D1 to D7 below.** Each one lists the options considered.

### Collection layout

```
workspaces/{ws}/
  opportunities/{oppId}               the flat row (R8) plus a small stage summary
    runs/{runId}                      one stage run: inputs, agent output, working copy, state
      events/{seq}                    progress events, append-only
  usage/{yyyy-mm-dd}                  daily counters for FR-CAP-1 (MYT, UTC+8)
  auditEvents/{id}                    as in ADR-0001
system/flags                          global kill switch (FR-CAP-2); readable by the server only
```

### Stages and gates

| Stage key | PRD stage | Ends at | The gate starts |
|---|---|---|---|
| `intake` | 1 Intake | Gate A: confirm the prospect | `research` |
| `research` | 2 Research | Gate B: approve the brief | `fit` |
| `fit` | 3 Fit and Pricing | Gate C: approve the fit map | `write` |
| `write` | 4 Write and Review | Gate D: resolve flagged claims, finalise | *(done)* |

### Document shapes

These are sketches. The exact Zod definitions come with the build, and the stage outputs are detailed in the agent design ADR.

```ts
type StageKey = 'intake' | 'research' | 'fit' | 'write';
type StageState = 'idle' | 'running' | 'waiting' | 'approved' | 'stale' | 'failed';

type Opportunity = {
  id: string; workspaceId: string;
  prospect: { name: string; website?: string; country?: string } | null;  // set at Gate A
  persona: 'sme' | 'freelancer' | 'startup' | 'enterprise';
  intakeType: 'meeting_invite' | 'client_email' | 'marketplace_brief' | 'company_url' | 'tender_document';
  source: string;                   // free text: "Calendar invite", a marketplace name
  value: string | null;             // free text, as R8
  status: 'new' | 'researching' | 'proposing' | 'sent' | 'won' | 'lost' | 'no_decision';
  outcome: { result: 'won' | 'lost' | 'no_decision'; reason: string; note?: string; at: Timestamp; by: string } | null;
  score: number | null; recommendation: 'go' | 'consider' | 'nogo' | null;   // copied from the approved fit run
  inputs: IntakeInput[];            // raw intake: text (max 20,000 chars), a file in Cloud Storage, or a URL
  stages: Record<StageKey, { state: StageState; currentRunId: string | null; updatedAt: Timestamp }>;
  latestDoc: { url: string; runId: string } | null;
  rev: number; createdAt: Timestamp; createdBy: string; updatedAt: Timestamp;
  deletedAt: Timestamp | null; deleteBatchId: string | null;
};

type Run<O> = {
  id: string; stage: StageKey; attempt: number;          // attempt counts from 1 per stage
  state: 'running' | 'waiting' | 'approved' | 'stale' | 'failed';
  inputs: {                                              // exactly what this run read, pinned
    upstreamRunIds: Partial<Record<StageKey, string>>;   // the approved runs it built on
    graphRefs?: { type: string; id: string; rev: number }[];   // offering-graph entities used (fit, write)
    options?: { tone?: 'formal' | 'friendly' | 'concise'; instructions?: string; replyLimit?: number };
  };
  output: O | null;       // the agent's result. Written once, never edited
  working: O | null;      // the human's copy, created from output. Edited until the gate, then locked
  approvedAt: Timestamp | null; approvedBy: string | null;
  startedAt: Timestamp; startedBy: string; lastEventAt: Timestamp; endedAt: Timestamp | null;
  error: { code: string; message: string; retryable: boolean } | null;
  metrics: { groundedQueries?: number; inputTokens?: number; outputTokens?: number; ms?: number } | null;
  rev: number; schemaVersion: 1;
};

type RunEvent = {                 // document ID is the zero-padded seq, e.g. "000042"
  seq: number; at: Timestamp;
  agent: 'orchestrator' | 'intake' | 'researcher' | 'fit' | 'pricing' | 'writer' | 'reviewer';
  kind: 'step' | 'source' | 'warning' | 'error' | 'done';
  message: string;                // user-facing: "Reading anjungserai.example"
  detail?: Record<string, unknown>;
};
```

**Stage outputs (`O`),** outlined here and detailed in the agent design ADR:

| Output | Contents |
|---|---|
| `IntakeOutput` | persona, intake type, prospect candidates, contacts, meeting time, requirements, budget signals, deadlines. For a tender: requirements with page references |
| `BriefOutput` | sections, claims (each with source IDs), a map of web sources (URL, title, domain, date, quote), inferences with the claims they rest on, the dropped-claims count, detected technology pairs, seller notes |
| `FitOutput` | gaps (each citing where it came from), mappings with strength and graph refs, cannot-meets with constraint and partner refs, score, three reasons, staleness warnings, pricing lines (with source cell or line, the price text as written, and the basis group), unpriced lines |
| `WriteOutput` | template and tone, the draft as structured sections of blocks (each block carries its claim IDs), the claim table (support class and refs, plus a human decision on "Neither" claims), the review loop count, the freelancer reply text, and the Google Doc `{ id, url }` once finalised |

The draft is stored as **structured blocks, not a Google Doc.** The Reviewer can then tie each claim to the text it appears in, and the app can preview the draft without calling the Docs API. The Doc is only rendered from `working` at Gate D.

### D1. Where stage outputs live

| Option | Pros | Cons |
|---|---|---|
| A. Embedded in the opportunity document | One read | Every progress event and every edit rewrites the list row. Large, and has no history |
| **B. One `runs/{runId}` document per stage run** | History comes free: each re-run is a new document (FR-DR-4, FR-WRI-9). The list row stays small. Outputs sit well under the 1 MiB limit (a brief with 40 claims is about 50 KB) | The deal room needs two listeners: the opportunity and its current run |
| C. A subcollection per output type (`claims/`, `gaps/`, …) | Fine-grained edits | Many documents per run. History and "out of date" have to be tracked per item. A merge step is needed before every downstream read |

**Chosen: B.** `opportunity.stages[stage].currentRunId` points at the run the deal room shows. Older runs stay as history.

### D2. How human edits are stored

| Option | Pros | Cons |
|---|---|---|
| A. Edit `output` in place | Simplest | The agent's original is lost, so there is no "what the human changed" and no audit |
| B. Store edits as a patch list | Small, and the original stays intact | Every reader has to merge. The agents are Python and the UI is TypeScript, so the merge logic would exist twice |
| **C. `output` is never edited, and `working` is a full copy the human edits** | Downstream stages read `working` directly, with no merge in either language. The gate bar shows the difference between `output` and `working`, computed in the UI only | Two copies of each output. That's fine at these sizes |

**Chosen: C.**
- The agent writes `output` and `working` together, as identical copies.
- Edits go to `working`, each conditional on `rev`.
- At the gate, `working` is locked (`approvedAt` is set), and the next stage reads only approved `working` content.

### D3. Progress events

| Option | Pros | Cons |
|---|---|---|
| A. An array on the run document | One document | Every event rewrites the whole run, and the growing array is re-downloaded each time. The agent and a human editor contend for the same document |
| **B. An append-only `events/{seq}` subcollection** | A listener receives only the new events. The agent is the only writer. The IDs sort by `seq` | About 30 to 60 writes per run |
| C. Realtime Database or Pub/Sub | Built for streaming | A second datastore, with a second set of rules and costs |

**Chosen: B.**
- `seq` is assigned by the agent, which is the only writer for its run. The document ID is `seq` zero-padded, so a retried write can't create a duplicate.
- Each event also updates `run.lastEventAt`, which is used to detect a stalled run (D5).

**Budget check:** one opportunity run end to end costs about 150 writes (four runs, about 120 events, edits, counters) and about 300 reads per viewer. The daily caps (10 research runs per workspace) keep a busy day well inside the free tier.

### D4. Who writes: server only, browser read-only

| Option | Pros | Cons |
|---|---|---|
| A. The browser writes directly, guarded by security rules | Lower latency on edits | Validation lives in the rules and again in the server. The audit trail and the caps can be bypassed |
| **B. All writes go through Next.js server actions (Admin SDK). The browser only reads** | One validation point (Zod). Audit and caps can't be skipped. Security rules become simple: members can read, nobody can write | A network round trip per edit. Debounced edits make that invisible |

**Chosen: B.** This applies to the **whole workspace, the offering graph included** (it extends ADR-0001). The security rules are:
- `workspaces/{ws}/**`: a member may read, and no client may write.
- `system/**`: no client may read or write.

The agents write with their own service identity (ADR-0003). They may only write run documents, their events, and the `stages` field and summary fields of the opportunity.

### D5. Stage state machine, concurrency and retries

| From | Event | To | Written by |
|---|---|---|---|
| idle, waiting, approved, stale or failed | The gate is passed, or the user re-runs the stage | `running` (new run document) | Server, in a transaction |
| running | The agent writes its output | `waiting` | Agent |
| running | The agent reports an error | `failed` | Agent |
| running | No event for 3 minutes, then the user presses Retry | `failed` (code `timeout`), then a new run | Server |
| waiting | The gate is approved | `approved` | Server |
| waiting or approved | An earlier stage starts a new run | `stale` | Server, in the same transaction as the start |

**Rules:**
- **Starting a stage is a single transaction** on the opportunity document. It:
  - checks the stage isn't already `running`
  - checks no other stage is running (no re-runs mid-flight)
  - checks the upstream stage is `approved`
  - checks the daily cap
  - creates the run document with a server-generated `runId`
  - increments the usage counter
  - marks downstream stages `stale`
- **The agent receives IDs only:** `{ workspaceId, opportunityId, runId }`. It reads everything else from Firestore. A retried call with the same `runId` finds its run already done and exits. That makes invocations idempotent, and keeps the call payload free of content.
- **Stalled runs:** if a run is `running` with no event for 3 minutes, the UI shows it as stalled and offers Retry. The data model doesn't depend on how the server holds the call open, which the agent design ADR decides, because the agent writes its own results.

### D6. Usage caps and the kill switch

- **`usage/{yyyy-mm-dd}`** holds these counters: `researchRuns`, `stageRuns`, `uploads`.
  - The day follows Malaysia time (UTC+8).
  - The counters are incremented inside the start transaction (D5), so a cap can't be exceeded by two requests racing each other.
  - Settings reads the same document for the usage meter.
- **`system/flags.agentsEnabled`** is checked in the same transaction. Turning it off stops every new run at once, with no redeploy. That's the response to a budget alert (FR-CAP-2).

### D7. Schemas and history rules

- **The deal-room types join the one-way schema flow** from ADR-0001 D5. The Zod schema generates `docs/schema/deal-room.v1.schema.json`, and that generates Pydantic models for the agents. The Gemini structured-output schemas for each stage are derived from the same definitions. Only the offering-graph file is the public exchange format (R12); the deal-room schema is internal.
- **Soft delete** applies to opportunities (FR-OPP-5). Runs and events are kept, and restoring an opportunity restores the whole deal room.
- **Audit** (the fixed vocabulary):

  | What happened | Audit action | Detail recorded |
  |---|---|---|
  | A stage starts | `generate` | stage, runId |
  | A gate is approved | `update` | gate, and a summary of the diff between `output` and `working` |
  | A Doc is finalised | `generate` | the Doc URL |
  | A manual status change, including "sent" | `update` | old and new status |

  FlowHub never sends anything, so `send` is not used by the deal room.

## Consequences

**Good**

- **Reloads and retries are safe by construction.** A retried agent call is a no-op (FR-DR-3).
- **History comes free.** Re-runs are new documents, and "out of date" is a state rather than a deletion (FR-DR-4, FR-WRI-9).
- **The human's changes are always visible.** `output` is never edited, and the diff between it and `working` is what the gate bar shows. That's the human-in-the-loop story in the demo.
- **The rules are simple:** members can read, nobody writes from a client. Caps, audit and validation all sit on one server path.
- **Listeners stay cheap.** The list row is small, and events arrive one at a time.

**Bad**

- **Every edit is a server round trip.** Debouncing and optimistic UI hide this, but the UI has to handle a rejected write (a `rev` conflict) by reloading `working`.
- **Two copies of each output** (`output` and `working`). That's fine at these sizes.
- **The agents write to the opportunity document** (the `stages` field and summary fields) as well as the server. The two are kept apart by field, and every write is a field-level update, never a full replace.
- **Stalled-run detection is a heuristic** (3 minutes). It may need tuning after real runs.

## Confirmation

- **Security rules tests** in the Firestore emulator:
  - a member can read their own workspace
  - a non-member can read nothing
  - no client can write anywhere
  - nobody can read `system/**`
- **A transaction test:** two concurrent starts of the same stage produce exactly one run, and a start past the daily cap is refused.
- **An idempotency test:** invoking the same `runId` twice produces one output.
- **A re-run test:** re-running research marks `fit` and `write` as `stale`, and keeps their runs.

## More information

- **Amended by [ADR-0008](0008-hub-first-and-light-multi-user.md) (2026-09-29):** `freelancer` and `marketplace_brief` are removed from the persona and intake-type values. `users/{uid}`, `workspaces/{ws}/members/{uid}` (with roles) and server-only `invitations/{id}` are added. Reading a workspace requires a member document.
- PRD sections 6, 7.4 to 7.11 and 11. ADR-0001 (layout, pinned refs, soft delete, audit). ADR-0003 (stateless stages, server-only invocation).
- To be decided next, in the agent design ADR:
  - detailed stage output schemas
  - how the server holds the agent call (so the run finishes even if the browser leaves)
  - resolving Google Search grounding source URLs into the canonical links stored in `BriefOutput`
