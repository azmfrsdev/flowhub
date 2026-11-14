# Olvessa Cloud website

The website of **Olvessa Cloud**, FlowHub's fictional demo seller: a Google Cloud and data consultancy in Kuala Lumpur. It is a lead source for FlowHub (PRD 7.30, [ADR-0022](../../docs/adr/0022-website-form-leads.md)). Its "Talk to Olvessa" section embeds a Google Form that the FlowHub Gmail script makes and watches, and every answer lands in FlowHub's inbox within seconds.

Everything here is made up: the company, its people, clients and results. The footer says so.

- Plain HTML, CSS and a little JavaScript. No build, no cookies, no tracking.
- `index.html`: the page. The services are Olvessa's six live offerings in the sample catalogue (`web/src/lib/sample/olvessa.ts`), and the results are its public proof only.
- `styles.css`: its own dark look, not FlowHub's comic theme and not any real company's.
- `config.js`: `formEmbedUrl`, the Google Form's embed address, and `flowhubUrl` for the footer link.
- `main.js`: the hero's example tabs, and the form frame, which loads only a `docs.google.com/forms/d/e/…/viewform?embedded=true` address.
- Served by Firebase Hosting as the site `olvessa-cloud` in the project `flowhub-cup26` (`firebase.json`), with a Content Security Policy that allows frames from `docs.google.com` only. Free tier, under the project's budget alert.

## Commands (PowerShell, in `web/`)

The Firebase CLI runs through `npx` at a pinned version, so nothing needs installing beyond Node. Sign in once if this machine hasn't before: `npx firebase-tools@15.36.0 login`.

Run it locally on the Hosting emulator, at http://127.0.0.1:5050:

```bash
npm run site
```

Create the Hosting site, once:

```bash
npm run site:create
```

Deploy it to https://olvessa-cloud.web.app:

```bash
npm run deploy:site
```

`deploy:site` deploys only this site. It never touches FlowHub's Cloud Run service, Firestore rules or indexes.

## Connecting the form

1. In the FlowHub Gmail script, run `createLeadForm` (see `integrations/gmail/README.md`). Its log prints the embed address.
2. Paste it into `formEmbedUrl` in `config.js`, and deploy.
3. Set the script property `SITE_URL` to `https://olvessa-cloud.web.app`, so FlowHub's Settings › Inbox shows a QR code to the site.

Until `formEmbedUrl` is set, the form section says the form isn't connected yet and gives the sales inbox's address.
