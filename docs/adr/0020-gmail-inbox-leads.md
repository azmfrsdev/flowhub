---
status: accepted
date: 2026-11-12
deciders: FlowHub maintainers
---

# ADR-0020: Gmail inbox leads, through an Apps Script in the seller's own account

Adds a pipeline under [ADR-0010](0010-genai-workflow-in-typescript.md), next to the news scout ([ADR-0014](0014-news-scout.md)). Keeps the no-Gmail-permission line of [ADR-0016](0016-after-the-proposal.md) D1 and the token rule of [ADR-0007](0007-google-docs-access.md). Product decision PRD Q32, requirements PRD 7.27. A Grand Finale item (4 Dec 2026).

## Context and problem statement

Most leads reach a small seller as an email to a sales inbox, usually in Gmail. FlowHub starts a deal from a pasted email, a meeting invite, a URL, a tender or the news, but someone has to notice the email and paste it. The maintainer asked for an email to the sales inbox to become a lead in FlowHub on its own: Gemini judges it, code checks the judgement, a clear lead goes through intake, and a person picks it up at Gate A. It also shows FlowHub working inside the Google ecosystem, which the finale judges look for.

Two constraints decide the design:
- **Reading Gmail through the API needs a restricted scope** (`gmail.readonly` or `gmail.modify`). For a public app, Google requires verification and a yearly third-party security assessment for that. Until then every user sees the unverified-app screen, and the sign-in screen gains a Gmail permission it doesn't need for anything else.
- **Polling Gmail from FlowHub needs a stored refresh token,** which breaks invariant 12: Google user tokens are never stored.

## Considered options

| | Apps Script in the seller's account (chosen) | Gmail API from FlowHub | Forwarding rule to a FlowHub address |
|---|---|---|---|
| Google permission on FlowHub's sign-in | None new | A restricted scope, verification and a security assessment | None |
| Google token in FlowHub | Never | A refresh token stored per workspace (breaks invariant 12) | Never |
| How fast | Every minute, or at once from the Gmail panel | Seconds, with Pub/Sub push and a weekly watch renewal | Seconds, but needs an inbound mail service, which costs money |
| Labels and a panel in Gmail | Yes, from the same project | Labels yes; a panel needs an add-on anyway | No |
| Setup | About five minutes, once, in the inbox's own account | One consent click, after Google's review | A forwarding rule, with Gmail's confirmation email |

## Decision

**D1. A Gmail script holds Gmail access, inside Google.** An Apps Script project (`integrations/gmail/`), installed in the sales inbox's own Google account, does three things:
- Every minute, it sends new inbox emails from outside the company to `POST /api/inbox`: sender, subject, plain-text body (at most 20,000 characters) and Gmail's message and thread IDs.
- It labels each thread with FlowHub's verdict: `FlowHub · Lead`, `FlowHub · Maybe`, `FlowHub · Not a lead`, or `FlowHub · <deal name>`.
- As a Gmail add-on (a test deployment in that account), the panel beside an open email shows the verdict, score, matched offerings and an "Open in FlowHub" link, with "Send to FlowHub now" for an email not read yet.

Its manifest asks for `gmail.modify` (read and label; no permanent delete), the two add-on scopes, `script.external_request` (to `*.run.app` only) and `script.scriptapp` (the trigger). The consent is the inbox owner's, given to their own script; FlowHub's sign-in screen and consent status don't change.

**D2. The first write path without a signed-in person: a workspace key.**
- Settings › Inbox (Owner only) makes a key: `fhk_` and 32 random bytes. FlowHub shows it once and stores only its SHA-256, in `inboxKeys/{hash}` (server only, as every top-level collection is) and on the workspace. "Make a new key" deletes the old hash in the same transaction, so the old key stops at once.
- `/api/inbox` reads `Authorization: Bearer fhk_…`, refuses a malformed key before touching Firestore, looks up the hash, and checks the workspace still names that hash and isn't deleted. **The key alone decides the workspace** (invariant 7); nothing in the email does.
- It is a route handler, not a server action, because the caller isn't a browser session. It still validates its body with Zod, writes only through the Admin SDK, and records an audit event for every email read. The browser still never writes to Firestore (invariant 10).
- Actions: `ping` (the script is running, in which mailbox), `triage` (one email) and `status` (the verdict for the Gmail panel). Answers carry the verdict, a one-line summary, offering names and links; never the body, a price or a cost.

**D3. One Flash call reads; code decides.** `web/src/server/pipelines/inbox.ts`, prompt `inbox-triage.md`:
- Flash, with structured output, returns a verdict (lead, maybe, existing deal, not a lead), a one-line summary, the company as the email writes it, up to six reasons each with a quote from the email, and catalogue references. The catalogue is live offerings and active features by name and summary: no prices, no cost, nothing restricted (invariants 2 and 7).
- Code keeps a reason only if its quote appears in the email word for word (ignoring case, spacing, quote and dash styles), as a proposed price must in Ask or tell (invariant 6). Dropped reasons are counted and shown.
- The company comes from the sender's domain. A free-mail address gives "company unknown". The model's company name is used only if the email writes it.
- An offering counts only if it is live; unknown, retired, deleted and planned references are dropped.
- Known deals: the same Gmail thread as an email already linked to a deal, the same contact address, or the same company domain as a deal's website or contact. Free mail never matches on domain alone. A partner recorded in the hub, matched by its contacts' domain, is never a lead.
- Company-wide selling rules (`checkSellingRules`) run on the email, the company and the country of a country domain (`.my`, `.sg`, `.co.th`).
- **The score is calculated in code,** out of 100: 10 for each live offering matched (at most 4), 20 for a request (proposal, quote, meeting), 10 each for a need, a deadline and a budget, each counted only from a kept quote, and 10 for a company address.
- **Code only lowers Gemini's verdict.** A lead needs Gemini's "lead", a score of 70 or more, a company address, a live offering and no broken selling rule; otherwise it is a maybe. A known deal is an existing deal unless Gemini read the email as no lead at all.

**D4. A clear lead runs intake on its own, and stops at Gate A.**
- A clear lead creates an opportunity (`intakeType: client_email`, `source: "From Gmail: <subject>"`, `inboxItemId`, the sender as the contact, matched offerings as interests) and starts intake through the normal `startStage`, so caps, the kill switch and Cloud Tasks apply as for any stage.
- FlowHub acts as a fixed actor, "FlowHub from Gmail" (`flowhub-gmail`), in the run, the opportunity and the audit trail. It can't approve a gate: gates are server actions that need a signed-in member.
- A maybe, or a lead when Settings › Inbox turns automatic intake off, waits for a person: "Open a deal" or "Not a lead". "Not a lead" on a deal FlowHub opened moves that deal to the recycle bin.
- An existing deal is linked to that deal and listed in its deal room under "Emails from Gmail". No new deal opens.

**D5. Keep as little as possible.** An inbox item lives at `workspaces/{ws}/inbox/gm_{messageId}`, which also makes a second send of the same email return the first result without another model call. For a non-lead it keeps the sender, subject, date and the one-line reason, never the body. "Not a lead" from a person removes the body too. A wrong "Not a lead" can be undone with "This is a lead": the item waits, and the next send from Gmail ("Send to FlowHub now") reads it again and never files it as not a lead.

**D6. Bounded cost.** At most 30 emails per workspace per day, counted in the same transaction as the AI run, which counts against the workspace and global caps (FR-CAP-1, FR-CAP-3). The kill switch stops it. The script sends at most 10 emails a check and gives up on an email after three failed tries. One Flash call per email, about 3 to 5 seconds; no grounding, no Pro.

## Consequences

- Opportunities can now start from the sales inbox with no one pasting anything, and every reason shown rests on words the email contains.
- FlowHub still holds no Google token and asks for no new Google permission. Gmail access is the inbox owner's, given to a script they can read in the public repo and stop at any time.
- The key is a bearer secret. Anyone holding it can send emails into that workspace, bounded by the daily limit and caps. It lives only in the script's properties, and making a new key revokes it.
- A minute's delay is the trade-off for no Pub/Sub topic, watch renewal or second route. On stage, "Send to FlowHub now" skips it.
- A verdict changed in FlowHub isn't written back to the Gmail label; the Gmail panel always shows the current one.
- The add-on runs as a test deployment in one account. Offering it to other companies would need a Workspace Marketplace listing, which is later work.

## Amendment, 2026-11-12: a company named in a free-mail email counts

Many small firms in Malaysia sell and buy from free-mail addresses, so "company unknown" for every free-mail sender missed real leads. It also meant the stage demo, sent from a Gmail address, could never show a clear lead. Changes to D3:

- **Company:** from free mail, the company is the one the email names (for example in the signature), kept only if the name appears in the email word for word. With no name written, it stays "company unknown". A company address works as before.
- **Score:** a company address still gives 10. Free mail with the company named gives 5. Free mail with none gives 0.
- **Verdict:** a lead needs a known company (a company address, or a company the email names) instead of a company address. The other conditions are unchanged.
- **Unchanged:** free mail still never matches a known deal on its domain, only on the exact contact address.

Considered and rejected: an allowlist of test senders in Settings (a demo-only bypass of a check), and keeping the rule with a person's click on stage (it still misses real small-firm leads).

A free-mail sender can claim any company. That is accepted because intake stops at Gate A, where a person confirms the prospect before research spends anything. A free-mail email gives no country, so a region rule can't catch it here; fit checks it again after Gate A.

## Amendment, 2026-11-12: the script also sends meeting invites (D7)

The maintainer asked for the meeting invite to be sent from FlowHub, from the sales inbox (`flowhub.my@gmail.com`), rather than opened in Google Calendar and sent by whoever is signed in (PRD 7.28, FR-CAL-6 to FR-CAL-8; it builds on [ADR-0016](0016-after-the-proposal.md) D7).

| | FlowHub asks for Calendar access | The Gmail script sends it (chosen) |
|---|---|---|
| Google permission | `calendar.events` in FlowHub's sign-in, a sensitive scope: "Google hasn't verified this app" for every user, on stage too | The script's own manifest. Only the sales inbox's owner approves it, once |
| Sent from | Whoever signs in to FlowHub | Always the sales inbox |
| Google token in FlowHub | A short-lived one, for each send | None (invariant 12 unchanged) |
| Delay | None | Up to a minute, the script's check |
| Needs | Nothing more | The Gmail script connected |

**D7. Meeting invites go through the Gmail script.**
- **FlowHub queues.** "Send invite" in step E is a server action (Zod, `requireRole("editor")`, a `send` audit event). It builds the title and the agenda again on the server, with the same functions as the card's preview, so the browser's text is never trusted, and writes `workspaces/{ws}/invites/{id}` as `queued`. It also sets the deal's Next meeting. At most 20 invites per workspace per day. Only when the script checked in within the last 15 minutes; otherwise the card offers "Open in Google Calendar" (ADR-0016 D7).
- **The script sends.** `ping` and `triage` replies say how many invites wait. When some do, the script asks with `invites`; FlowHub hands over up to five, marked `sending`. For each, the script creates the event in the account's primary Calendar with Google Meet (`conferenceDataVersion: 1`) and `sendUpdates: "all"`, so Calendar emails the guests. It reports with `invite-result`: sent, with the event and Meet links, or the error.
- **No duplicates.** The invite ID is drawn from Calendar's event-ID alphabet and used as the event's ID. A retry after a lost reply gets "already exists" and reads that event instead of making another.
- **Retries.** An invite taken but not confirmed within 10 minutes is offered again. After three tries it is marked failed, with the error, for a person to see on the card.
- **What FlowHub keeps.** The invite's title, agenda, time, guests and status, and only links on `calendar.google.com` and `meet.google.com`. The card shows the status and the Meet link live, through Firestore listeners (invariant 9).
- **The script's new scope.** `calendar.events`, and the Calendar advanced service. The owner updates the script and approves the new scope once, by running `start()` again.

Consequences: the invite comes from the sales inbox with a Meet link, and FlowHub still holds no Google token. The trade-off is a delay of up to a minute, and dependence on the script. The Calendar link stays as the fallback.
