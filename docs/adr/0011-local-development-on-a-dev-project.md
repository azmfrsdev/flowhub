---
status: accepted
date: 2026-10-14
deciders: FlowHub maintainers
---

# ADR-0011: Local development runs against a separate dev Firebase project

Amends the conventions in `CLAUDE.md` ("Tests never share a database with dev", "Develop and test locally").

## Context and problem statement

The conventions said to develop locally against the Firestore emulator. The emulator needs Java 21 or later.

On 2026-10-14, the build machine could not run it:
- It restricts installs to the user's own folder.
- Its security software holds new downloads and executables for minutes before releasing them.
- A per-user JDK 21 installed, but the emulator's Java process never opened its port.

Four days remain. The question is where local development keeps its sign-ins and data, without touching the deployed service's data.

## Decision drivers

- **Never touch the deployed service's data** from a laptop.
- **No new cost.**
- **Work on the build machine today,** without waiting on its administrators.
- **Keep the trust rules testable:** the security rules and workspace isolation.

## Considered options

| Option | Pros | Cons |
|---|---|---|
| A. Keep the emulators and get Java working on the machine | Matches the original convention. Fully offline | Blocked on this machine, with no fix date |
| **B. A separate Firebase project for local development, with automated Firestore tests still on the emulator** | Works now. Real Google sign-in locally. Same rules and indexes as production. No billing account attached, so it can't cost anything | Local runs need a network connection. Local data lives in the cloud, in the dev project |
| C. Use the deployed project with a dev prefix | No setup | Breaks the first driver |

## Decision outcome

**Chosen: B.**

### D1. The dev project
- `flowhub-cup26-dev`, with no billing account (Spark).
- Firestore (default) in `asia-southeast1`. The same `firestore.rules` and indexes are deployed to it.
- Firebase Auth with Google sign-in, and `localhost` authorised.
- `web/.env.local` points `FIREBASE_PROJECT_ID` and the `NEXT_PUBLIC_FIREBASE_*` values at it.

### D2. What still uses the main project
- **Gemini:** calls go to the main project (`GOOGLE_CLOUD_PROJECT`) with the developer's own sign-in (ADC), because the models need billing. Model calls hold no data, so this doesn't break isolation.
- **Uploads:** a separate dev bucket in the main project, `flowhub-cup26-dev-uploads`, deletes objects after 30 days. The deployed service's bucket is never used locally.

### D3. Automated tests keep the emulator
- Tests that need Firestore, such as rules and isolation tests, run on the emulator under a `demo-` project ID: in CI, and on any machine where Java works.
- They never use the dev project, so "tests never share a database with dev" still holds.
- The Admin SDK refuses a non-`demo-` project while the emulator variables are set.

### Consequences
- Good: development continues today at no cost, with real sign-in end to end.
- Good: the deployed project's data and bucket stay untouched by local work.
- Bad: local development needs a network connection, and the dev project's data persists. Reset it by deleting its collections.
- Neutral: switching back to the emulators is a change to `.env.local`. The file carries the emulator block, commented out.
