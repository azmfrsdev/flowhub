---
status: accepted
date: 2026-09-29
deciders: FlowHub maintainers
---

# ADR-0007: Google Docs access for artefacts

## Context and problem statement

The Writer's artefacts are Google Docs created in the **user's own Drive**: the SME and enterprise proposal, the freelancer quote and the startup meeting pack (FR-WRI-1, FR-WRI-2, FR-WRI-10). A later stretch item adds Google Slides (C2).

Three things constrain how FlowHub gets permission to write there:

- **Judges arrive cold** on the deployed URL and must be able to finish a proposal in 5 minutes (G5). Anything that only works for pre-listed test users fails them.
- **Google's OAuth rules**, checked on 2026-09-29:
  - `drive.file` is a **non-sensitive** permission. It covers only files the app creates or the user opens with it, and it **needs no Google verification**.
  - An app left in **Testing** mode admits at most 100 listed test users, and its refresh tokens expire after 7 days.
  - An app that requests only non-sensitive permissions can be published to **Production** with one click, without a review.
- **FlowHub's own rules:**
  - Only the server calls agents, and the browser never writes to Firestore (invariants 9 and 10).
  - The budget is near zero.
  - The repo is public, so secret handling must be simple.

## Decision drivers

- **Any judge with a Google account can finish a proposal** without being added to a list.
- **The narrowest permission** (PRD section 11): the app sees only the files it creates.
- **No long-lived Google credentials stored** by FlowHub if that can be avoided.
- **Simple to build** in the remaining days, with a clear fallback when the user declines (FR-WRI-7).

## Considered options

### How FlowHub gets a Drive token

| Option | Pros | Cons |
|---|---|---|
| **A. Ask for `drive.file` only when needed, at Finalise.** Google Identity Services issues a short-lived access token in the browser. It's sent to a server action, used straight away, and never stored | No refresh tokens stored, so there are no Google credentials at rest. The permission is asked for in context ("to create your proposal in Drive"). After the first grant, later requests usually need no prompt | The Doc must be created while the user is present, which is fine because Finalise is a click. Nothing can update the Doc in the background later |
| B. Ask for `drive.file` offline at sign-in, and store an encrypted refresh token | Docs can be written or updated in the background | Stores long-lived credentials (encryption, rotation, revocation). The permission is asked for before its value is clear. More to build |
| C. A service account owns the Docs and shares them with the user | No user permission needed | Service accounts have no Drive storage of their own, and the alternative (a shared drive) needs a paid Workspace account. Personal Gmail users can't use it |
| D. No Drive: download a .docx only | Needs no permission at all | Loses "real Google Docs", which is a proposal claim and part of the Workspace story |

**Chosen: A,** with D kept as the Could-level fallback (PRD Q8).

### How the Doc is created

| Option | Pros | Cons |
|---|---|---|
| **A. Render `working` to clean HTML on the server, then create it with Drive `files.create`, converting it to a Google Doc** | One API call. Headings, paragraphs, lists, tables and links all convert. The HTML also drives the in-app preview, so there's one renderer | Less control over fine styling. Citations become a numbered "Sources" section rather than native footnotes |
| B. Build the Doc with the Docs API's `batchUpdate` requests | Full formatting control, including native footnotes | Many requests, index arithmetic, and a lot more code |

**Chosen: A.** One renderer (blocks → HTML) serves the in-app preview, the copy fallback and the Doc.

## Decision outcome

### Flow at Gate D (finalising)

1. The user presses **Finalise** (FR-WRI-6). The browser asks Google Identity Services for an access token with the permission `https://www.googleapis.com/auth/drive.file`.
   - The first time, Google shows its consent popup: *"See, edit, create and delete only the specific Google Drive files you use with this app."*
   - After that, the token is usually granted without a prompt.
2. The browser calls the **finalise server action** with the opportunity ID, the run ID and the access token. The token travels only over HTTPS, is never logged, and is never written anywhere.
3. The server action does five things:
   1. Checks the run is `waiting` and that no claim is still **Neither** (FR-WRI-5).
   2. Renders `working` to HTML: price placeholders filled from the approved fit output, and sources as a numbered list.
   3. Creates the Doc through Drive `files.create` (mime type `application/vnd.google-apps.document`) inside a **"FlowHub" folder**. The app creates the folder the first time and stores its ID on the user's profile.
   4. Stores `{ id, url }` in `working.doc` and `opportunity.latestDoc`, locks the run (`approved`), and sets the status to `proposing`.
   5. Writes an audit event (`generate`, with the Doc URL).
4. **If the user declines or closes the popup,** the run stays at Gate D. The artefact remains viewable and copyable in the app, and "Create in Google Docs" can be tried again (FR-WRI-7).

### Changes to earlier ADRs

**This amends ADR-0006:** `DocPublisher` runs in the **web app's finalise server action, not in the agent pipeline.** It's deterministic code that needs the user's token, and the user is present at that moment. The agents never hold a Google user credential. The rest of ADR-0006 is unchanged.

### Consent screen and OAuth client

- **One OAuth client** serves both Firebase Auth sign-in and the Drive token request: the web client Firebase creates, in the same project. The Cloud Run URL is added to its authorised JavaScript origins, and to Firebase Auth's authorised domains.
- **Consent screen:**
  - External user type.
  - The app name is "FlowHub", with a support email.
  - The home page and privacy policy URLs point at the app's `/` and `/privacy` pages (a new requirement, FR-WS-7).
  - The requested permissions are the basic sign-in ones (`openid`, `email`, `profile`) plus `drive.file`.
- **Publishing:** the consent screen is published to **Production** before the demo. No logo is uploaded, to avoid triggering brand verification.
- **Settings (FR-WS-6)** shows the Drive state as "Granted on <date>" or "Not granted", recorded when a token is issued, plus a **Revoke** action that calls Google Identity Services revoke.

### Later artefact types

Slides (C2) uses the same token flow. `drive.file` also covers creating a presentation through the Slides API. The deck is built with Slides API requests, because HTML can't be converted into Slides.

## Consequences

**Good**

- **Any Google account works,** with no test-user list and no 7-day expiry. That meets the judge requirement (G5).
- **No Google user credentials are ever stored.** A Firestore or log leak can't expose Drive access.
- **The narrowest possible permission,** asked for at the moment its purpose is obvious.
- **One HTML renderer** for the preview, the copy fallback and the Doc.

**Bad**

- **Docs can't be created or updated in the background.** Finalise needs the user present, which the PRD flow already assumes.
- **Citations in the Doc are a numbered Sources section, not native footnotes.**
- **Two small public pages are needed** (`/` and `/privacy`), plus the Production publish step on the consent screen.
- **Google Identity Services is a second client-side Google library** next to Firebase Auth. They share the same OAuth client, but need testing together.

## Confirmation

- An **end-to-end test on the deployed app with a Google account that isn't a test user,** after publishing to Production: sign in, finalise, and the Doc appears in "FlowHub" in that account's Drive.
- **Declining the popup** leaves the run at Gate D, with the preview and Copy working.
- **The finalise server action refuses** when a Neither claim is unresolved. No request, error or log line contains the token (checked in logs).

## More information

- **Amended 2026-10-15 (at build time):** the browser gets the `drive.file` token through **Firebase Auth's Google popup** (`reauthenticateWithPopup` with the `drive.file` scope added), not a separate Google Identity Services client.
  - It is the same OAuth client and the same authorised domains, so there is no second client-side library, and no JavaScript-origin change to the OAuth client.
  - Everything else holds: the token is short-lived, travels once to the finalise server action, and is never stored or logged.
  - The one change is to **Revoke** in Settings. Without a stored or in-hand token there is nothing for the app to revoke, so Settings links to the user's Google Account third-party connections instead.
  - The folder ID and grant date are kept on `users/{uid}` (`driveFolderId`, `driveGrantedAt`).
- PRD: FR-WRI-5 to FR-WRI-7, FR-WS-6, FR-WS-7 (new), Q8, and section 11 (security and privacy).
- ADR-0005 (the run lifecycle and `latestDoc`), and ADR-0006 (amended here on where `DocPublisher` runs).
- Sources checked on 2026-09-29:
  - Choose Google Drive API scopes (`drive.file` is non-sensitive): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
  - Requesting minimum scopes: https://support.google.com/cloud/answer/13807380
  - Manage app audience (Testing versus Production, test-user limits): https://support.google.com/cloud/answer/15549945
