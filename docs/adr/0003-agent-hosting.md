---
status: superseded by ADR-0010
date: 2026-09-28
deciders: FlowHub maintainers
---

# ADR-0003: Agent hosting

> **Superseded on 2026-10-13 by [ADR-0010](0010-genai-workflow-in-typescript.md):** the go/no-go gate was never run, and the stages now run in the web app on Cloud Run. The stateless-stage rule below still holds.

## Context and problem statement

ADR-0002 put the agents in Python ADK so that two hosting options would both stay open:

- **Agent Runtime** in Gemini Enterprise Agent Platform (formerly Vertex AI Agent Engine).
- **A second Cloud Run service** running the same ADK code.

The proposal commits to deciding by 2026-10-05. The web app is on Cloud Run either way.

The hackathon rules shape this choice:
- The solution must be deployed on Google Cloud using Cloud Run or Firebase. The web app on Cloud Run, with Firebase Auth, meets that rule under either option.
- It must use Gemini or Gemma, or be built with Agent Platform, Antigravity or AI Studio. Agent Runtime is part of Agent Platform, which the rules name explicitly.

## Findings

Checked on 2026-09-28 against the Google Cloud and ADK documentation:

| | Agent Runtime | Cloud Run (`adk deploy cloud_run`) |
|---|---|---|
| Python ADK deploy | `adk deploy agent_engine`, fully integrated | `adk deploy cloud_run`, fully integrated |
| Singapore (`asia-southeast1`) | Yes, GA features | Yes |
| Sessions | Managed | In-memory by default, lost when an instance is recycled. Durable options: a SQL database, or Agent Platform Sessions through an `agentengine://` URI |
| Tracing and monitoring | Managed (OpenTelemetry and Cloud Trace) | Set up ourselves |
| Live API bidirectional streaming | Supported through `bidi_stream_query`. **Preview**, capped at 10 minutes per stream | Not covered in the ADK Cloud Run deploy guide |
| Custom HTTP routes | No. Calls go through the Agent Platform API | Yes, through the ADK FastAPI server or our own |
| Cost | $0.085 per vCPU-hour and $0.009 per GiB-hour. Idle time between turns is not billed. A free tier exists, but the documentation doesn't state its size | Cloud Run's free tier and scale to zero |

## Decision drivers

- **Technical merit carries 40% of the judging,** and there is a side prize for the best use of Google Cloud AI tools. Managed agent hosting, tracing and sessions all count as visible platform use.
- **The rehearsal feature is stretch item 1,** and it needs Live API streaming through the agent host.
- **Two weeks of build time remain after this decision.** If the managed option breaks, the fallback has to be something we can switch to in a day, not a rewrite.
- **The budget is near zero,** and new-account credits are available.
- **Durable state is already in Firestore** (ADR-0001). The opportunity, brief, fit map and artefacts are Firestore documents, not agent session state.

## Considered options

| Option | Pros | Cons |
|---|---|---|
| **A. Agent Runtime** | One-command deploy. Sessions and tracing are managed. Bidirectional streaming for the Live API is documented. Agent Platform is named in the hackathon rules. It is the strongest platform story for judges | A product that has just been renamed, so docs and samples are in flux. Bidirectional streaming is Preview. No custom routes: the web app calls the Agent Platform API with a service identity |
| B. A second Cloud Run service | Same platform and deploy model as the web app, and satisfies the deployment rule literally. Custom routes. Generous free tier | Durable sessions need a SQL database (Cloud SQL has no free tier) or Agent Platform Sessions anyway. Tracing is set up by hand. Live streaming on Cloud Run is not covered in the deploy guide. A weaker platform story |
| C. Cloud Run compute with Agent Platform Sessions (`agentengine://`) | Durable managed sessions without Agent Runtime compute | Adds the complexity of both options, and the platform story is still weaker than A |

## Decision outcome

**Chosen: A. Agent Runtime in `asia-southeast1`, with a go/no-go gate on 2026-10-05.** B is the fallback. The design below keeps B a same-day switch rather than a rewrite.

### Design rule: each stage is a stateless invocation

The human approval gates already split the agent flow into stages: Intake and Research, then Fit and Pricing, then Write and Review. Each stage runs as one invocation:

1. The invocation reads its inputs from Firestore, where the opportunity and the approved outputs of earlier stages live.
2. It runs its agents, writing progress events to Firestore as it goes.
3. It writes its outputs to Firestore and ends.

The ADK session is working memory for one stage only. It is never the system of record.

This rule has three consequences:
- **Switching hosts is cheap.** The code doesn't depend on managed sessions surviving between stages, so moving to Cloud Run with in-memory sessions means a different deploy command and client, not a new design.
- **Progress reaches the browser only through Firestore listeners,** as the proposal describes. Closing the tab or reloading loses nothing.
- **The Next.js server starts stages; the browser never calls the agent host directly.** The Next.js server makes the call using the Cloud Run service identity, so no agent credentials reach the browser.

### Region

Everything runs in `asia-southeast1` (Singapore): Cloud Run, Agent Runtime, Firestore and Cloud Storage. The pitch wedge is Southeast Asia.

Model calls are the exception. They go to whichever endpoint serves the chosen Gemini models, which may be `global`. Check model availability by region when the model names are pinned.

### Go/no-go gate, by 2026-10-05

Agent Runtime stays only if all three of these pass. Any failure means switching to option B, recorded as a new ADR that supersedes this one.

1. A hello-world ADK agent deploys to Agent Runtime in `asia-southeast1` with `adk deploy agent_engine`, and the Next.js server calls it with its service identity.
2. One stage (Intake and Research) runs end to end, writing progress to Firestore, from a deployed Next.js instance.
3. A deploy-and-call cycle is fast enough to iterate on daily. This is a judgement call, recorded with the measured time.

Bidirectional streaming for the rehearsal is **not** part of the gate. Rehearsal is a stretch item, and its audio path (browser → server → agent host) needs its own decision. If that path fails, the fallback in the proposal still applies: a text rehearsal in the app, with the Live API recorded once for the video.

### Deployment

- **Agents:** deployed from a script in `agents/`, run by hand, until week 4. Deploying from CI can wait: it saves no time now and costs CI minutes.
- **Web app:** deploys through Cloud Build, as the proposal describes.
- **Dev and tests:** use the ADK's local runner and the Firestore emulator, never a deployed agent.

## Consequences

**Good**

- Managed sessions, tracing and a documented Live API streaming path, with no infrastructure code of our own.
- The strongest match with the judging criteria and the hackathon's own "built with Agent Platform" wording.
- Because stages are stateless invocations, the fallback is a deploy change, not a redesign.

**Bad**

- **Agent Runtime depends on a product in flux.** Its docs and SDK module names changed with the rename, and bidirectional streaming is Preview.
- **Two deploy paths:** Agent Runtime for the agents and Cloud Run for the web app.
- **The free tier's size isn't documented.** Beyond it, compute is billed per vCPU-hour, so a budget alert is required before the first deploy. The open item "create the Google Cloud project with a budget alert" now blocks the gate.

## Confirmation

The gate results are recorded in this ADR's More information section by 2026-10-05, including:
- the measured deploy time
- a link to the first successful trace

## More information

- ADR-0001: Firestore is the system of record.
- ADR-0002: Python ADK, chosen to keep both hosts possible.
- Sources, checked on 2026-09-28:
  - Agent Runtime overview (managed features, any-language containers, free tier): https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/runtime
  - Bidirectional streaming (Preview, `bidi_stream_query`, 10-minute limit): https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/bidirectional-streaming
  - Locations (`asia-southeast1` supports GA features): https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/agent-locations
  - Pricing (Agent Compute $0.085/vCPU-h, Agent Memory $0.009/GiB-h, idle time not billed): https://cloud.google.com/products/gemini-enterprise-agent-platform/pricing
  - ADK Cloud Run deploy (session service options, `agentengine://`): https://adk.dev/deploy/cloud-run/
- Open, for a later ADR: the audio path for the rehearsal.
