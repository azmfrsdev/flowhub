---
status: accepted
date: 2026-11-11
deciders: FlowHub maintainers
---

# ADR-0017: Voice rehearsal with Gemini Live, through a separate relay service

Builds on [ADR-0010](0010-genai-workflow-in-typescript.md) and [ADR-0016](0016-after-the-proposal.md). Amends ADR-0010 (one service) and the wording of invariant 9. Product decision PRD Q30, requirements PRD 7.26 (C1).

## Context and problem statement

FlowHub is in the Top 50 for the Grand Finale on 2026-12-04, and the organiser allows building until then. The maintainer chose rehearsal (C1) as the first finale feature. The salesperson talks out loud with the prospect's decision-maker, played by Gemini, and gets coached afterwards.

Findings on 2026-11-11:
- **Model.** `gemini-3.8-live` is GA on Agent Platform. It takes 16 kHz PCM audio, speaks at 24 kHz, and returns transcripts of both sides. It is served in `us-central1`, `us` and `eu`, not on `global` and not in `asia-southeast1`.
- **Sessions.** An audio session lasts up to 15 minutes, and one connection about 10 minutes before the server asks the client to resume.
- **Credentials.** Ephemeral tokens exist only on the Gemini Developer API, not on Agent Platform. With the service identity, the browser can't connect to Gemini at all, so a server relay is required. Invariant 9 wants that anyway.
- **Next.js.** App Router route handlers can't accept a WebSocket upgrade. A relay needs either a custom server for the app, or a service of its own.
- **Cost.** About $3 per million audio tokens in and $12 out, which is roughly $0.10 to $0.25 for a 10-minute rehearsal.
- **The deployed app is still being judged** until the finale, so changes to how it boots carry risk.

## Decision drivers

- Keep every risk of a new, long-lived connection out of the service the judges use.
- Keep invariants 2, 5, 9, 10 and 12: no cost or private results in the buyer's brief, no model call or Firestore write from the browser, and no Google user token anywhere.
- Work on venue Wi-Fi: a text mode that needs no audio.
- Code, not the model, checks the numbers the salesperson says.

## Considered options

| | **A. Separate relay service** (chosen) | B. Custom server in the main app | C. Browser speech recognition and synthesis, with text calls |
|---|---|---|---|
| Risk to the judged app | None until the UI ships | Replaces the generated `server.js` | None |
| Cloud Run settings | Its own timeout and concurrency for long sockets | Shared with the stage pipelines | Unchanged |
| GenAI | Gemini Live, native audio, interruptions | Same | Gemini text only; the browser's speech engine does the voice |
| Ops | A second service and image | One service | Nothing new |

## Decision outcome

Chosen option: **A**, because it keeps the judged service unchanged until the rehearsal UI ships, and gives long-lived sockets their own settings. C was rejected because the voice wouldn't be Gemini, and the speech quality varies by browser.

### D1. `flowhub-live`, a second Cloud Run service (amends ADR-0010)

- **Code lives in `web/`,** in `src/live/`, so it reuses the schema, the loaders, the buyer brief and the price checks. It runs with `tsx --conditions=react-server`, from its own `Dockerfile.live`.
- **Settings.** `asia-southeast1`, minimum instances 0, maximum 2, concurrency 10, a 20-minute request timeout, and the same `flowhub-run` service identity.
- **The main service is unchanged,** apart from the rehearsal UI and its server actions.
- Like the pipelines (invariant 8), the relay keeps nothing in memory that it needs after a connection ends. Firestore holds the rehearsal.

### D2. The connection, and what the browser may hold (amends invariant 9's wording)

1. A server action in the main app checks the role and the proposal (as pitch prep does), charges one AI run, and creates the rehearsal in state `ready`.
2. The browser opens a WebSocket to the relay. Its first message carries a fresh Firebase ID token and the rehearsal's path.
3. The relay verifies the token, checks that the caller is a member of that workspace with a role that may start runs, and that the rehearsal is theirs, `ready`, voice, and less than 2 minutes old. Otherwise it closes the socket with a reason.
4. The relay builds the buyer's instruction from Firestore (D3) and opens the Live session in `us-central1`.
5. Audio flows both ways through the relay. The relay writes the transcripts of both sides to the rehearsal and marks it `ended` when the call ends, at the 10-minute cap, or when the socket drops.

Invariant 9 now reads: the browser never calls a model or the internal route. It may hold a socket to FlowHub's relay for audio only, and it gets progress, transcripts included, through Firestore listeners. The ID token is verified and dropped; it is never stored or logged (invariant 12's spirit, though it isn't a Google user token).

### D3. The buyer's brief is built in code

- **The buyer:** the contact from intake, with their role, or "the decision-maker". Code chooses what they push back on (price, fit, timing) and a mood (busy, sceptical, friendly) from the person's choices.
- **What the buyer knows:** the proposal's live claims (as for the follow-up email), the approved price texts, the needs FlowHub can't meet with the partner or alternative the hub records, and the brief's open questions.
- **What the buyer never gets:** cost, buy prices, partner contacts, or any result marked not public (invariants 2 and 5).
- The buyer may repeat an approved price, but is told never to invent one. Nothing the buyer says becomes an artefact.

### D4. Text mode, always available

- The same rehearsal, typed. Each buyer reply is one Flash call with the brief and the transcript so far, both loaded from Firestore (no history held by the model).
- It is the fallback when the microphone or the network fails, and the only mode when the relay isn't configured.
- A rehearsal ends after 10 minutes or 24 turns from the salesperson, whichever comes first.

### D5. Coaching after the call, checked in code

- Pro reads the transcript, the proposal's claims and the needs outside scope. It returns a mark out of 10, what landed, what to fix (each naming the claims behind it) and the buyer's questions the salesperson wasn't ready for.
- Code finds every amount the salesperson said and compares it with the approved price texts, as practice does (ADR-0016 D3). A mismatch is flagged with the turn it came from, and caps the mark at 6.
- Code drops a coaching item that states an amount that isn't approved, or names a private result.
- Coaching is part of the same AI run as the rehearsal.

### D6. Models and locations

- `MODELS.live` is `gemini-3.8-live`, with `LIVE_LOCATION` `us-central1`. Both live only in `web/src/server/ai/models.ts`, and `check-models` opens a short Live session to confirm them.
- Text replies use `MODELS.flash`; coaching uses `MODELS.pro`, both on `global` as before.

## Consequences

- The finale demo can show a spoken conversation with Gemini that stays grounded in the approved proposal, and a code check that catches a wrong price said out loud.
- There are two services to deploy. `npm run deploy:live` deploys the relay; `npm run deploy` is unchanged.
- Audio crosses from Singapore to `us-central1`, adding roughly 180 ms to each turn. Sample deals are fictional and the rehearsal holds no customer data beyond what the proposal says, so the data location is acceptable for the demo. A real customer deployment would need a Live region that matches its data residency.
- A rehearsal costs one AI run against the daily cap. Live audio is billed per token, bounded by the 10-minute cap and the daily ceiling (FR-CAP-3).

## Confirmation

- Unit tests cover the buyer brief (no cost, no private results), the amount check on transcripts, and the coaching checks.
- The relay refuses a connection without a valid token, for another workspace's rehearsal, or for a rehearsal that isn't `ready`.
- `check-models` confirms the Live model and location before deploy.
