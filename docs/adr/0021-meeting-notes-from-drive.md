---
status: accepted
date: 2026-11-13
deciders: FlowHub maintainers
---

# ADR-0021: Meeting notes from Google Drive, through the Gmail script

Builds on [ADR-0020](0020-gmail-inbox-leads.md) (the Gmail script, its workspace key, and D7, invites sent through it) and on step F of [ADR-0016](0016-after-the-proposal.md) (D4, next steps from pasted notes). Keeps the token rule of [ADR-0007](0007-google-docs-access.md) and the pipeline shape of [ADR-0010](0010-genai-workflow-in-typescript.md). Requirements PRD 7.29. A Grand Finale item (4 Dec 2026).

## Context and problem statement

The finale story is FlowHub working across Google's tools: an email in Gmail becomes a lead, research and the proposal land in Google Docs, and the meeting invite goes out from the sales inbox's Calendar with a Meet link. After the meeting, though, the salesperson still copies their notes and pastes them into step F. The maintainer asked for the loop to close: the notes come back from Drive on their own, and step F drafts the next steps.

The same two constraints as ADR-0020 apply:
- Reading Drive from FlowHub needs a Drive scope on FlowHub's own sign-in (`drive.readonly` is restricted), which brings Google's verification and the "unverified app" screen, on stage too.
- Watching for new notes from FlowHub needs a stored refresh token, which breaks invariant 12.

The Gmail script already runs in the sales inbox's own account, already knows each meeting FlowHub sent (the invite ID is the Calendar event's ID), and already calls FlowHub every minute with the workspace key.

## Considered options

| | The Gmail script finds the notes (chosen) | FlowHub reads Drive itself | The person pastes (today) |
|---|---|---|---|
| Google permission on FlowHub's sign-in | None new | `drive.readonly`: restricted, verification, "unverified app" | None |
| Google token in FlowHub | Never | Stored per workspace to poll (breaks invariant 12) | Never |
| Who approves Drive access | The sales inbox's owner, once, in their own script | Every user | Nobody |
| Delay after the notes Doc exists | Up to 5 minutes (or "findNotesNow" from the editor) | Seconds | Whenever the person gets to it |
| Work for the person | None | None | Copy and paste |

Where to put it in the repo:

| | New ADR-0021 (chosen) | A second amendment to ADR-0020 |
|---|---|---|
| Fits | A new Google scope, a new record, a new background job, a change to step F | ADR-0020 is about leads; D7 already stretched it to invites |
| Reading | One decision, one place | ADR-0020 becomes long and mixed |

## Decision

**D1. The script finds the Doc, inside Google.** `integrations/gmail/Code.gs`:
- `ping` and `triage` replies now also say how many meetings wait for notes. When some do, at most every five minutes, the script asks with `notes-wanted`. FlowHub lists sent invites whose meeting ended less than three days ago and that have no notes yet, with the meeting's ID, title, start, end and the prospect's name. No agenda, guests or prices.
- For each, the script looks in this order:
  1. **A Google Doc attached to the Calendar event** (`Calendar.Events.get(…).attachments`). Gemini's "Take notes for me" in Meet attaches its notes there on Workspace plans.
  2. **A Doc in a Drive folder named "FlowHub notes"**, changed since the meeting started, whose name holds the prospect's name or the meeting title (letters and digits, any case). The newest wins. This works on a personal Google account, and it is the demo path.
- It reads the Doc as plain text through Drive's export (`files/{id}/export?mimeType=text/plain`, with the script's own token), and sends at most 20,000 characters with `notes`: the invite ID, the Doc's title and link, and where it was found. It keeps a record of what it sent in its script properties. `findNotesNow()` runs the same search at once from the editor.
- **The script's new scope is `drive.readonly`,** and `https://www.googleapis.com/drive/v3/files/` joins its URL allowlist. It reads; it never changes, moves or shares a file. The owner approves it once, by running `start()` again.

**D2. FlowHub stores the notes once.** `notes` goes to `/api/inbox`, behind the same workspace key, as a new action rather than a new route: the key check, the 401s and the "no Google token" stance stay in one place.
- The body is checked with Zod: the ID must be in FlowHub's invite-ID alphabet, the link must be a `https://docs.google.com/document/d/…` link (code keeps nothing else), and the text is at most 20,000 characters after cleaning (control characters removed, blank runs collapsed).
- **The key decides the workspace, and the invite decides the deal** (invariant 7). The invite is read at `workspaces/{key's workspace}/invites/{id}`, so another workspace's meeting is "not found". Nothing in the body names a workspace or a deal.
- In one transaction: the invite must be sent and have no notes; the notes are stored at `opportunities/{opp}/driveNotes/{inviteId}`; the invite records `notesAt`, which stops the script looking; an audit event (`create`, `meeting-notes`) is written as "FlowHub from Drive". A second send is answered `duplicate` and changes nothing. Notes for a deal in the recycle bin are not kept.

**D3. Step F plans from them, as if pasted, and nothing is sent.**
- If no person has pasted notes for that meeting, FlowHub queues a `drive-notes` job (Cloud Tasks deployed, in-process locally, like a stage; ADR-0010 D2). The job reads the notes from Firestore and runs the same Planner as pasted notes (`planMeeting`): the same Pro call, the same checks in code (every quote found in the notes, steps with nothing behind them dropped, amounts only from the notes or the approved pricing, hub references checked), one AI run against the daily caps, stopped by the kill switch. Cost never reaches it (invariant 2); results not marked public stay out (invariant 5).
- The plan is a draft in step F. The emails it suggests are signed by the person who sent the invite and open in Gmail for a person to send, as before (FR-MEET-4). FlowHub sends nothing.
- The plan records its source: "From Google Drive · <Doc title>", linked, with when it arrived.
- **A person's notes are never replaced.** If a person pasted notes after the meeting started (not example notes, not earlier Drive notes), the Drive notes wait in step F as "Notes found in Drive" with **Use these**. Use these is a server action (Zod, `requireRole("editor")`) that marks the notes as planning in a transaction, so a second press plans nothing, then runs the same Planner as the person. Every plan is kept, newest first (FR-MEET-5).
- If planning can't run or fails (a cap, the kill switch, a model error), the notes show the reason and Use these.

**D4. A quiet waiting state.** From the moment an invite is sent until three days after the meeting, while no notes came, step F shows "Waiting for notes in Drive" with the folder name, and keeps **Paste notes** one click away.

## Consequences

- After a meeting FlowHub sent the invite for, the next steps appear in step F without anyone copying notes, and every point still rests on words the notes contain.
- FlowHub still holds no Google token and asks for no new Google permission. Drive access is the sales inbox owner's, given to a script they can read in the public repo.
- The script can read any Doc in that account's Drive. That is the owner's choice in their own account; the script only reads the meeting's Doc, and FlowHub only accepts a Doc link with the text.
- Up to five minutes' delay, plus the Planner's half a minute. On stage, `findNotesNow()` skips the wait.
- A Doc named after the prospect but about something else would be picked up. The person sees its title and link on the plan, and every point quotes it.
- The Apps Script consumer quota (90 minutes of triggers a day) is the tighter limit, which is why Drive is searched every five minutes at most and only while meetings wait.
- No new paid service, no new Firestore composite index (the query is one equality filter on `status`).
