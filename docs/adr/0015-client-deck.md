---
status: accepted
date: 2026-10-17
deciders: FlowHub maintainers
---

# ADR-0015: Client deck, a .pptx built in code and converted to Google Slides

Builds C2 (Slides) on top of [ADR-0007](0007-google-docs-access.md) and [ADR-0010](0010-genai-workflow-in-typescript.md). Product decision PRD Q27, requirements PRD 7.22.

## Context and problem statement

Gate D ends with a proposal in Google Docs. A salesperson then usually needs a deck to present the same proposal to the client. The maintainer asked for that deck to be ready to present, in the layout of their own deck guide (the "visual deck design" house style), with images and diagrams.

That raises three questions:
1. How to keep the deck inside the trust controls.
2. How to produce Google Slides that look designed rather than generated.
3. Where images can come from without breaking copyright in a document handed to a client.

## Decision

**D1. The deck restates the approved proposal; it adds no new claims.**
- A Pro-tier call condenses the run's `working` copy into the text of four slides: What we heard, What we'll deliver, How we'll deliver and Next steps. It also writes the speaker notes for all eight slides, and suggests three short photo searches for each photo.
- Every text item names the proposal claims it restates. Code drops an item that names none, or that states an amount, a `{{price:…}}` placeholder or the name of a result marked not public, and counts what it dropped. This is the follow-up email's rule (C3).
- A duration on the timeline must appear in the text of a claim it cites.
- No Reviewer loop runs, because nothing new is claimed.

**D2. Code builds the slides that carry facts.**
- Title.
- Where we fit: the needs and mappings from the Gate C fit map.
- Investment: the approved pricing lines, rendered by `pricingGroups`, as the Doc's table is. Prices are copied by code (invariant 1).
- Proof: only results marked public (invariant 5).
- The deck reads the graph through the same projections as the Writer, so cost never reaches it (invariant 2).

**D3. A .pptx is built with pptxgenjs, and Drive converts it into Google Slides.**
- The renderer (`web/src/server/deck/render.ts`) follows the house style:
  - a 10 × 5.625 in canvas
  - the navy palette, with emerald kept for money and amber for risk
  - an 0.80 in header band with an eyebrow and a title
  - a main band, a closing band and a stat strip
  - numbered stage badges and arrows between stages
  - no bullet lists as the main content
- "Open in Google Slides" uploads the .pptx to the user's FlowHub folder with Drive's conversion to `application/vnd.google-apps.presentation`. It uses the same short-lived `drive.file` token as the Doc (ADR-0007), and the token is never stored or logged (invariant 12).
- "Download .pptx" streams the same file from a route that checks the session and the workspace.
- Building through the Slides API instead would mean placing every shape by hand in a batch of requests. Text fitting, arrows and tables would all be written twice for the same look.

**D4. Photos only from Openverse, under open licences, with credits.**
- Images "from the web" in a client deck would be a copyright risk.
- The deck searches Openverse with the model's terms, and accepts only:
  - CC0
  - the Public Domain Mark
  - CC BY
  - CC BY-SA
- Code keeps only wide photos whose own title names a search word, and drops any whose title or tags mark a brand, a logo, packaging or an advert.
- A Flash call then reads the remaining candidates' titles and tags and picks the one that suits a client deck, or none. It rejects named people, events, shops and anything a client could find odd; a slide without a photo is better than a wrong one.
- It keeps the title, creator, licence and source page, and prints them as a credit line on the slide. The person can remove the photos from a deck.
- At most two photos, on the Title and Proof slides, so diagrams carry the argument. A failed or empty search leaves the slide without a photo.

**D5. Stored as a spec, rendered on demand.** `opportunities/{id}/decks/{writeRunId}` holds:
- the checked slide text and speaker notes
- the photo metadata
- what code dropped
- the working copy's `rev` it was written from

The .pptx is rendered from that record each time. A deck whose `rev` no longer matches the run is marked out of date.

## Consequences

- The deck is presentation-ready, and every sentence on it traces to the approved proposal.
- Google's conversion keeps shapes, text, tables and images. Fonts map to Calibri-compatible faces, and pptxgenjs effects such as shadows are kept to a minimum so the conversion stays faithful.
- Text boxes are sized for the longest text the schema allows, because the generated deck can't run a visual QA pass. Each slot has a character budget in the Zod schema, measured against its box.
- Openverse has rate limits for anonymous use. A deck is written rarely, and a failed search only means no photo.
- One AI run per deck, against the daily cap.
