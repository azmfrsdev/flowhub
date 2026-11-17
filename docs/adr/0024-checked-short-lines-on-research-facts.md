---
status: accepted
date: 2026-11-17
deciders: FlowHub maintainers
---

# ADR-0024: Checked short lines on research facts

Amends [ADR-0006](0006-agent-design.md) D2 (grounding enforced by code). Keeps invariant 3 for the claims themselves. Requirements PRD FR-RES-8. A Grand Finale change (4 Dec 2026).

## Context and problem statement

The Research stage was redesigned on 2026-11-17 as five boxes of a fixed size, with one short line per fact ("**Staff** about 19,300 people") and the whole sourced sentence one click away. The maintainer's sketch asked for lines like "Sector: Retail" and "Staff: ~19,300 as of 31 Dec 2025".

The first build asked Gemini for a phrase copied from the sentence, and code kept it only if the sentence contained it. Three live runs on one prospect showed that Gemini summarises rather than copies. The dev log of the third run listed all ten dropped phrases: each was reworded ("RM4.65 billion annual revenue in 2024" for "…generated 4.65 billion Malaysian Ringgit in annual revenue"), and several merged two facts. A looser match, letter by letter, kept none of them. Copy-only lines therefore fall back to the sentence's opening, and the page stays wordy.

## Decision drivers

- A brief that reads at a glance, as the maintainer sketched it.
- No unchecked figure on screen: numbers are where a wrong word costs a deal (the same reasoning as invariant 1 and invariant 6's price rule).
- The sourced claim stays exactly as grounding returned it (invariant 3), with its sources.
- No extra model call or cost: the line comes from the call that already writes the labels and inferences.

## Considered options

| Option | For | Against |
|---|---|---|
| **Checked summaries** | Short lines as sketched; every figure checked by code; the claim is untouched | A model's wording on screen, so it must be marked as such |
| Copy-only phrases | Only source words on screen | Gemini doesn't copy, so most lines fall back to the sentence's opening |

## Decision outcome

Chosen: **checked summaries**.

- **D1. The short line is a summary of one claim, written by Gemini** in the research step's inferences call, at most twelve words, using only what that claim says.
- **D2. Code checks every figure.** Each number in the line (amounts, counts, percentages, years) must appear in the claim, with the same scale (million or billion) where the line gives one. Each name in the line (a capitalised word that isn't a common abbreviation such as RM, FY or AI) must appear in the claim. A line that fails is dropped and counted in the run's progress events, and the page shows the claim's opening words instead.
- **D3. The claim is never changed.** `text` stays exactly as grounding returned it, and the short line sits beside it in `short`. Citations, Gate B removal, the copied brief (FR-RES-7) and every later stage read `text`, never `short`.
- **D4. The page marks the lines as summaries.** The Snapshot and News boxes carry a "Summaries" tag, and clicking a line shows the sourced sentence with its sources and the note that Gemini wrote the line and code checked its figures.

### Consequences

- Good: the brief reads at a glance, and the pitch gains a clear example of the pattern "AI writes, code checks".
- Neutral: a line can still choose which part of a claim to show. It can't add a figure or name the claim doesn't contain.
- Bad: a summary can drop a qualifier ("approximately"). The full sentence is one click away, and the Fit Analyst and Writer never read the summary.
