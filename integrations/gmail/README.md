# FlowHub for Gmail

An Apps Script project that turns emails to a sales inbox in Gmail into leads in FlowHub (PRD 7.27, [ADR-0020](../../docs/adr/0020-gmail-inbox-leads.md)).

- Every minute it sends new inbox emails from outside the company to FlowHub, with the workspace key.
- It labels each thread with FlowHub's verdict: `FlowHub · Lead`, `FlowHub · Maybe`, `FlowHub · Not a lead`, or `FlowHub · <deal name>` for an email about a deal that's already open.
- It sends the meeting invites a person sends from a deal in FlowHub: it creates the event in this account's Google Calendar with Google Meet, and Calendar emails the guests (PRD 7.28, ADR-0020 D7).
- After such a meeting, it finds the meeting's notes in Google Drive and sends their text to FlowHub, which plans the next steps in step F (PRD 7.29, [ADR-0021](../../docs/adr/0021-meeting-notes-from-drive.md)).
- It can run the website's "Talk to <company>" Google Form: `createLeadForm()` makes it from FlowHub's live offerings, and each answer goes to FlowHub's inbox as it arrives (PRD 7.30, [ADR-0022](../../docs/adr/0022-website-form-leads.md)).
- As a Gmail add-on, the panel beside an open email shows the verdict, the score, the offerings it could need, and an **Open in FlowHub** link. **Send to FlowHub now** reads an email straight away, without waiting for the minute.

The script runs in the sales inbox's own Google account. FlowHub never gets a Google password or token, and FlowHub's own sign-in asks for no Gmail, Calendar, Drive or Forms permission.

## What it can do in the account

The manifest (`appsscript.json`) asks for these scopes, and no others:

| Scope | Why |
|---|---|
| `gmail.modify` | Read new inbox emails, create the FlowHub labels and put them on threads. It can't delete mail permanently. |
| `calendar.events` | Create the meeting events a person sends from FlowHub, with Google Meet, and email the guests. Read a past event's attached notes. |
| `drive.readonly` | Find a meeting's notes Doc and read it as text. It can't change, move, share or delete any file. |
| `forms` | Make and update the website's Google Form in this account, install its trigger, and read each answer when it arrives. |
| `gmail.addons.execute` | Run as a Gmail add-on. |
| `gmail.addons.current.message.metadata` | Know which email is open, for the panel. |
| `script.external_request` | Send emails and notes to FlowHub (`https://*.run.app`), and export a notes Doc as text through Drive (`https://www.googleapis.com/drive/v3/files/`). Both are set in `urlFetchWhitelist`. |
| `script.scriptapp` | Create the one-minute trigger and the form's trigger. |

## Setup, once (about five minutes)

Do this signed in to Chrome as the **sales inbox's Google account**, for example `sales@your-company`.

1. **Make a key in FlowHub.** Sign in to FlowHub as the workspace owner, open **Settings › Inbox** and choose **Make a key**. Copy it: FlowHub shows it once.
2. **Create the script.** Go to [script.google.com](https://script.google.com) › **New project**. Name it `FlowHub for Gmail`.
3. **Paste the code.**
   - Replace the contents of `Code.gs` with [`Code.gs`](Code.gs) from this folder.
   - In **Project Settings** (the gear), tick **Show "appsscript.json" manifest file in editor**. Back in the editor, replace `appsscript.json` with [`appsscript.json`](appsscript.json) from this folder.
   - If FlowHub runs somewhere other than `*.run.app`, add its address to `urlFetchWhitelist`.
4. **Add the settings.** In **Project Settings › Script properties**, add:
   - `FLOWHUB_URL`: FlowHub's address, such as `https://flowhub-xxxx.asia-southeast1.run.app` (no trailing slash).
   - `FLOWHUB_KEY`: the key from step 1.
5. **Start it.** In the editor, pick `start` in the function list and press **Run**. Google asks the account to allow the scopes above, once. The log ends with "Connected to … Checking … every minute." Settings › Inbox in FlowHub now says **Connected**.
6. **Add the panel to Gmail.** **Deploy › Test deployments › Install** (Application: Gmail). Reload Gmail and open any email: the FlowHub panel appears in the side bar on the right. The first time, Gmail may ask you to authorise the add-on.

A test deployment is for this account only, which is all a company's sales inbox needs. Publishing the add-on to the Workspace Marketplace isn't needed.

## Trying it

Send an email to the sales inbox from another address (not the inbox itself, and not from the company's own domain), for example:

> **Subject:** Moving our servers to Google Cloud: proposal and a call?
>
> We're a logistics company in Klang. We run about 140 virtual machines in our own data centre, and the lease on it ends in June 2027. We'd like to move to Google Cloud and need help with the landing zone and the migration itself. Could you send us a proposal, and could we have a call next week? The budget for this is approved for this financial year.
>
> Hafiz Rahman, Head of IT, Pelita Waris Logistics

Within a minute it's labelled `FlowHub · Lead`, appears in FlowHub's **Inbox** with its reasons and score, and its deal waits at Gate A. To skip the minute, open the email and press **Send to FlowHub now** in the panel.

## Limits

- At most 30 emails a day per workspace. Each counts as one AI run against FlowHub's daily cap, and FlowHub's kill switch stops it.
- Only emails in the inbox, from outside the company. If the inbox is on a free mail address (such as gmail.com), only the inbox's own emails are skipped.
- A sender on free mail (such as gmail.com) can still be a clear lead if the email names its company, for example in the signature. With no company named, it stays a maybe for a person.
- Meeting notes: one Doc per meeting, up to 20,000 characters, for three days after the meeting. Planning from them counts as one AI run.
- For a non-lead, FlowHub keeps the sender, subject, date and a one-line reason, never the text.
- A verdict changed in FlowHub isn't sent back to the Gmail label; the panel always shows the current one.

## Sending meeting invites

Once the script is connected, a deal's **Schedule the meeting** card (step E) shows **Send invite**. The person checks the agenda and the guests and presses it. Within a minute the script creates the event in this account's primary Calendar, with Google Meet, and Calendar emails the guests from this account. The card then shows the Meet link. If the script isn't connected, the card offers **Open in Google Calendar** instead.

## Meeting notes from Google Drive

After a meeting FlowHub sent the invite for, the script looks for its notes for three days, every five minutes while any meeting waits:

1. **A Google Doc attached to the Calendar event.** On Google Workspace plans, Gemini's **Take notes for me** in Meet attaches its notes there.
2. **A Doc in a Drive folder named `FlowHub notes`**, changed since the meeting started, with the client's name or the meeting title in its name (any case, punctuation ignored), such as `Pelita Waris Logistics notes`. This works on a personal Google account.

It reads the Doc as plain text (at most 20,000 characters) and sends it with the Doc's title and link. FlowHub keeps a meeting's notes once. In step F the plan shows **From Google Drive · <Doc title>**. If someone had already pasted notes for that meeting, FlowHub doesn't replace them: step F shows **Notes found in Drive** with **Use these**.

To try it, or on stage:
1. Send an invite from a deal's **Schedule the meeting** card, with a time a few minutes from now and a short length, and wait for **Sent**.
2. In this account's Google Drive, make a folder `FlowHub notes` (once) and a Google Doc in it named after the client, such as `Pelita Waris Logistics notes`. Type or paste a few lines of notes.
3. Once the meeting's end time has passed, run `findNotesNow` in the editor to skip the five minutes. The log says "Sent the notes … (planning)". Step F in FlowHub shows the next steps within about half a minute.

## The website form (from 2026-11-14)

The same script can run the "Talk to <company>" form on the seller's website (PRD 7.30, [ADR-0022](../../docs/adr/0022-website-form-leads.md)). It makes the Google Form in this account, with a checkbox for each live offering in FlowHub, named exactly as FlowHub names it. Each answer goes to FlowHub's inbox as it arrives, and FlowHub reads it like an email: a clear lead runs intake to Gate A.

1. **Update the script.** Replace `Code.gs` and `appsscript.json` with the versions in this folder. The manifest adds the `forms` scope.
2. **Make the form.** In the editor, pick `createLeadForm` and press **Run**. Google asks the account to allow Google Forms, once. The log shows:
   - the form's services, which are the workspace's live offerings,
   - `Form: https://docs.google.com/forms/d/e/…/viewform`,
   - `Embed address for the website …: …/viewform?embedded=true`,
   - and the edit link, to look at it in Google Forms.

   It also installs the form's trigger (`onLeadFormSubmit`). Run it again whenever the offerings change: it updates the same form's checkboxes and keeps its address.
3. **Put the form on the website.** Copy the embed address into `formEmbedUrl` in `sites/olvessa/config.js`, then deploy the site (see `sites/olvessa/README.md`).
4. **Tell FlowHub where the website is.** In **Project Settings › Script properties**, add `SITE_URL`, such as `https://olvessa-cloud.web.app`. On the next check, **Settings › Inbox** in FlowHub shows a QR code to it, and a printable QR page.

**Trying it:** open the website on a phone (or scan the QR code), fill in the form with a real-sounding need, and submit. The answer is in FlowHub's **Inbox** within seconds, tagged **Website form**. A clear lead is already at Gate A. The script's **Executions** list shows `onLeadFormSubmit` and FlowHub's verdict.

- An answer sent from this account's own address is skipped, like the inbox's own emails. Use another address to test.
- If FlowHub can't take an answer (a cap, a deploy), the one-minute check sends it again, up to five times. An answer FlowHub refuses as malformed isn't retried.
- Answers count towards the same 30 a day as emails.
- The form keeps its own copy of every answer in Google Forms, in this account. FlowHub keeps the answer only for a lead or a maybe; for a not a lead, only the sender, date and reason.

## Updating the script (for meeting notes, from 2026-11-13)

If the script was set up before meeting notes:
1. Replace `Code.gs` and `appsscript.json` with the versions in this folder. The manifest adds the `drive.readonly` scope and Drive's export address to `urlFetchWhitelist`.
2. Run `start` once in the editor. Google asks the account to allow Drive (read only), once. The log ends with "Connected to …".
3. Reload Gmail if the add-on panel is open.

## Updating the script (for invites, from 2026-11-12)

If the script was set up before meeting invites:
1. Replace `Code.gs` and `appsscript.json` with the versions in this folder. The manifest adds the Calendar advanced service and the `calendar.events` scope.
2. Run `start` once in the editor. Google asks the account to allow Calendar, once. The log ends with "Connected to …".
3. Reload Gmail if the add-on panel is open.

## Stopping or replacing the key

- **Stop:** run `stop` in the script, and remove the test deployment.
- **New key:** **Make a new key** in Settings › Inbox stops the old one at once. Paste the new key into `FLOWHUB_KEY`.
