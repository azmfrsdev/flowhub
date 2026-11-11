---
status: accepted
date: 2026-11-11
deciders: FlowHub maintainers
---

# ADR-0018: The offering graph view, with a deal's fit map laid over it

Builds on [ADR-0001](0001-offering-graph-data-model.md) and [ADR-0009](0009-offering-centred-hub-and-ask-or-tell.md). Requirement PRD FR-OG-12, extended; product decision PRD Q30.

## Context and problem statement

Judging asks whether FlowHub's core is a typed offering graph with source provenance or a folder of PDFs. The graph exists (ADR-0001), but the hub shows it one offering at a time, on six tabs. Nothing shows it whole. For the Grand Finale on 2026-12-04 the maintainer chose a graph view second, after rehearsal.

The view must show the links, and every fact's source, at a glance. It must also tie the hub to the deal room, and never show cost.

## Decision drivers

- Read-only, with no AI run and no writes: the lowest risk to the app under evaluation.
- No new dependency for a single view.
- The same layout each time it opens, so a demo is repeatable.
- Invariant 2 enforced in the data, not just the drawing.

## Considered options

| | **A. SVG drawn in React, layout computed in code** (chosen) | B. A graph library (Cytoscape, React Flow) |
|---|---|---|
| Dependency | None | A large client bundle for one view |
| Look | Matches the comic theme directly: ink outlines, hard shadows | Needs theming to match |
| Layout | A small deterministic force layout, a few dozen nodes | Built in, but random unless seeded |
| Interaction | Click, hover and keyboard focus, written for this view | Pan and zoom built in |

## Decision outcome

Chosen option: **A**, because a sample workspace has at most about 60 nodes, which a small layout handles, and it keeps the comic look without fighting a library's styles.

### D1. A typed projection, built on the server

- `lib/offerings/graph-model.ts` turns the confirmed graph into nodes and edges: offerings (and sub-offerings), results, scope rules (constraints linked to offerings), partners, documents, and deals.
- Each node carries only what the view shows: a label, a short summary, its source (document name and page) or provenance (who entered it, how it arrived), and for a result whether it is public.
- **It never copies** cost fields, cost rate cards, a partner's buy price or contacts (invariant 2). A partner node carries only whether a private buy price exists, shown as a lock. A unit test checks the projection.
- Company-wide selling rules link to no offering, so they aren't drawn; Settings shows them.
- Deleted records are left out.

### D2. Layout in code, the same each time

- Offerings start on an inner ring, and every other node starts beside the offerings it links to.
- A fixed number of force steps (repulsion, springs along edges, a pull to the centre) settles the drawing, with no randomness. So the same graph always gives the same picture.

### D3. The fit map lens

- The server reads the current fit run of each deal that has one, and passes the needs, their mapped offerings and strengths, and each Cannot meet with its scope rule and partner.
- A mapping to a feature points at the offering that holds it.
- Choosing a deal highlights those nodes and edges, coloured as the fit map is (strong, partial, weak, cannot), and fades the rest. Nothing is recomputed: it is the fit map a person already approved, or the one waiting at Gate C.

### D4. Where it lives

- A List or Graph toggle on the Offerings page, `?view=graph`, as FR-OG-12 asked. The list stays the default.

## Consequences

- The hub shows its graph whole, with sources one click away. The fit lens connects the hub to the deal room.
- Large catalogues will be busy. The kind filters, and the focus on a selected node's neighbours, keep it readable at sample size; larger hubs would need grouping later.
- No new Firestore data, rules or services.
