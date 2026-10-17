---
status: accepted
date: 2026-10-17
deciders: FlowHub maintainers
---

# ADR-0016: After the proposal: Gmail drafts, pitch prep and next steps from meeting notes

Builds on [ADR-0007](0007-google-docs-access.md), [ADR-0010](0010-genai-workflow-in-typescript.md) and [ADR-0015](0015-client-deck.md). Product decision PRD Q28, requirements PRD 7.23 to 7.25.

## Context and problem statement

The deal room ended at Gate D, with the proposal in Google Docs and a deck in Slides. The maintainer asked for what happens next:
1. Sending the proposal from Gmail.
2. Getting ready for the meeting where it is presented: likely questions, questions to ask, practice.
3. After the meeting: turning rough notes into next steps against what the company sells, such as asking a supplier, another team, a demo, a tender or a management approval. An AI note-taker that joins the meeting was ruled out for time; pasted notes replace it.
4. Simple logos for the three sample companies.

Each has to keep the trust controls: prices only from code, cost private, a person deciding, and nothing sent on the user's behalf without them.

## Decision

**D1. Gmail through a filled-in compose window, not the Gmail API.**

| | Compose window (chosen) | Gmail API, `gmail.send` |
|---|---|---|
| Google permission | None new | A sensitive scope. Without Google's verification, which takes weeks, every user sees "Google hasn't verified this app" |
| Who sends | The person, in Gmail | FlowHub, for the person |
| A private Doc | Gmail offers to share it on Send | FlowHub would have to share it through Drive |
| Limits | Plain text with links, no attachments | Attachments possible |

- "Open in Gmail" opens `mail.google.com` compose with the recipient, subject and body in the link. Code appends the Doc and Slides links; the model never writes a URL.
- The draft passes through the browser's address bar, so it may stay in browser history. The email holds no amounts and no private results (C3's rules), so that is acceptable.
- "Mark as sent" is a separate person's action, recorded in the audit trail.
- *Added the same day, at the maintainer's request:* Gate D shows the three ways forward as numbered options (proposal, deck, email), and the email can go with files.
  - **One click.** "Draft and open in Gmail" opens a blank tab inside the click, so the browser allows it, drafts the email if needed, then moves the tab to the compose window. A draft with an unsupported sentence closes the tab and stays in FlowHub for the person to check.
  - **Files are links, not attachments.** A compose link can't carry attachments; real attachments would need the restricted `gmail.compose` scope, with the unverified-app screen for every user and a paid security assessment to remove it. So the person picks, for each of the proposal and the deck, the Google file, an Office copy, or neither. Word (exported from the Doc) and PowerPoint (rendered from the deck) copies are saved to the FlowHub folder with the `drive.file` token, recorded in `opportunities/{id}/emailFiles/{writeRunId}`, and reused while the Doc and the deck are unchanged. Gmail offers to share linked Drive files with the recipient on Send.
  - Saving an Office copy needs the Google window first. If the browser then blocks the new tab, a link to the ready draft appears instead.

**D2. Steps E and F, without gates or queued stages.** Pitch prep and After the meeting are two more steps in the deal room after Gate D, but they are not `StageKey` stages:
- No approval gate and no Cloud Tasks. Like the deck and the follow-up email, a person starts each one from a server action, and it costs one AI run against the daily cap.
- `opportunities/{id}/preps/{writeRunId}`: the pitch prep for one proposal, with `rev` for freshness, as the deck has.
- `opportunities/{id}/preps/{writeRunId}/attempts/{attemptId}`: practice answers and their feedback.
- `opportunities/{id}/meetings/{meetingId}`: the pasted notes, what they said and the next steps, one per meeting.

**D3. Pitch prep restates the proposal, and code supplies the facts.**
- Pro writes the opening line, the points to land, the likely questions with suggested answers, and the questions to ask. Every item names the proposal claims it restates, or for a question to ask, the research claim, gap or brief question behind it. Code drops items with no valid reference, and answers with an amount that isn't an approved price or the name of a private result.
- Code builds the numbers to know (price groups, needs met) and the gaps they'll probe (Cannot meet, partial matches, with the partner or alternative).
- Practice: Flash reads the question, the suggested answer, the claims and the person's answer, and returns a mark out of 10, what landed and what to add. Code then finds every amount in the answer and compares it with the approved price texts. A mismatch is flagged and caps the mark at 6, so the check never depends on the model.

**D4. Meeting notes: quotes checked word for word, steps checked against the hub.**
- One Pro call reads the notes with a catalogue of confirmed hub entities, each with a short reference: offerings and features, partners and what they cover, selling rules and scope limits, and the proposal's offerings. It never gets cost, buy prices or contacts' details.
- Every point carries a quote. Code keeps it only if the quote appears in the notes, ignoring case, spacing and punctuation, and counts what it dropped.
- Every step names the points it comes from, or it is dropped. Code resolves its hub references, and drops unknown ones. A supplier step with no partner reference says that no partner in the hub covers the ask. An approval step must name a selling rule, or a point about price or terms.
- Emails for client and supplier steps are short drafts. Code removes a sentence with an amount that isn't in the notes or the approved pricing. A supplier email goes to the partner contact recorded in the hub, added by code.
- Ticking a step off is a server action with an `update` audit event.

**D5. Example notes are built in code from the deal, not by a model.** Judges need notes to try, and the deal they open could be any deal. Code writes three styles (tidy notes, quick shorthand, a voice memo) from the deal's contact, proposal offerings, a gap outside scope with its partner, a selling rule or commercial ask, a demo request, a tender and dates relative to today. They cost nothing, read the same each time, and always exercise every step type. A plan made from them is marked as an example.
- *Added the same day:* practice works the same way. Each likely question offers a strong and a weak sample answer under a quiet Demo line, built by code from the prep: the suggested answer, and a vague one that promises a need outside scope and states 80% of the first approved amount, so the code check and the mark both show what they catch. The server rebuilds the samples and labels an attempt that matches one, rather than trusting the browser.

**D6. Logos are drawn in code.**
- Each sample company has a simple geometric mark as SVG in `lib/sample/logos.ts`, with its name as real text beside it, in its own colour. It resembles no real brand.
- PNG copies for the .pptx are generated once by a script and kept as base64 in the server code, because Google's conversion of SVG images in a .pptx isn't reliable.
- A company that isn't a sample gets a monogram from its initials.

## Consequences

- The deal room now runs from a lead to the next steps after the meeting. Every new step keeps the person deciding, and no email leaves without the person pressing Send.
- No new Google permission, so the consent screen and its verification status don't change.
- Three more AI-run uses (prep, each practice answer, each meeting) draw on the same daily cap. Practice may use the cap quickly; that is the trade-off for model feedback.
- The steps are advice, not tasks in another system. Sending them to a task tool is later work.
