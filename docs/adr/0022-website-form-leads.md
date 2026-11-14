---
status: accepted
date: 2026-11-14
deciders: FlowHub maintainers
---

# ADR-0022: Website form leads, through a Google Form the Gmail script makes and watches

Extends [ADR-0020](0020-gmail-inbox-leads.md): the same Apps Script, the same `/api/inbox` route and workspace key, the same triage pipeline. Keeps the no-Google-permission line of [ADR-0016](0016-after-the-proposal.md) D1 and the token rule of [ADR-0007](0007-google-docs-access.md). Product decision PRD Q34, requirements PRD 7.30. A Grand Finale item (4 Dec 2026).

## Context and problem statement

Gmail inbox leads (ADR-0020) turned the sales inbox into a source of deals. The other place a small seller's leads come from is the contact form on its website. The finale story is "every inbound channel lands in FlowHub", and the planned moment on stage is a judge scanning a QR code, filling the form on their phone, and seeing the lead reach Gate A in seconds.

That needs three things: a website for the demo seller, a form on it, and a way for each answer to reach FlowHub without a new Google permission on FlowHub's sign-in, without a stored Google token (invariant 12), and without a public write endpoint anyone could post to.

## Considered options

**Where the website lives:**

| | Firebase Hosting, a second site (chosen) | Google Sites | A page inside FlowHub |
|---|---|---|---|
| Convincing as a company site | Yes, its own design and address (`olvessa-cloud.web.app`) | A Sites template, `sites.google.com/view/…` | No, it is FlowHub's app |
| Versioned in the repo | Yes, `sites/olvessa/` | No | Yes |
| Cost | Free tier, same project and budget alert | Free | None |
| Google-hosted | Yes | Yes | Cloud Run |

**How the form reaches FlowHub:**

| | Google Form + the Gmail script's form trigger (chosen) | A form built into the site, posting to FlowHub | Google Form + responses Sheet read by FlowHub |
|---|---|---|---|
| FlowHub's exposure | The same keyed route as Gmail | A public write route with no key, to rate-limit and defend | A Sheets scope on FlowHub, or a stored token |
| Google permission on FlowHub | None | None | Sheets (sensitive) |
| Speed | Seconds: the trigger fires on submit | Seconds | A poll |
| Reproducible from the repo | Yes: `createLeadForm()` builds it | Yes | Partly |
| Spam handling | Google's form, plus FlowHub's checks | All FlowHub's | Google's form, plus FlowHub's checks |

## Decision

**D1. The site.** `sites/olvessa/` is plain HTML, CSS and a little JavaScript, no build. Firebase Hosting serves it as a second site, `olvessa-cloud`, in the project `flowhub-cup26`, on the free tier, covered by the project's budget alert. `firebase.json` declares it with `"site": "olvessa-cloud"` and headers: a Content Security Policy that allows scripts and styles from the site itself, Google Fonts, and frames from `docs.google.com` only; `noindex`; no cookies or tracking. The embed address lives in `sites/olvessa/config.js`, and the page frames it only if it is a `docs.google.com/forms/d/e/…/viewform?embedded=true` address. `npm run deploy:site` deploys only that site; `npm run site` serves it on the Hosting emulator. The footer says the company is fictional and links to FlowHub. The design was approved as a clickable mockup on 2026-11-14: its own dark look, not FlowHub's comic theme and not any real company's; no Google partner badge or claim.

**D2. The form, made by code.** `createLeadForm()` in the Gmail script asks FlowHub for `form-setup` (the form's title and the live offerings' names; nothing else of the catalogue, no price or cost) and creates the Google Form in the sales inbox's account, or updates the one it made before (`FORM_ID` in the script properties). Name, work email (required, validated as an email), company, company website (validated as a URL), the services as checkboxes named exactly after the live offerings, a start time, a message, and a required consent tick under Malaysia's Personal Data Protection Act 2010 with a short privacy line. It publishes the form, installs the trigger, stores `FORM_URL`, and logs the embed address. Running it again after the offerings change updates the checkboxes in place.

**D3. The trigger.** An installable `onFormSubmit` trigger (`ScriptApp.newTrigger('onLeadFormSubmit').forForm(form)`) sends each answer to `/api/inbox` as `{ action: "form", form }`, with the same workspace key. The manifest's only new scope is `forms`; the owner approves it once by running `createLeadForm()`. An answer FlowHub can't take (a cap, a deploy, a busy model) is queued by its response ID and retried by the one-minute check, up to five times; a 400 is final. `ping` reports `FORM_URL` and the script property `SITE_URL`, which FlowHub keeps only if they are https.

**D4. One inbox item, the same checks, three differences.** `triageForm` turns the answer into the same inbox item as an email (`source: "form"`, ID `wf_<responseId>`) and runs the same pipeline as ADR-0020 D3 to D6: one Flash call, quotes checked word for word, company, known deals, partners, selling rules, score and verdict in code, the daily limit of 30 shared with Gmail, the caps and the kill switch. The differences:
- **Ticked services map by code.** A ticked name counts only if it names a live offering exactly, ignoring case and spacing; anything else is dropped and counted. The model's own matches from the message are still checked and kept where no tick covers that offering.
- **Reasons quote the person's own words.** A reason must quote the message or the start time, not a field: "Services ticked: …" is not a need described in the person's words, and the ticks already count by code.
- **A thin message is never a clear lead.** Under 30 characters, the answer is at most a maybe, however many boxes are ticked.

The typed company counts like a company named in a signature (ADR-0020, amendment of 2026-11-12), checked word for word. The consent tick and a valid email are required by the route's Zod schema, so an answer without them is refused before anything is read or counted.

**D5. The deal.** A clear lead opens an opportunity with `intakeType: web_form` (code sets it; the model never picks it), `source: "From the website form: <company>"`, the person as contact, the ticked services as interests, and two inputs: the answers as text, and the company website as a URL, so intake reads it with URL context and research starts from it. FlowHub acts as "FlowHub from the website form" (`flowhub-form`), which, like "FlowHub from Gmail", can't approve a gate. A form answer can't be sent again, so a filed one has no "This is a lead".

**D6. The QR code.** Settings › Inbox shows a QR code to `SITE_URL` (or the form, without one), drawn on the server with the `qrcode` package (MIT, no network), and `/form-qr` prints it large without the hub's sidebar.

## Consequences

- A visitor's message reaches the inbox in seconds, and every reason shown rests on words the person typed. FlowHub still holds no Google token and asks for no new Google permission.
- The form belongs to the sales inbox's account, like the script; stopping it is deleting the trigger or closing the form.
- Anyone can fill the form. The Google Form, the required email and consent, the code checks, the daily limit and the caps bound what that costs; nothing past intake runs without a person at Gate A.
- The work email isn't verified: a visitor can type any address. Intake stops at Gate A, where a person confirms the prospect before research spends anything.
- The site's text is fixed in HTML. If Olvessa's offerings change, `createLeadForm()` updates the form, but the site's tiles are edited by hand.
- One new dependency in the web app (`qrcode`) and one new Hosting site; no paid service.
