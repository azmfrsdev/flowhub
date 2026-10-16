---
status: superseded by ADR-0010
date: 2026-09-28
deciders: FlowHub maintainers
---

# ADR-0002: Agent implementation language

> **Superseded on 2026-10-13 by [ADR-0010](0010-genai-workflow-in-typescript.md):** the agents are a GenAI workflow in TypeScript, in the web app.

## Context and problem statement

The web app is Next.js in TypeScript. The agent team (Orchestrator, Intake, Researcher, Fit Analyst, Pricing, Writer, Reviewer, Coach, Outcome Learner) is built on Google's Agent Development Kit (ADK). ADK is available in several languages, and the choice affects three things:

- **Hosting.** Hosting is due to be decided by 2026-10-05, in a later ADR. This language choice decides whether Agent Runtime (formerly Agent Engine) stays a first-class option.
- **Proposal promises.** Rehearsal on the Live API, and ADK eval sets running in CI.
- **The schema pipeline** from ADR-0001 D5. The Zod schema is the source of truth, and it emits a JSON Schema that other languages consume.

## Findings

Checked on 2026-09-28 against adk.dev and the Google Cloud documentation:

| Capability | Python | TypeScript | Go | Java / Kotlin |
|---|---|---|---|---|
| ADK core | GA | GA (ADK TS 2.0) | GA | GA |
| Agent Runtime, standard deploy (`adk deploy`) | Yes | No, custom container and runtime contract only | Yes | No, custom container only |
| Live API bidirectional streaming in ADK | Yes | Not listed | Not listed | Java experimental |
| ADK evaluation (`adk eval`, eval sets) | Yes | No | No | No |
| Examples and community | Largest | Growing | Moderate | Moderate |

Agent Runtime has a free tier.

## Decision drivers

- **Technical merit carries 40% of the judging,** and there is a side prize for the best use of Google Cloud AI tools. The build should use Agent Runtime, ADK evaluation and the Live API as first-class features, not work around them.
- **Don't close the hosting decision early.** Both Agent Runtime and the Cloud Run fallback should remain possible.
- **Three weeks remain.** Every workaround is time taken from the demo.
- **The trust invariants must hold in whichever language the tools are written in.** Two matter most here: cost privacy, and prices that come only from function calls.
- **Fluency.** The maintainer is fluent in TypeScript. The agent-side teammate is not yet recruited.

## Considered options

| Option | Pros | Cons |
|---|---|---|
| **A. Python agents, TypeScript web app** | Every capability in the proposal is supported directly: Agent Runtime deploy, Live API streaming in ADK, `adk eval` in CI. It has the most examples, and it keeps both hosting options open | Two languages in one repo. The schema crosses languages by code generation. Agent-side work is outside the maintainer's strongest language |
| B. TypeScript for everything | One language and one toolchain. ADK TS uses Zod natively, so the schema is shared with no generation step | Agent Runtime only through a custom container, which effectively pushes hosting to Cloud Run. Rehearsal would call the Live API outside ADK. The eval harness would have to be built by hand, while the proposal promises ADK eval sets |
| C. Go agents | Standard Agent Runtime deploy is supported | No Live API streaming in ADK and no `adk eval`. Neither maintainer nor a likely teammate is known to use it |

## Decision outcome

**Chosen: A. Agents are written in Python, and the web app stays in Next.js (TypeScript).**

B is the only real alternative. It would save one language, but it would give up the three features that make the technical story, and it would decide the hosting question by default. For a hackathon judged 40% on technical merit, that is the wrong trade.

### How the Python tools reach the offering graph

| Option | Pros | Cons |
|---|---|---|
| **A. Python tools read Firestore directly, through a typed projection layer** | One hop and no service-to-service auth. The agents keep working if the web app is down | The price parser (ADR-0001 D6) exists twice: in TypeScript for the on-screen margin, and in Python for the Pricing tools |
| B. Python tools call a graph API in the Next.js app | Graph logic and the parser live once, in TypeScript | An extra network hop, service-to-service auth, and the agents depend on the web app being up. More moving parts for three weeks |

**Chosen: A.** The duplication is kept small and honest:

- **One fixture file for the parser.** `fixtures/price-strings.json` pairs free-text prices with their expected parses. Both parser implementations must pass it.
- **Generated models.** Pydantic models are generated from `docs/schema/offering-graph.v1.schema.json` (ADR-0001 D5) with `datamodel-code-generator`. CI fails if the generated file drifts from the schema.
- **The cost projection is enforced in Python.** Agent tools return projection models that do not declare cost fields at all. The test from ADR-0001's Confirmation section is implemented against the Python tool schemas.

### Repository layout

```
web/        Next.js app (TypeScript), Zod schema, the source of the JSON Schema
agents/     ADK agents (Python), managed with uv, with pinned versions
docs/schema/offering-graph.v1.schema.json   generated from web/, consumed by agents/
fixtures/   cross-language test fixtures (price strings, sample opportunities for evals)
```

## Consequences

**Good**

- The Live API rehearsal, `adk eval` in CI and Agent Runtime deployment all work as the proposal describes them.
- The hosting ADR remains a real choice between Agent Runtime and Cloud Run.
- The ADK's largest set of examples and samples is available when something goes wrong under time pressure.

**Bad**

- **Two toolchains.** CI has to install both Node and Python. Keep the jobs split by path so a web-only change doesn't run the agent evals.
- **Cross-language drift is possible.** The generated models and the shared parser fixture contain it, but they don't remove it.
- **Agent work is outside the maintainer's strongest language.** This raises the priority of recruiting a teammate who knows Python before 2026-10-11.

## Confirmation

- CI regenerates the Pydantic models and fails on any diff.
- Both price parsers pass `fixtures/price-strings.json`.
- A test asserts that no agent tool's output model declares a `cost` field.
- A hello-world ADK agent deploys to Agent Runtime with `adk deploy` before 2026-10-05. This also feeds the hosting ADR.

## More information

- ADR-0001, offering graph data model: D5 (schema source of truth) and D6 (price parsing).
- Sources, checked on 2026-09-28:
  - https://adk.dev/: language availability.
  - https://adk.dev/deploy/agent-runtime/deploy/: standard deploy, Python and Go.
  - https://adk.dev/live/: Live API, Python and Java (experimental).
  - https://adk.dev/evaluate/: evaluation, Python.
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/runtime: Agent Runtime supports any language through containers, and has a free tier.
- Naming: Vertex AI is now Gemini Enterprise Agent Platform, and Agent Engine is now Agent Runtime. CLAUDE.md and the proposal were updated to use these names on 2026-09-28.
