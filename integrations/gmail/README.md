# FlowHub for Gmail

An Apps Script project that turns emails to a sales inbox in Gmail into leads in FlowHub (PRD 7.27, [ADR-0020](../../docs/adr/0020-gmail-inbox-leads.md)).

- Every minute it sends new inbox emails from outside the company to FlowHub, with the workspace key.
- It labels each thread with FlowHub's verdict: `FlowHub · Lead`, `FlowHub · Maybe`, `FlowHub · Not a lead`, or `FlowHub · <deal name>` for an email about a deal that's already open.
- As a Gmail add-on, the panel beside an open email shows the verdict, the score, the offerings it could need, and an **Open in FlowHub** link. **Send to FlowHub now** reads an email straight away, without waiting for the minute.

The script runs in the sales inbox's own Google account. FlowHub never gets a Google password or token, and FlowHub's own sign-in asks for no Gmail permission.

## What it can do in the account

The manifest (`appsscript.json`) asks for these scopes, and no others:

| Scope | Why |
|---|---|
| `gmail.modify` | Read new inbox emails, create the FlowHub labels and put them on threads. It can't delete mail permanently. |
| `gmail.addons.execute` | Run as a Gmail add-on. |
| `gmail.addons.current.message.metadata` | Know which email is open, for the panel. |
| `script.external_request` | Send emails to FlowHub (`https://*.run.app` only, set in `urlFetchWhitelist`). |
| `script.scriptapp` | Create the one-minute trigger. |

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
- For a non-lead, FlowHub keeps the sender, subject, date and a one-line reason, never the text.
- A verdict changed in FlowHub isn't sent back to the Gmail label; the panel always shows the current one.

## Stopping or replacing the key

- **Stop:** run `stop` in the script, and remove the test deployment.
- **New key:** **Make a new key** in Settings › Inbox stops the old one at once. Paste the new key into `FLOWHUB_KEY`.
