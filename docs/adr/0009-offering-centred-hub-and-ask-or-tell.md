---
status: accepted
date: 2026-10-13
deciders: FlowHub maintainers
---

# ADR-0009: Offering-centred hub, Ask or tell, and who-did-what markers

Amends [ADR-0008](0008-hub-first-and-light-multi-user.md) (D1, D2, D5) and [ADR-0001](0001-offering-graph-data-model.md) (D4, plus new fields). Product decisions PRD Q15 to Q23.

## Context and problem statement

ADR-0008 made FlowHub hub-first, with a Catalogue of four modules: Offerings, Proof, Constraints and Partners. Plus Documents, Opportunities and Members.

Reviewing the mockup on 2026-10-13, the maintainers found the modules unnatural:
- **People think per offering,** as in "what do we know about Cloud migration?", not "show me every constraint". Proof, constraints and partners were the data model showing through the UI.
- **The hub should work without AI.** AI should make it faster, not be the only way in.
- **Updating the hub should be as easy as telling a colleague.** For example, "we met a client interested in X" or "our Growth price is now RM 19,500".
- **People need to see where AI was involved,** in the deal room and everywhere else.

Five days remain before submission (2026-10-18), and nothing is built yet.

## Decision drivers

- **Simpler navigation** with the same data underneath. ADR-0001's offering graph and its invariants stay.
- **One visible GenAI feature outside the deal room** that judges can try in seconds.
- **"A person confirms" holds everywhere** (invariant 6). Nothing the AI proposes changes the hub until someone applies it.
- **Scope that fits five days.**

## Decision outcome

### D1. Every offering is one page with six tabs (amends ADR-0008 D1)

| Tab | Holds | Was |
|---|---|---|
| Overview | Summary, key facts, sub-offerings, technology, results you can cite, recent deals, recent changes | Overview and Activity tabs |
| Scope | **What's included** (features) and **Not included** (exclusions specific to this offering, each with what to offer instead). Company-wide rules shown read-only | Features, plus the Constraints module |
| Pricing | Packages (rate cards), man-day rates, add-ons (fee schedules). Cost and margin visible to the team, marked private | Pricing tab |
| Partners | Partners, vendors and suppliers for this offering, with the person in charge | Partners module |
| Sales material | Files (brochures, decks, case studies, past proposals), plus results you can cite, marked public or not public | Documents module, plus the Proof module |
| Notes | Team notes, with an AI summary written only from these notes | New |

**Navigation becomes:** Home, Offerings, Opportunities, then Settings. Clients and Quotes are drawn in the mockup but deferred (D6).
- **Proof, Constraints, Partners and Documents leave the sidebar.**
- **Company-wide constraints** (region, minimum deal size, industries) move to **Settings › Selling rules**. Every Scope tab shows them.

**Data model:** unchanged in shape. ADR-0001 already links proof, constraints and partners to offerings by ID arrays. A constraint with no `offeringIds` is company-wide. Added:
- `offerings.type`: `service` | `package` | `product`
- `partners.relationship`: `partner` | `vendor` | `supplier`
- `partners.buyPrice`: free text, treated as **cost**. Private under invariant 2.
- `documents.offeringIds[]`: so a file appears in the right Sales material tabs
- `workspaces/{ws}/notes/{id}`: `{ offeringId | opportunityId, text, by, at, pinned, via }`
- `opportunities.interestedOfferingIds[]`: hints for the Fit Analyst
- `constraints.insteadText` and `constraints.partnerId`: for "what we offer instead"

### D2. Ask or tell FlowHub (promotes PRD C6 to a Must, and extends it)

One panel, on every screen. People can type a sentence or drop a PDF.

**Tell (change the hub):**
1. The `ask` pipeline (ADR-0010) gets the message or file, plus a compact outline of the confirmed hub (IDs and names only, no cost).
2. Gemini returns a **proposal**: a list of typed operations, each with a target path, a before value and an after value. Allowed operations:
   - create an opportunity
   - add a note
   - add or edit a feature
   - change a price cell or fee line
   - add proof, a constraint or a partner
   - link a document
3. **Code validates every operation:**
   - the Zod schema passes
   - every target ID exists, is live, and is at the expected revision
   - nothing touches a cost field
   - **any price value in an operation appears word for word in the source text** (the message or the document page)

   An operation that fails is dropped and shown as dropped. It is never silently fixed.
4. The person sees each change in the place it will land, applies or discards it, and can undo.

**Ask (questions):**
- Answers cite records and pages.
- Prices go through the same path as Pricing: the model picks line references, code copies the text, and code calculates any totals.
- Cost is never discussed.

**Proposals replace staged extraction (amends ADR-0001 D4).**
- File extraction and messages produce the same proposal shape, stored at `workspaces/{ws}/proposals/{id}`: `{ via: message | document, source, operations[], status, appliedBy, appliedAt }`.
- The review screen is the proposal view.
- Agents still read only live collections, so invariant 6 holds by construction.

### D3. The hub works by hand too

For the submission, people can edit by hand:
- notes
- features
- rate card and fee line **price cells**
- the public flag on proof
- an opportunity's basic fields

Everything else changes through Ask or tell. Full editors for every field are deferred.

### D4. Who-did-what markers, everywhere

**Three markers, used consistently:**

| Marker | Means | Examples |
|---|---|---|
| **AI** (teal), or **AI, waiting for you** (amber) | A Gemini call produced it | Research claims, fit mappings, drafts, proposals, summaries |
| **Calculated** (grey) | Code produced it, with no model involved | Score, copied prices, totals, constraint check, margins |
| **A person** (name) | Someone entered it or approved it | Gates, hand edits, applied proposals, approvals |

- **Every graph entity gets** `provenance: { via: manual | document | message | import, proposalId?, confirmedBy, confirmedAt }`. Run events carry `actor: ai | calc | person`.
- **The Opportunities table** shows each stage as a small marker: done, waiting for you, failed, or not started.

### D5. One user per workspace for the submission (defers ADR-0008 D2)

- Members, invitations and roles are deferred.
- `members/{uid}` still exists with `role: owner`, and `requireRole` stays in every server action. Turning roles back on is UI work, not a data change.
- Seeded history may name fictional colleagues.

### D6. Clients and Quotes are deferred, and invoices won't be built

- **Clients** (a won deal becomes a client, with contracts and milestones) and **Quotes** (built from a deal's priced lines, with approval before sharing) are designed in the mockup. They go in the deck as the roadmap.
- **Quotes would keep invariant 1:** prices are copied by code, and a person enters any "on quote" price.
- **Invoices** bring tax and numbering rules, and stay out of the hackathon build.

### D7. One sample seller

Kelapa Cloud only. Stoklane and Karang Systems, and the startup and enterprise templates, move to the deck.

## Consequences

**Good**
- **Navigation is simpler:** four sidebar items instead of nine. Everything about an offering is one click away.
- **Ask or tell is a visible GenAI feature** that judges can try in seconds, and it reuses the extraction path.
- **The markers make the trust story easy to see:** what the AI did, what code calculated, and what a person decided.
- **No invariant changes.** The price-in-source check makes invariant 1 stronger for hub updates.

**Bad**
- **Shared items can look as if they belong to one offering.** A partner or a result shown on two offering pages is still one record, and the UI says "Also on …".
- **Company-wide rules now live in Settings,** further from the offerings they constrain. The Scope tab repeats them to make up for it.
- **Fewer hand editors.** Some edits need Ask or tell, or wait for a later build.
- **PRD sections 7.2, 7.3, 7.14 and 7.15 change.** Their IDs stay, with notes, and the new sections are 7.16 to 7.20.

## Confirmation

- **Unit tests for the proposal validator:**
  - an unknown or stale target is dropped
  - a price not found in the source text is dropped
  - any cost field operation is dropped
- **End to end:**
  - Telling FlowHub a price change updates exactly one cell after Apply, and nothing before.
  - Telling it about a new lead creates one opportunity, waiting at Gate A.
- **Markers:** every block in the deal room carries exactly one marker.

## More information

- **Amended 2026-10-15 (at build time, D2):** how Ask or tell was built.
  - One Flash call per message decides tell, ask or unclear, and returns either typed changes or an answer. It reads an outline with IDs and names only: no price, no cost, nothing restricted, and only public proof. Each price line has a short handle ("p7"). Code turns handles back into cells and lines and fills in the revision and the current value, so the model never types a price, a revision or a "before" value.
  - Each change kind has its own strict shape in the structured output. A single flat shape let the model put the new price in the wrong field.
  - Code also removes a lead's website or contact details that the message doesn't contain, and drops a lead whose company the message doesn't name.
  - Answers and replies that change nothing are stored in `workspaces/{ws}/answers/{id}`, next to `proposals`, so the panel keeps its history. Prices in an answer are filled in by code from `{{price:pN}}` slots. An amount the model typed, or any cost, replaces the prose with a plain line.
  - Apply re-checks every included change against the hub as it is now, then writes it with the hand-edit writers, recording `via: message`, the proposal, who and when. Undo puts back the stored previous value, unless the record has changed since. A person's Edit vouches for the values they typed, so the in-source checks skip that change.
  - A price change with a start date is scheduled on the cell (ADR-0001 amendment of the same date).
  - Messages count against a new daily cap of 60 (PRD FR-CAP-1).
- **Amended 2026-10-15 (at build time, D2): reading a PDF.**
  - A PDF dropped into Ask or tell, or onto an offering's Sales material tab, goes to a server action (up to 20 MB). The server stores it in Cloud Storage, records it as Uploaded, counts it against the upload cap, and queues an `ingest` job. The job goes through Cloud Tasks to the same internal route as the stages, which now runs jobs of either kind.
  - **Code reads each page's text** with a PDF parser (`unpdf`). That text, not the model's, is the source the validator checks. Every price in a change must appear word for word on the page the change cites, and a change that cites no page, or a page the file doesn't have, is dropped. A quote is kept only if the page contains it.
  - A scan has no text layer, so Gemini Flash transcribes the page images first, and the file is marked as scanned (PRD FR-ING-4 as changed in 7.0). For a scan, the page text is the model's transcription, which is a weaker check than a text layer.
  - Gemini Flash then reads the PDF itself, with the same price-free, cost-free outline as a message, and suggests the file's kind and the offerings it's about. Code turns new offerings into a "link a document" change.
  - The model can't see the hub's prices, so it lists every price the file states. Code sets aside the ones that already match and says how many in the summary.
  - At Apply, a file's prices aren't re-read: they were checked against their pages when the file was read, and the stored file never changes. Targets, revisions and costs are checked again as usual.
  - The file's status follows its proposal: Uploaded, Reading, Ready to review, then Applied, or "Read, nothing changed" when nothing was applied. A failure shows the reason and a Retry action (FR-ING-3).
- **Amended 2026-10-15 (at build time, D3): pricing structure by hand.** An offering often sells in more than one way (tiers, a price list, add-ons, day rates), and with only price cells editable, a person couldn't add a line or a tier, or price a new offering at all without Ask or tell. So on the Pricing tab a person can now also:
  - add, rename and remove lines and tiers, and set how a line is charged
  - start a new kind of pricing on an offering (it opens empty, ready for its first line), or remove one (a soft delete)
  - Existing lines and tiers keep their IDs, so proposals and deal-room runs that point at them still resolve. A removed line is named in the audit summary, as an emptied cell already was. Cost values are never quoted there.
  - A private cost card stays values-only: its lines follow its price card.
- PRD v3.0 sections 7.0 and 7.16 to 7.20, and decisions Q15 to Q23.
- The mockup canvas, page "v2 · Offering-centred" (private to the maintainers).
- ADR-0010 for the stack these pipelines run on.
