---
status: accepted
date: 2026-11-11
deciders: FlowHub maintainers
---

# ADR-0019: Quotes with approval, priced by code and gated by checks

Builds on [ADR-0006](0006-agent-design.md) (D3, prices by code), [ADR-0007](0007-google-docs-access.md) and [ADR-0016](0016-after-the-proposal.md) (steps after Gate D). Requirements PRD 7.20 (FR-QUO-1 to FR-QUO-7); product decision PRD Q31.

## Context and problem statement

The third Grand Finale feature (PRD Q30) takes a deal from the approved proposal to a priced, approved quote. FlowHub's pitch is that prices come only from code, so the quote is where that has to hold most visibly: real totals, a discount, tax, and a second look before it leaves.

Each workspace has one person, the Owner (PRD Q16), so "a second look" needs a decision.

## Decision drivers

- Invariant 1: no model writes a price; a person writes only an "On quote" price, marked as theirs.
- Invariant 2: no cost or buy price on a quote.
- A judge alone must be able to try every step.
- Reuse what exists: the Gate C pricing lines, the price parser's `calculate`, the Doc path from Finalise.

## Considered options for approval

| | **A. Owner approves; code's checks gate Approve** (chosen) | B. Invite a second member as approver | C. Approval only above a threshold |
|---|---|---|---|
| A judge alone can try it | Yes | No: needs two Google accounts | Partly: only quotes over the limit wait |
| Separation of duties | Nominal for now; the checks carry the weight | Real | Nominal |
| Effort | About 3 days | About 5 days (invites, roles in the UI and server) | About 3 days |
| Later | The approver is stored apart, so B can be added | Done | Can be combined with A or B |

## Decision outcome

Chosen option: **A**, because judges try FlowHub alone, and the checks code runs are what make the approval meaningful.

### D1. Data

- `opportunities/{id}/quotes/{quoteId}`: the number, the write and fit runs it came from with their revisions, the lines, the discount, the tax, the totals, the status (`draft`, `sent`, `approved`, `changes_requested`), a history of who did what and when, and the Doc once created.
- `workspaces/{ws}/counters/quotes` numbers quotes per year in a transaction: Q-2026-001.
- `workspace.quotes`: the tax label and rate, and the discount limit. Defaults follow the country (SST 8% in Malaysia, GST 9% in Singapore, none elsewhere); Settings › Quotes changes them.

### D2. Lines and totals by code

- Lines start from the fit run's approved pricing lines: the copied price text, its reference to the rate card cell or fee line, and the quantity the fit map found.
- Amounts come from the price parser's `calculate` (minimum quantities and amounts applied). "Included" and "Waived" lines show as such and add nothing. Recurring lines are listed apart, per period, and not added to the one-off total.
- A person may change a quantity, leave a line out, or enter a price for an "On quote" line. That price must parse as an amount in the workspace currency, and it is marked as the person's.
- Discount, tax and total are calculated by code on every save and again at approval. The browser never sends a total.

### D3. Scope wording, checked

- One Flash call writes a short "what this covers" for each line, restating the proposal's live claims (as the follow-up email does, ADR-0016).
- Code drops wording with an amount, a price placeholder or a private result's name, and falls back to the line's name. One AI run per quote.

### D4. Checks, run by code at every save and at approval

1. Every copied price still matches the Pricing tab today: code resolves each line's reference against the current graph. A change is named, before and after.
2. Every included "On quote" line has a person's price.
3. The discount is within the limit.
4. The one-off total meets the company's minimum deal size, if one is set.
5. Totals were worked out by code (always true; shown so the approver sees it).
6. No cost on the quote: lines carry only sell-side fields (structural; a unit test covers it).

Approve is refused on the server unless all pass. The browser's disabled button is a convenience, not the control.

### D5. Approval

- "Send for approval" locks the quote. The Owner (`requireRole("owner")`) approves or requests changes on a separate approval view; a change request needs a note and returns the quote to draft.
- Each step is in the quote's history and the audit trail (`send`, `update`).
- Self-approval is allowed for the submission and shown as such ("built and approved by Nadia").

### D6. Output

- After approval, "Create in Google Docs" renders the quote to HTML in code and creates a Doc in the FlowHub folder with the `drive.file` token, used once and never stored (ADR-0007, invariant 12). Drive then exports a PDF beside it.
- FlowHub never sends the quote.

## Consequences

- The deal room now runs from a lead to an approved quote, and the pitch's central rule (prices from code) is visible where money is concrete.
- One more AI-run use (scope wording) on the daily cap.
- Approval is single-person for the submission; ADR-0019 option B is the path to real separation of duties.
