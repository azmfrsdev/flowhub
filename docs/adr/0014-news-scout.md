---
status: accepted
date: 2026-10-17
deciders: FlowHub maintainers
---

# ADR-0014: News scout, leads from recent news

Adds a pipeline under [ADR-0010](0010-genai-workflow-in-typescript.md). Product decision PRD Q25, requirements PRD 7.21.

## Context and problem statement

Every opportunity so far starts with something the seller already has: a meeting invite, an email, a tender or a company website. The maintainer asked for FlowHub to also find leads itself. It would read recent news about the seller's market, judge which companies look like good opportunities, and show them as a newspaper. The deal flow after that stays the same.

This was decided on 2026-10-17, after the planned feature freeze, so it has to reuse what exists and must not weaken the trust controls.

## Decision

**D1. A pipeline called from a server action, like Ask or tell.** `web/src/server/pipelines/scout.ts` runs in the request, in about half a minute, and writes the day's edition to `workspaces/{id}/editions/{yyyy-mm-dd}` (Malaysia date). It isn't a deal-room stage, so it isn't queued through Cloud Tasks. Like every pipeline, it reads its inputs from Firestore, keeps nothing in memory, and is the only code that calls the model for it (invariants 8 and 9).

**D2. Code decides what to search for.** The beats come from the hub: offerings, company-wide selling rules, past clients (public results and won deals only) and the workspace's country. Private results, costs and partner prices never reach the prompts (invariants 2 and 5).

**D3. Same grounding rule as research.** The four beats run in parallel as Google Search grounded calls. Their answers are cut into claims with the research code (`cutClaims`), so a sentence with no grounding support is dropped and counted (invariant 3). Search Suggestions are kept and shown unchanged.

**D4. The model groups, code judges.**
- A Flash call groups the sourced claims into stories, one company each, and names the offerings each one could need. It is extraction, and the page waits on it: with a Pro-tier editor, a test edition took 103 seconds.
- Code then drops any story that rests on no kept claim or names no live offering. It also drops, and counts, companies that are already an opportunity or that break a selling rule (`checkSellingRules`).
- The lead score is calculated in code from:
  - offering matches
  - recency, read from the month and year in the sourced sentences
  - the kind of event
  - the number of separate domains reporting it

**D5. A person opens the deal.** "Open a deal" creates an opportunity with `intakeType: "news"`. The story and its source links are the input, and the matching offerings are its interests. The action then starts intake. From there it is the normal deal room, with every gate.

**D6. Caps.** An edition costs one AI run (FR-CAP-1), charged before any model call. The kill switch stops it.

## Consequences

- Opportunities can now start from FlowHub's own reading of the market. Every story is still traceable to its sources, and nothing happens without a person.
- An edition is a snapshot, one per day. Printing again the same day replaces it; earlier days stay as back issues, and the last seven can be opened from the paper. Stories opened as deals keep their link to the deal, and their companies count as known for the next week's papers.
- A grounded edition costs four grounded prompts and one Flash call, within the daily cap.
- No scheduled printing. A daily edition would need Cloud Scheduler and per-workspace budgets, which wait until after the submission.
