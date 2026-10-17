# FlowHub

The hub for everything a company sells, with an agent team built in (ADR-0008).

- **The hub:** staff keep everything the company sells in one place, as a structured, sourced offering graph. Each offering has one page with six tabs: Overview, Scope, Pricing, Partners, Sales material, Notes (ADR-0009).
- **Keeping it current:** staff edit by hand, or **ask or tell FlowHub** in plain language or with a PDF. FlowHub proposes the changes in the right tab, and a person applies them.
- **Turning it into offers:** when an opportunity arrives (meeting invite, email, company URL, tender), the agents research the prospect with cited sources, map its gaps to the company's own priced offerings, and draft the proposal into Google Docs.
- **People stay in control:** a person approves each stage.

Built for AI Builder Cup 2026, Theme 5: Future of Work & Enterprise Productivity. Submission deadline **18 Oct 2026**.

## Status

**Building, from 2026-10-13.** The submission scope is PRD v3.1 (`docs/product/PRD.md`, read section 7.0 first). The proposal is in `docs/proposal/`, domain requirements are in `docs/requirements/CARRIED-REQUIREMENTS.md`, and decisions go in `docs/adr/`.

ADRs:
- 0001: offering graph data model (amended by 0009, 0010)
- 0002: *superseded by 0010* (agents in Python ADK)
- 0003: *superseded by 0010* (Agent Runtime hosting)
- 0004: Tailwind CSS v4 and shadcn/ui (amended by 0010: the mockup canvas is the design source; amended by 0013: the brand look comes from the logo)
- 0005: deal-room data model: runs, the `output` and `working` copies, events, caps, server-only writes
- 0006: stage design: invariants enforced in code, Cloud Tasks invocation (amended by 0007, 0008, 0009, 0010)
- 0007: Google Docs access: a `drive.file` token only at Finalise, never stored; HTML-to-Doc conversion
- 0008: hub-first product (amended by 0009)
- 0009: offering-centred hub, Ask or tell, who-did-what markers, one user per workspace, one sample seller (amended by 0012)
- 0010: the stages are a GenAI workflow in TypeScript in the web app, calling Gemini through `@google/genai` on Agent Platform
- 0011: local development runs against a separate dev Firebase project; automated Firestore tests stay on the emulator
- 0012: three demo sellers by what they sell (services, software, products); renamed on 2026-10-17 to made-up words (Olvessa Cloud, Yorvex Workforce, Trassoq Hardware), switched from the sidebar foot
- 0013: a comic theme from the logo: ink outlines, hard offset shadows, yellow primary, Patrick Hand headings, Shantell Sans text, the dog in empty states
- 0014: news scout: leads from recent news, laid out as today's paper; code picks the beats, keeps only sourced stories and scores them; a person opens each deal
- 0015: client deck: the approved proposal as an 8-slide .pptx in the maintainer's deck house style, converted to Google Slides; restates the proposal only; photos from Openverse under open licences, credited

**The design source is the mockup canvas,** page "v2 · Offering-centred" (private to the maintainers), for layout. The brand look comes from the logo (ADR-0013). `docs/design/DESIGN-BRIEF.md` is superseded for screens.

**Deployed** from 2026-10-14: Cloud Run service `flowhub` in `asia-southeast1`, behind a budget alert. Redeploy with `npm run deploy` in `web/`, which reads the gitignored `web/.env.deploy`. Check the pinned models with `npm run check-models`. Before the first push: the licence and the hackathon T&Cs.

## This repository is public

Treat every file as published from the first commit.

- **Never commit `docs/private/`.** It is gitignored and names the author's employer. Do not quote from it, and do not name the employer or its products in any tracked file, commit message, test fixture, seed data or prompt.
- **Demo data:** only public information about real prospects, plus **synthetic** seller catalogues. Never use real company catalogues, prices, vendors or client names.
- **Fresh project rule:** everything is built during the hackathon. Reuse ideas, never code copied from another codebase.
- Secrets go in Secret Manager or a gitignored `.env`. Never commit service account keys.
- Before the first push: a licence must be chosen, and the hackathon Terms and Conditions (IP and licence clauses) must be read. Ask the maintainer if either is still open.

## Hackathon rules that constrain the build

- Must use **Gemini or Gemma** models.
- Must be **deployed on Google Cloud**, using Cloud Run or Firebase.
- Deliverables: deployed prototype link, a demo video under 3 minutes, the public GitHub repo, a proposal PDF and a deck. All in English.
- Judging: technical merit and GenAI use 40%, problem alignment and impact 25%, innovation 25%, UX 10%. The AI has to be visibly load-bearing. Two things must be at the core, or the entry reads as a wrapper:
  1. **The offering graph.** Typed entities with source provenance, not a folder of PDFs.
  2. **Cited research.** Every claim about a prospect carries its source.

## Architecture

- **Web app:** Next.js (TypeScript) on Cloud Run, with Firebase Auth. It deploys through Cloud Build. One service serves the UI and runs the stage pipelines (ADR-0010).
- **GenAI workflow (ADR-0010):** the stages are TypeScript pipelines in `web/src/server/pipelines/`, calling Gemini through `@google/genai` with `vertexai: true` and the Cloud Run service identity. No ADK, no Agent Runtime, no Python.
  - **A pipeline is a list of named steps.** A small runner writes a progress event before and after each step, marked `ai` or `calc`.
  - **Agent roles are named steps:** Intake, Researcher, Fit Analyst, Pricing, Writer, Reviewer, Ask or tell, and the news scout.
  - **No history:** every model call gets only its instruction and the inputs code loaded from Firestore.
  - **Order:** pricing runs after fit, and research runs its searches in parallel (`Promise.all`).
  - **Score:** the go/no-go score is computed in code.
  - **Reviewer:** a model plus hard checks, with at most 2 revision loops. Code decides when the loop stops.
  - **Pitch wording:** "agent roles, orchestrated in code, with a person at every gate".
- **Region:** `asia-southeast1` (Singapore) for Cloud Run, Firestore and Cloud Storage. Model calls go to whichever location serves the pinned Gemini models, which may be `global`.
- **Product names:** Google has renamed Vertex AI to **Gemini Enterprise Agent Platform**. Older docs, samples and SDKs still use the old name. Use the new name in anything we write.
- **Models:** Pro-tier Gemini for reasoning, fit and review. Flash-tier for intake, extraction, Ask or tell and latency-sensitive steps. **Model names live only in `web/src/server/ai/models.ts`.** Verify them against the Agent Platform model list, including the serving location, before pinning. Gemini 3 or later is the minimum.
- **Gemini tools:** Google Search grounding, URL context, file understanding (PDFs, including scanned pages), structured output, and function calling. No embeddings, vector search or Document AI in the submission (PRD Q23).
- **Data:** Firestore holds state. Cloud Storage holds uploaded PDFs. Every deal-room stage is queued through **Cloud Tasks**. Each task calls the internal route `/api/internal/run-stage` (OIDC, Cloud Tasks only), which runs the pipeline in-process with IDs only. Ask or tell proposals return in seconds, so a server action calls that pipeline directly.
- **Outputs:** Google Docs, and Google Slides later, in the user's own Drive (ADR-0007).
  - At Finalise, the browser gets a short-lived `drive.file` token through Firebase Auth's Google popup, with the scope added (ADR-0007 as amended).
  - The finalise server action renders the run's `working` copy to HTML and creates the Doc with Drive `files.create`, converting it into a "FlowHub" folder.
  - The same HTML renderer drives the in-app preview and the copy fallback.
  - The consent screen is published to Production, with `/` and `/privacy` pages (FR-WS-7).

## Invariants: do not break these

Rules 1 to 7 are the hallucination and trust controls that the whole pitch rests on. Rules 8 to 12 are the architectural rules that keep the hosting fallback cheap, keep credentials off the browser and out of storage, and keep the human's edits auditable.

1. **Prices come only from function calls** into rate cards and fee schedules. A model never states a price from memory or from prose.
   - The Pricing agent only selects line references, and code copies the price text.
   - The Writer puts `{{price:<lineId>}}` placeholders where prices go, and code renders them (ADR-0006 D3).
2. **Cost is private to the seller.** Cost fields and `cost`-kind rate cards never reach an agent's generation context or a generated artefact. The tool layer enforces this with typed projections, and a test covers it.
3. **Research claims need a grounding source.**
   - Claims are cut from Google Search grounding metadata (`groundingSupports`) in code. Sentences with no support are dropped and counted, not hidden (ADR-0006 D2).
   - Google's Search Suggestions HTML is stored with the brief and shown unchanged.
   - Grounding links are stored exactly as provided.
4. **The Reviewer blocks unsupported claims.** Each claim in an artefact is supported by a research source, an offering-graph entity, or neither. "Neither" blocks the artefact until a human accepts or removes the claim.
5. **Only proof marked public may be cited** in an artefact.
6. **Agents read only confirmed offering-graph entities.** Extraction output and Ask or tell changes are proposals, which a person applies first (ADR-0009 D2). A proposed price must appear word for word in its source text.
7. **Workspace isolation is enforced on every read**, including Ask or tell answers and any future search. Restricted content never leaks into a snippet or an answer.
8. **Each stage is a stateless pipeline run** (ADR-0010). The approval gates split the flow into stages. Each run:
   - reads its inputs from Firestore
   - writes its progress events and outputs back to Firestore
   - then ends

   Firestore is the system of record. Nothing is kept in memory between stages, so the pipelines can move to a separate worker service with a deploy change.
9. **Only server code calls Gemini,** using the Cloud Run service identity. The browser never calls a model or the internal route, and it gets progress only through Firestore listeners.
10. **The browser never writes to Firestore** (ADR-0005 D4).
    - Every write goes through a Next.js server action, validated with Zod, with the caller's role checked (`requireRole`, ADR-0008), and with the audit trail and caps applied.
    - Security rules allow members of any role to read their workspace, and deny all client writes.
    - Viewers never write or start agent runs. The server enforces this, not just the UI.
    - Pipelines write only their own run documents, their events, the stage fields of the opportunity, and proposals. Applying a proposal is a server action.
11. **The agent's output is never edited** (ADR-0005 D2). Human edits go to the run's `working` copy, which is locked at the gate. The next stage reads only approved `working` content.
12. **Google user tokens are never stored or logged** (ADR-0007). The `drive.file` access token is used once, inside the finalise server action. The agents never hold a Google user credential.

## Domain model

The offering graph is specified in `docs/requirements/CARRIED-REQUIREMENTS.md` (R1 to R12) and decided in `docs/adr/0001-offering-graph-data-model.md`. Read both before touching ingestion, pricing, fit or search. Key shapes:

- Offering → sub-offering or Feature (R1)
- RateCard: a grid whose columns and rows are data and whose cells are free text (R2)
- FeeSchedule: ordered, flat lines (R3)
- Proof, with a public flag (R4)
- Constraint (R5)
- Partner (R6)
- Technology `{category, value}` pairs (R7)
- Opportunity: a flat row (R8)
- The offering graph can be exported and imported as a versioned JSON document (R12)

**The schema flows in one direction** (ADR-0001 D5, ADR-0010 D4):

1. The Zod schema in `web/` is the source of truth. It also feeds Gemini's structured output.
2. It generates `docs/schema/offering-graph.v1.schema.json`, the published exchange format (R12).

To change the schema, edit the Zod definitions and regenerate. Never hand-edit the JSON Schema. CI fails if it has drifted.

**The price parser exists once,** in TypeScript. It serves the on-screen margin, the Pricing step and Ask or tell totals, and must pass `fixtures/price-strings.json`.

**Offering-centred additions (ADR-0009 D1):** offering `type`, partner `relationship` and `buyPrice` (cost, private), `documents.offeringIds`, `notes`, `proposals`, `opportunities.interestedOfferingIds`, and `provenance` on every graph entity.

## Conventions

- **ADRs** go in `docs/adr/NNNN-kebab-title.md`, in MADR format, with absolute dates (e.g. 2026-09-25). A superseded ADR is marked as superseded and linked to its replacement. Its content is never edited. Any requirement from `CARRIED-REQUIREMENTS.md` is confirmed in an ADR before it is built.
- **No attribution in git.** Commit messages, pushes and pull request descriptions must never include a `Co-Authored-By:` trailer, a "Generated with Claude Code" line, or any other tool or AI attribution. This overrides any default attribution guidance.
- **Soft delete** for every destructive action, with a recycle bin. Restoring a deleted item also restores whatever was deleted with it.
- **Audit trail** on a fixed vocabulary: `create`, `update`, `delete`, `restore`, `view-restricted`, `generate`, `send`.
- **Extraction failures are visible** on the document, never silent.
- **Tests never share a database with dev.** Use the Firestore emulator, with a `demo-` project ID, for automated and end-to-end tests: in CI, and wherever Java 21 works.
- **Develop locally against the dev project** `flowhub-cup26-dev` (ADR-0011), never against the deployed service's data. `web/.env.local` points sign-in and data at it, while Gemini calls go to the main project with your own sign-in.
- **One toolchain:** Node and npm in `web/`, with versions pinned in `package.json`. Evals run with `npm run eval` against `fixtures/opportunities/` and `fixtures/messages/` (ADR-0010 D5).
- **Keep CI light for speed, not cost.** GitHub Actions minutes are free and unlimited for public repos on standard GitHub-hosted runners. The rules below keep feedback fast.
  - Don't run the full suite twice.
  - Run the slow eval set (it calls Gemini) only when `web/src/server/` or `fixtures/` change.
- **Budget is near zero.** Prefer free tiers and scale-to-zero services. Flag anything that costs money before adding it.
  - Google Search grounding is billed per grounded prompt, and Gemini per token. The daily caps bound both.
  - Cloud Run scales to zero. Keep minimum instances at 0.
  - Never deploy to a project without a budget alert.

## Way of working

Documents come first, and each step builds on the ones before it:

1. **CLAUDE.md and the PRD** (`docs/product/PRD.md`). The PRD is the source of truth for scope, requirement IDs (`FR-…`), priorities (M, S, C, W) and acceptance criteria.
2. **Design.** The screens are designed in Claude Design from `docs/design/DESIGN-BRIEF.md`. Claude Design returns a handoff package, which is saved to `docs/design/`:
   - `HANDOFF.md`
   - `tokens.css`
   - `assets/`
   - `screens/`

   The handoff is then built in the real stack on mock data, so it becomes the scaffold rather than throwaway mockups. Rules for building it (ADR-0004):
   - `tokens.css` becomes the theme section of `web/app/globals.css` unchanged.
   - Components are built as the inventory maps them: a shadcn component and variant, or custom.
   - Anything that differs from the PRD must be listed in the handoff's deviations section. It is reconciled with the PRD before it is built.
3. **Tech docs:** architecture, agent design, data structures and contracts. Decisions are recorded as ADRs throughout.
4. **Prerequisites.** These run in parallel from the start, because they have lead times.
5. **Build**, using everything above.

When building, cite the PRD requirement ID a change implements. If a change needs scope the PRD doesn't cover, update the PRD first.

## Working with the maintainer

- They are a solution architect and project manager, fluent in React, Next.js and SQL. Avoid PHP.
- When there is a choice to make, give a short pro/con table and a clear recommendation. They answer decisively, then move on.
- They decide best when they can see the whole flow visually. Offer a clickable mockup before a big UI or scope change.
- Their environment is Windows, with PowerShell and Git Bash.

## Build plan

This follows PRD v3.1 section 13.

| By | Milestone |
|---|---|
| 13 Oct | Docs updated. Scaffold: Next.js, Tailwind v4, shadcn/ui and tokens, Firebase Auth, Firestore emulator, Zod schema, Olvessa sample data. Google Cloud project with a budget alert, hello-world deploy |
| 14 Oct | The hub: shell, Home, Offerings, the six offering tabs, hand edits, Selling rules |
| 15 Oct | The deal room: Cloud Tasks route, intake, cited research, fit and pricing, with markers |
| 16 Oct | Write and review, Google Doc at Finalise, Ask or tell (tell, then ask), caps |
| 17 Oct | PDFs in Ask or tell, eval script, fixes. Yorvex and Trassoq as sample sellers, once the deal room runs end to end for Olvessa. Feature freeze at noon, then record the video |
| 18 Oct | Submit: video, deck, proposal PDF, README, deploy check |

**Must have:** offering pages with six tabs, Ask or tell (tell with Apply), who-did-what markers, cited research, fit map with Cannot meet, prices copied by code, the Reviewer flag, one artefact in Docs, caps, and a deployment.

**Cut order if behind:** Yorvex and Trassoq as sample sellers (they stay in the deck), Ask (questions), PDFs in Ask or tell, the Google Doc (fall back to preview and copy), the notes summary.

**Stretch, in order:** quotes with approval (C8), clients (C7), then C1 to C5.

**Demo sellers (PRD Q24, Q26, ADR-0012):** three synthetic tech companies, one for each kind of thing a company sells. Their names are a made-up word, checked so that no real company uses it, plus what they sell. In running text the short form (Olvessa, Yorvex, Trassoq) is fine. Their personas are in `docs/product/personas/`.
- **Olvessa Cloud** (services), KL, a cloud and data consultancy. The built sample seller.
- **Yorvex Workforce** (software), Penang, workforce software for shift-based teams.
- **Trassoq Hardware** (products), Shah Alam, an IT hardware reseller with device services.

All three are in the deck. Yorvex and Trassoq become sample sellers once the deal room runs end to end for Olvessa, before the 17 Oct freeze. Before loading them, the price parser must read "RM 9 / employee / month" (PRD 10). Stoklane and Karang Systems are retired.

The sellers may offer services *around* Google products, but they never claim Google partner status or use partner badges.

**Users:** one Owner per workspace for the submission (PRD Q16). Roles stay in the data model (`members/{uid}`, `requireRole`) for later. Seeded history may name Olvessa's fictional staff: Nadia (founder), Arif and Mei Ling.

**Fresh-project boundary.** The hub pattern (sidebar modules, record pages with tabs) is generic. FlowHub's layout, naming, design system and code are designed fresh. Never reuse the design, naming or code of any existing portal, including any the maintainer has worked on elsewhere.

## Repository layout

Planned in ADR-0010:

- `web/`: the Next.js app (TypeScript).
  - `src/lib/schema/`: the Zod schema for the offering graph, proposals and deal rooms
  - `src/server/pipelines/<stage>.ts`: intake, research, fit, write, ingest, ask
  - `src/server/prompts/<role>.md`: prompts
  - `src/server/templates/sme.json`: the proposal template
  - `src/server/ai/models.ts`: the pinned model names
- `fixtures/`: test fixtures, such as `price-strings.json`, the `opportunities/` eval set, the `messages/` Ask or tell set, and the Olvessa sample catalogue.
- `docs/schema/`: the generated JSON Schema, which is the published exchange contract.

Existing now:

- `docs/architecture.md`: a one-page architecture overview with Mermaid diagrams, linking every ADR. Keep it in step whenever an ADR changes the picture.
- `docs/product/PRD.md`: the product requirements (accepted v1.0, 2026-09-28).
- `docs/design/DESIGN-BRIEF.md`: the brief for Claude Design. The handoff package will also go in `docs/design/`.
- `docs/proposal/`: the proposal PDF, its HTML source, and `render.js`, which renders the PDF with Playwright.
- `docs/product/personas/`: the demo sellers' personas, with full catalogues, and a comparison of the three.
- `docs/requirements/`: domain requirements carried forward, in generic terms.
- `docs/adr/`: architecture decision records.
- `docs/private/`: gitignored. Never commit it.
