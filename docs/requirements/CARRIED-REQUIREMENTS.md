# FlowHub: domain requirements carried forward

Written 25 Sep 2026. These are requirements, not code or copied specs. They restate lessons learned modelling a real product and service catalogue, in generic terms, so FlowHub's offering graph starts from tested shapes instead of guesses. Treat each one as a starting position to confirm in an ADR, not a settled decision.

No names, prices or vendors from any real company belong in this repository. Demo data is synthetic.

## R1. Offerings and features

- An **Offering** is a product or service the seller sells.
- A child item becomes its own **sub-offering** if any one of these is true: it has its own commercial terms, its own owner, or its own client. Otherwise it is a **Feature** on its parent: name, description, status, order.
- Why this matters for FlowHub: the Fit Analyst matches gaps to offerings and sub-offerings, and cites features as supporting detail. Without the test, extraction produces a flat list where everything looks like a product.

## R2. Rate cards, for grid-shaped pricing

- A **RateCard** belongs to an offering, has a kind of `cost` or `pricing`, a name and a note.
- Columns and rows are data, not schema. A column is a package, tier or provider. A row is a line item such as a method, channel or unit. Adding a column is a form, never a migration.
- Rows carry an optional `group_label`. A heading renders whenever the group changes from the row above.
- **Cell values are free text.** Real price sheets mix "1.5%", "RM 0.50", "1.2% min RM 0.20", "Waived" and "On quote". A numeric column rejects half of them.
- A cell can be flagged `is_current` to mark the option actually in use.
- Only cells with a value exist. Clearing a cell deletes it.
- FlowHub addition: every card, row and cell keeps a pointer to the source document and page it was extracted from.

## R3. Fee schedules, for list-shaped pricing

- A **FeeSchedule** is a named, ordered list of lines on an offering. An offering can have several: a standard list, an add-on list, a supply list.
- One flat line shape covers every kind of charge: `group_label, label, basis, price, cost, paid_to, owner, note, order`.
- `basis` carries the difference between one-time, monthly, per transaction and similar, not the structure.
- Tiers are sibling lines in one group, for example volume bands.
- Price and cost are free text. Margin is derived on screen only when both parse as the same kind of number, and is never stored.
- Order is meaningful: one-time before recurring before variable.
- FlowHub rule: the Pricing agent reads prices only through function calls into R2 and R3. The model never states a price from memory. **Cost is private to the seller and never appears in any generated artefact.**

## R4. Proof

- A **Proof** item is a case study, metric, client logo or testimonial, linked to one or more offerings.
- Each proof carries whether it may be named publicly, because many clients cannot be.
- The Writer may only cite proof marked public.

## R5. Constraints

- A **Constraint** is something the seller does not do, cannot do or will not do: regions, industries, minimum deal size, unsupported integrations.
- The Fit Analyst checks constraints before scoring fit, and the fit map shows a gap as "cannot meet" with the constraint cited.

## R6. Partners

- A **Partner** is a shared party the seller works with, held once and referenced by offerings. It is not duplicated per offering.
- Partners carry what they cover, so a "cannot meet" gap can suggest "consider partner X".
- Contacts belong to the partner, not to the offering that mentions it.

## R7. Technology catalogue

- Technology is a set of `{ category, value }` pairs drawn from a catalogue kept in code, with an "Other" typed value allowed in every category.
- Suggested categories: front end, back end, database, cache and messaging, mobile, hosting, CI/CD, monitoring, auth and security, plus internal and external integrations.
- A pair keeps its own label, so it still displays if the catalogue changes.
- The set is saved as a whole in one write, with one audit event holding before and after.
- FlowHub uses the same catalogue twice: for the seller's integrations, and for the prospect's detected stack in the research brief. Matching the two is one of the fit signals.

## R8. Opportunities

- An **Opportunity** is a flat row, not a rich record: prospect, persona, intake type, source, dates, status, value as free text, outcome, outcome reason.
- Status is a small fixed set: new, researching, proposing, sent, won, lost, no decision.
- The deal room hangs off the opportunity. The row itself stays simple enough to list, filter and export.

## R9. Documents and ingestion

- Text extraction runs at upload time, as a side effect of upload, not as a separate crawl.
- Extraction failures are visible on the document, never silent. A scanned file that yields no text is flagged, then sent to OCR.
- Extracted entities go to a review screen. The user confirms or edits them before any agent uses them.
- Each document keeps versions. A new upload of the same file replaces the entities extracted from the old version.

## R10. Trust layer

- **Soft delete** for every destructive action, with a recycle bin. Deleting an offering takes its sub-offerings, and restoring brings them back.
- **Audit trail** on a small, fixed action vocabulary: create, update, delete, restore, view-restricted, generate, send.
- **Last-verified stamp** on each offering and rate card, showing who confirmed it and when. The Fit Analyst warns when it relies on something not verified in over 90 days.
- No approval workflow beyond the human gates in the deal room.

## R11. Search

- Search covers offerings, features, proof, notes and document contents.
- Results respect workspace isolation and any restricted flag. A snippet must never leak restricted content.

## R12. Offering graph exchange format

- The offering graph can be exported and imported as one JSON document covering R1 to R7.
- The format is versioned and documented in the repository.
- Purpose: any existing catalogue system can feed FlowHub by producing this file, which keeps FlowHub compatible with catalogues kept elsewhere without sharing code. It also makes demo data easy to reset.

## Firestore note

The shapes above came from a relational model. In Firestore, rate card columns, rows and cells, and fee schedule lines, fit as subcollections under the card or schedule. Workspace ID goes on every document so security rules and vector queries can filter by it. Decide in the first data-model ADR whether cells are separate documents or a map on the card. A map is simpler until a card grows past a few hundred cells.
