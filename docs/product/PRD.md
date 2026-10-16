# FlowHub: Product Requirements Document

| | |
|---|---|
| Status | **Accepted v3.1.** v3.1 has three demo sellers, one for each kind of thing a company sells: services, software and products (Q24, ADR-0012). v3.0 sets the submission scope: an offering-centred hub, Ask or tell FlowHub, who-did-what markers, one sample seller and one user per workspace, built in TypeScript (Q15 to Q23, ADR-0009, ADR-0010). v2.0 made FlowHub hub-first (ADR-0008) |
| Date | 2026-10-15 (v3.0 2026-10-13, v2.0 2026-09-29, v1.0 2026-09-28) |
| Owner | FlowHub maintainers |
| Inputs | `docs/proposal/`, `docs/requirements/CARRIED-REQUIREMENTS.md`, `docs/product/personas/`, ADR-0001 to ADR-0012, `CLAUDE.md` |
| Feeds | Design system and screens (step 2), tech docs and ADRs (step 3), build (step 5) |

**How to read this document.** Requirements have IDs (`FR-INT-3`) and a priority:

- **M:** Must. Needed for submission.
- **S:** Should. Planned, cut if the schedule slips.
- **C:** Could. A stretch item. The order is given in 7.13.
- **W:** Won't, in the hackathon build.

Must-haves come with acceptance criteria (**AC**). Should and Could items are described more briefly. The product decisions are listed with their dates in section 14.

**IDs and section numbers stay stable across versions,** so ADRs can cite them. Sections added in v2.0 (7.14 and 7.15) and v3.0 (7.16 to 7.20) are therefore at the end of section 7, and retired requirements keep their ID with a note.

**In v3.0, section 7.0 overrides the priorities in 7.1 to 7.15.** Read it first: it says which earlier requirements are kept, changed or deferred for the submission.

---

## 1. Summary

FlowHub is **the hub for everything a company sells, with an agent team built in.**

**The hub.** Staff keep everything the company sells in one place. Each offering has one page with six tabs: Overview, Scope, Pricing, Partners, Sales material and Notes (v3.0). Behind the hub is a structured **offering graph** in which every item links to the page it came from. The hub works by hand, without AI.

**Agents keep the hub current.** Staff can **ask or tell FlowHub** in plain language, or drop in a deck or a past proposal. For example, "we met a client interested in X" or "our Growth price is now RM 19,500". FlowHub proposes each change in the right place. Nothing changes until someone applies it.

**Every block says who did it:** the AI, a calculation in code, or a person (v3.0).

**Agents turn the hub into offers.** When an opportunity arrives (a meeting invite, an email, a company URL or a tender), a team of Gemini agents works through it in stages. A person approves each stage before the next begins:

1. The agents research the prospect, citing every claim.
2. They map the prospect's gaps to the company's own offerings.
3. They price the fit from the company's rate cards.
4. They draft the proposal as a Google Doc, which a Reviewer agent checks before anyone sees it.

**Everything the agents produce is grounded in the hub,** so every claim and every price traces back to a source.

## 2. Problem

Every company that sells repeats five steps, by hand, each time an opportunity arrives:

1. **Know yourself:** what we offer, at what price, with what proof.
2. **Know them:** who the prospect is and where they are stuck.
3. **Find the fit:** which offering solves which gap.
4. **Make the ask:** a brief, then a proposal or quote.
5. **Close the loop:** follow up, and learn from wins and losses.

**Step 1 is where it breaks first.** What a company sells lives in scattered decks, spreadsheets, old proposals and people's heads:
- Staff can't find the current price, the right case study, or whether the company can even take the job.
- Knowledge is lost whenever someone leaves or hands work over.
- Every proposal starts from last quarter's document.

**Companies without a large sales team** (SMEs, startups, specialist integrators) feel this most. Selling is done by the same people who deliver the work, preparation competes with billable hours, and offers go out generic.

**Existing tools don't fix this.** They cover single steps and assume a CRM. None of them keeps a structured, sourced model of what the company sells, *and* uses it to drive research, fit, pricing and the proposal.

## 3. Goals, non-goals and success measures

### 3.1 Goals

- **G1: Grounded.** Every claim in a brief or artefact traces back to a web source or an offering-graph entity. Every price traces back to a rate card cell or a fee schedule line.
- **G2: Fast.** Going from pasting an opportunity to having a reviewed proposal in Google Docs takes minutes, not hours.
- **G3: People stay in control.** Each stage waits for approval, and every agent output can be edited before the next stage uses it.
- **G4: One engine for many personas.** Adding a persona means a new intake parser and output template, not new agents.
- **G5: Judges can try it themselves** within five minutes of signing in, without uploading anything.
- **G6: One source of truth.** The hub is where staff go to find out what the company sells, at what price, and with what proof. Agents keep it current from the company's own documents.

### 3.2 Non-goals for the hackathon (priority W)

- **Not a CRM.** No pipeline stages beyond the opportunity status, no contact management, and no email sync.
- **Light multi-user only** (Q13): three roles per workspace. There are no departments, no per-record permissions, no approval workflow beyond the deal-room gates, and no invitation emails.
- **Not a document store or wiki.** Documents are uploaded so agents can extract from them and cite them, not to be edited or organised as files.
- **No sending on the user's behalf.** FlowHub drafts; people send.
- **No billing or subscriptions** in the product.
- **No native mobile app.** Phone screens get read-only views at best (section 11).
- **Not a full tender bid engine.** A tender runs end to end with the standard proposal. The tender compliance matrix is a stretch item (C5).
- **No invoices** (Q20). Clients and quotes are designed but deferred (C7, C8).
- **One user per workspace for the submission** (Q16). Members and roles (7.15) are deferred.
- **No integrations with CRMs or marketplaces.** Intake is by paste, upload or URL.
- **No freelancer persona** (Q12). A one-person business has no staff hub, and the product is now built around one.

### 3.3 Success measures

| Measure | Target |
|---|---|
| Demo video shows the hub, Ask or tell, and the full deal-room flow for Kelapa Cloud | Under 3:00 |
| Sample sellers that run end to end from "Try with sample data" | 3 of 3. Kelapa Cloud is the floor (Q24) |
| Ask or tell: messages in the eval set that produce exactly the expected changes, with no change applied before Apply | 5 of 6 or more |
| A judge reaches a finished, reviewed proposal using the sample data | 5 minutes or less after signing in |
| Research claims in a delivered brief that carry a source | 100% |
| Prices in an artefact that trace back to a rate card cell or fee schedule line | 100% |
| Seller cost values appearing in any artefact or agent output | 0 |
| Eval set: expected gaps mapped to the expected offering | 80% or more (section 12) |
| Eval set: planted unsupported claims caught by the Reviewer | 100% |

## 4. Users and personas

### 4.1 Company personas (the demo sellers)

**Three demo sellers, one for each kind of thing a company sells** (v3.1, Q24): services, software and products. They also differ in size (14, 86 and 140 staff), so judges can map the demo onto their own markets. Every demo seller is a tech company. All three are based in Malaysia; Giliran also sells in Singapore and Indonesia, with a USD price list.

Each seller has a full persona in `docs/product/personas/`: the company, its people, its catalogue and prices, partners, proof, selling rules, a demo deal and Ask or tell examples. The folder's README compares the three side by side.

| Persona | Sells | Customer group it stands for | Demo seller (fictional) | Build status |
|---|---|---|---|---|
| P1: SME | Services | SMBs and the services-partner ecosystem | **Kelapa Cloud**, Kuala Lumpur | **Built.** Sample seller |
| P2 | | | *Retired in v2.0 (the freelancer persona was dropped, Q12)* | |
| P3: Startup | | | *Stoklane. Retired in v3.1 (Q24), replaced by Giliran* | |
| P4: Enterprise | | | *Karang Systems. Retired in v3.1 (Q24). Rantai Supply now shows tenders* | |
| P5: Software | Software | Software companies, from startup to scale-up | **Giliran**, Penang | **In the deck.** Becomes a sample seller once the deal room runs end to end for Kelapa Cloud, before the 17 Oct freeze (Q24) |
| P6: Products | Products | Resellers and suppliers selling into companies and the public sector | **Rantai Supply**, Shah Alam | As for Giliran (Q24) |

- **P1: SME tech consultancy.** *Kelapa Cloud is a 14-person cloud and data consultancy in Kuala Lumpur.*
  - It sells Google Cloud migrations, Workspace rollouts, BigQuery analytics and AI agent builds.
  - It takes 6 to 10 discovery calls a month. Preparing for one takes 20 minutes of browser tabs, or doesn't happen at all.
  - Its proposals start from last quarter's document. Its rate card is a spreadsheet, and its case studies are in a deck.
  - *The job:* "Walk into Thursday's call knowing their business, and send a tailored proposal on Friday."
- **P5: Software company.** *Giliran is an 86-person workforce software company in Penang: rostering, attendance and payroll for shift-based teams.*
  - It sells six product lines in three editions, priced per employee per month. Its enterprise arm runs implementations, integrations, custom modules and private deployments.
  - The product ships every two weeks, so the catalogue changes every two weeks. Its biggest risk is selling planned features as if they were live.
  - Opportunities arrive as demo requests and enterprise RFPs.
  - *The job:* "Answer an enterprise RFP in two days, with only what we sell today, priced from this year's card, and with the roadmap clearly marked as roadmap."
- **P6: Products reseller.** *Rantai Supply is a 140-person IT hardware reseller and distributor in Shah Alam: laptops, desktops and printers, plus leasing, managed print, deployment, warranty and disposal.*
  - Its prices move every month with the exchange rate. Hardware margins are 7% to 12%, and the services carry the profit, so the buy price must never leak.
  - Opportunities arrive as spec-list emails, requests for quotation, tender PDFs and contract renewals. In the build, a tender runs through intake, research, fit and pricing, and produces the standard proposal. The compliance matrix and bid/no-bid decision are C5.
  - *The job:* "Quote 600 laptops with deployment and disposal in a day, at this month's price, with a delivery promise logistics can keep for every site, and without ever showing our buy price."
- **All three use the standard proposal template** (the SME template). The startup meeting pack and the enterprise template stay W.
- **Retired personas.** Stoklane (a Singapore startup selling AI demand forecasting) and Karang Systems (a Jakarta systems integrator) were designed in v2.0 and moved to the deck in v3.0 (Q21). v3.1 retires them (Q24).

**Guardrail.** The synthetic sellers may *offer services around* Google products, but they never claim Google partner status or use partner badges or logos.

### 4.2 People inside a company (the member roles)

**v3.0: roles are deferred (Q16).** Each workspace has one Owner for the submission. The roles below stay as the design for later, and seeded history may still name Arif and Mei Ling.

These are the three roles, shown with Kelapa Cloud's staff. All the names are fictional.

| Person | Role | What they do in FlowHub |
|---|---|---|
| **Nadia**, founder | **Owner** | Sets up the workspace, invites staff, and does everything an Editor can |
| **Arif**, solutions consultant | **Editor** | Keeps the catalogue current, uploads documents, and runs deal rooms through their gates |
| **Mei Ling**, delivery engineer | **Viewer** | Looks up offerings, pricing and proof, and follows deal rooms. She can't edit or run agents |

**Judge** is a secondary audience. Judges arrive cold on the deployed URL, with no data of their own and limited time. G5 and FR-WS-3 exist for them. Each judge becomes the Owner of their own sample workspace.

All demo sellers and people are synthetic. Before the video is recorded, the seller names must be checked for trademark and business-name clashes. Prospects in the demo are real companies, using public information only.

## 5. Scope at a glance

**v3.0 submission scope** (supersedes the v2.0 table below where they differ):

| Area | Priority | Section |
|---|---|---|
| Sign-in and "Try with sample data" for Kelapa Cloud | M | 7.1 |
| Giliran and Rantai Supply as sample sellers, once the deal room runs end to end for Kelapa Cloud (Q24) | S | 7.1, 10 |
| Home: Ask or tell box, waiting for you, what happened today | M | 7.14, 7.17 |
| Offerings list and offering pages with six tabs | M | 7.16 |
| Ask or tell FlowHub: tell (proposals applied by a person) and ask (cited answers) | M | 7.17 |
| Uploading a PDF into Sales material or Ask or tell, producing a proposal | M | 7.2, 7.17 |
| Who-did-what markers on every block | M | 7.18 |
| Opportunities, with AI work marked | M | 7.4, 7.18 |
| Deal room: intake, cited research, fit, pricing, write and review, Google Doc | M | 7.5 to 7.9 |
| Usage caps and kill switch | M | 7.10 |
| Settings: workspace, selling rules, Drive access, usage | M | 7.1, 7.16 |
| Outcome capture | S | 7.11 |
| Clients (C7) and Quotes with approval (C8) | C | 7.19, 7.20 |
| Members and roles, search, soft delete, export and import, rehearsal, slides | W for the submission | 7.0 |

**v2.0 table, kept for reference:**

| Area | Priority | Section |
|---|---|---|
| Hub shell: sidebar navigation, record pages with tabs, jump-to by name | M | 7.14 |
| Overview (the hub's home page) | M | 7.14 |
| Members and roles (Owner, Editor, Viewer) | M | 7.15 |
| Sign-in and workspace | M | 7.1 |
| Sample-seller picker for judges (three sellers) | M | 7.1 |
| Upload and ingestion, with visible extraction status | M | 7.2 |
| Extraction review and confirm (with re-upload diff) | M | 7.2 |
| Catalogue: offering records, rate card grid, fee schedules, proof, constraints, partners, technology | M | 7.3 |
| Source viewer (citations open the source page) | M | 7.3 |
| Opportunities module | M | 7.4 |
| Intake (paste, upload or URL), classification, confirm prospect | M | 7.5 |
| Cited research brief | M | 7.6 |
| Fit map, go/no-go score and pricing estimate | M | 7.7 |
| Writer into Google Docs: SME and enterprise proposal, startup meeting pack | M | 7.8 |
| Reviewer claim check and loop | M | 7.8 |
| Live progress streaming for every stage | M | 7.9 |
| Usage caps that protect the budget | M | 7.10 |
| Last-verified stamps and staleness warnings | S | 7.3 |
| Pending updates on records (from re-uploaded documents) | S | 7.14 |
| Outcome capture (won, lost, no decision, with a reason) | S | 7.11 |
| Soft delete, recycle bin, audit log | S | 7.12 |
| Full-text search across the hub | S | 7.12 |
| Offering graph export and import (JSON) | S | 7.3 |
| Stretch items, in order: Ask the hub (C6), rehearsal (C1), Slides (C2), follow-up email (C3), outcome learning (C4), tender compliance matrix (C5) | C | 7.13 |

## 6. End-to-end flow

```
Set up once (v3.0)
  Sign in ─▶ "Try with sample data" (Kelapa Cloud; Giliran or Rantai Supply, Q24) or create a workspace
         ─▶ Drop documents into Ask or tell or a Sales material tab ─▶ proposal ─▶ Apply ─▶ offering pages

Day to day
  Home ─▶ Ask or tell box, what's waiting for you, what happened today
  Offerings ─▶ one page per offering: Overview, Scope, Pricing, Partners, Sales material, Notes
  Ask or tell ─▶ "Our Growth price is now RM 19,500" ─▶ proposed change in the Pricing tab ─▶ Apply
              ─▶ "We met Anjung Serai Living today…" ─▶ proposed opportunity ─▶ Apply ─▶ deal room

Per opportunity
  New opportunity: told to FlowHub / paste / upload / URL
    ▶ Stage 1  Intake          (auto, seconds)          ─▶ GATE A  Confirm prospect & persona
    ▶ Stage 2  Research        (grounded, cited)        ─▶ GATE B  Approve brief (edit/remove claims)
    ▶ Stage 3  Fit ▸ Pricing   (fit, then pricing)      ─▶ GATE C  Approve fit map (edit gaps/mappings)
    ▶ Stage 4  Write + Review  (loop ≤ 2 revisions)     ─▶ GATE D  Resolve flagged claims, finalise
    ▶ Done: Google Doc link, review report, go/no-go on the opportunity
    ▶ (S) Record outcome    (C) Rehearse    (C) Follow-up email
```

- **Each stage is one agent invocation** that reads its inputs from Firestore and writes its outputs back (ADR-0003, ADR-0006).
- **A gate is a person's action in the deal room.** Nothing downstream runs until the gate is passed, and the deal room shows who passed each gate.
- **A user can go back to an earlier gate and re-run from there.** Re-running a stage marks every later stage's output as out of date. Old outputs are kept as history, not deleted.

**Note on ADR-0003.** Intake gets its own quick gate (A) here, so a misidentified prospect never triggers a research run. ADR-0003 described Intake and Research as one invocation only as an example of a stage. Stage boundaries are a product decision, and this section sets them.

## 7. Functional requirements

### 7.0 Submission scope (v3.0)

This table overrides the priorities written in 7.1 to 7.15 for the submission. **W** here means "not in the submission build"; the requirement stays as the design for later.

| Requirements | v3.0 | Notes |
|---|---|---|
| FR-WS-1, FR-WS-4, FR-WS-7 | Keep | |
| FR-WS-2 | Keep | The default persona is fixed to SME |
| FR-WS-3 | Changed | Kelapa Cloud is the sample seller (Q21). Giliran and Rantai Supply join it as S, once the deal room runs end to end for Kelapa Cloud (Q24). All three use the SME template. With more than one, FR-WS-4 applies: choosing another sample seller replaces the sample workspace, after confirmation |
| FR-WS-5 | S | |
| FR-WS-6 | Changed | Settings has Workspace, Selling rules (FR-OFR-9), Drive access and Usage. No Members |
| FR-ING-1 | Changed | PDF only, dropped into Ask or tell or a Sales material tab |
| FR-ING-2, FR-ING-3 | Keep | Status shows on the file and on Home |
| FR-ING-4 | Changed | No separate OCR step: Gemini reads scanned pages (ADR-0010) |
| FR-ING-5, FR-ING-6 | Changed | The review screen is the proposal view (FR-ASK-2 to FR-ASK-4) |
| FR-ING-7, FR-ING-8 | W | |
| FR-OG-1, FR-OG-2 | Changed | Replaced by the offerings list and six-tab offering page (FR-OFR-1, FR-OFR-2) |
| FR-OG-3, FR-OG-4 | Changed | Edited by hand on the Pricing tab: prices, and lines and tiers added, renamed or removed (FR-OFR-5, changed 2026-10-15) |
| FR-OG-5, FR-OG-6, FR-OG-7 | Changed | Read inside the Sales material, Scope and Partners tabs. No separate modules (ADR-0009 D1) |
| FR-OG-8, FR-OG-9 | Keep | Technology is shown on Overview and changed through Ask or tell |
| FR-OG-10, FR-OG-11, FR-OG-12 | W | |
| FR-OG-13 | Keep | On the Overview tab, as Recent deals |
| FR-OPP-1 to FR-OPP-4 | Keep | Adds Came in as, Interested in, and the AI work column (FR-MRK-2) |
| FR-OPP-5 | W | |
| FR-FIT-4 | Changed | A selling-rule break found in code (industry or region) caps the score at No-go. Found by the eval: a tobacco distributor scored Consider (added 2026-10-15) |
| FR-INT-1 | Changed | One file: a PDF, an image (PNG or JPG) or a saved email (.eml or .txt), up to 20 MB, counted against the upload cap. No DOCX: save it as a PDF. Gemini reads PDFs and images directly (added 2026-10-15) |
| FR-INT-3 | Changed | A requirement read from a PDF carries its page. Code checks the page against the PDF's text and corrects or removes it, so a page reference is never the model's guess. A scan keeps the model's page, marked as unchecked (added 2026-10-15) |
| 7.5 to 7.9 (intake, research, fit, write, deal room) | Keep | Except: FR-WRI-10 (startup pack) W, FR-FIT-6 W (needs FR-OG-10). Gates show the person's name; roles are deferred. The proposal in FR-WRI-1 serves P1, P5 and P6 (Q24) |
| FR-CAP-1, FR-CAP-2 | Keep | |
| FR-OUT-1, FR-OUT-2 | S | |
| FR-TR-1 to FR-TR-3 | W | Audit events are still written |
| FR-HUB-1 | Changed | Sidebar: Home, Offerings, Opportunities, Settings. Top bar: Ask or tell, usage, user |
| FR-HUB-2 | Changed | Home: Ask or tell box, Waiting for you, What happened today, Your offerings |
| FR-HUB-3 | Keep | Offerings and opportunities share the record-page pattern |
| FR-HUB-4, FR-HUB-5 | W | No roles (Q16). No jump-to |
| FR-HUB-6 | Changed | Pending proposals show on the record (FR-ASK-5) |
| FR-MEM-1 to FR-MEM-5 | W | Q16 |
| C6 | M | Promoted and extended as 7.17 |
| C1 to C5 | C | After C8 and C7 (7.13) |

### 7.1 Sign-in and workspace

| ID | Pri | Requirement |
|---|---|---|
| FR-WS-1 | M | Sign-in uses a Google account through Firebase Auth. There is no email and password sign-in. |
| FR-WS-2 | M | **Workspace setup.** A user who isn't a member of any workspace, and has no pending invitation, sets one up: company name, website (optional), country, default currency (default MYR), a default persona (SME, Startup or Enterprise), and the industries served (optional, multi-select). They become its **Owner**. |
| FR-WS-3 | M | **Try with sample data.** The user picks one of the three sample sellers (section 4.1). Each is shown with its persona, city and what it sells. One click creates a workspace from that seller's catalogue (through the offering graph import, R12), with the user as Owner. It also creates one sample opportunity whose intake has been parsed but not yet researched. |
| FR-WS-4 | M | **One workspace per user** (Q13). Choosing a different sample seller replaces the user's sample workspace, after confirmation. Every read and write is scoped to the workspace. |
| FR-WS-5 | S | **Reset sample workspace** (Owner only) restores the sample data to its original state. |
| FR-WS-6 | M | **Settings** covers four areas: the workspace fields from FR-WS-2 (Owner edits), Members (7.15), Google Drive access ("Granted on <date>" or "Not granted", with a **Revoke** action, per user), and today's usage against the caps in 7.10. |
| FR-WS-7 | M | **Public home page and privacy page** (`/` and `/privacy`). Google's consent screen links to them. The privacy page says what FlowHub stores, that Drive access is limited to files FlowHub creates, that Google tokens are never stored, and how to delete a workspace (ADR-0007). |

**AC**
- A new user can go from the sign-in page to a workspace in 3 clicks or fewer with sample data, or one short form without it.
- A sample workspace is fully usable within 10 seconds: the catalogue is confirmed, and one opportunity is ready for Gate A.
- A Google account that isn't a member of a workspace never sees anything from it, including through search, vector retrieval or citation links.

### 7.2 Upload and ingestion

Upload, confirm and retry are for Editors and Owners. Viewers can see documents and their status.

| ID | Pri | Requirement |
|---|---|---|
| FR-ING-1 | M | The user uploads files by drag and drop or a file picker. Accepted types are PDF, PPTX, DOCX, XLSX, CSV, PNG and JPG. The size limit is 20 MB per file, and 20 files per workspace. |
| FR-ING-2 | M | Each upload has a document kind: sales deck, rate card, proposal, case study, or other. FlowHub suggests the kind and the user can change it. |
| FR-ING-3 | M | Extraction starts automatically on upload. The document shows its state as **Uploaded, Reading, Extracting, Ready to review, Confirmed, or Failed.** A failure always shows the reason and a Retry action. It is never silent. |
| FR-ING-4 | M | A scanned PDF that yields no text is flagged as "Scanned, running OCR" and sent through OCR, then continues. |
| FR-ING-5 | M | **Review screen.** Extracted entities are shown grouped by type: offerings and features, rate cards, fee schedules, proof, constraints, partners, technology. Each entity shows its source page and a quote. For each one the user can accept, edit, or reject it. They can also move a proposed feature up to become a sub-offering, or down to become a feature (the test in R1). |
| FR-ING-6 | M | **Confirm** writes the accepted entities into the catalogue and stamps them as verified by that user today. Nothing extracted is visible to any agent before it is confirmed. |
| FR-ING-7 | M | **Re-upload.** Uploading a new version of the same document produces a diff against the entities from earlier versions: new, changed, and removed. Entities someone has edited since they were confirmed show as conflicts, with the edited version kept by default. |
| FR-ING-8 | S | The user can confirm entity groups separately (for example, confirm the rate cards and keep the proof in draft). |

**AC**
- **Speed:** a 20-page sales deck reaches "Ready to review" within 2 minutes (p50).
- **Rate card fidelity:** a rate card spreadsheet with 3 tiers and 15 line items comes out as one rate card with 3 columns and 15 rows. Every non-empty cell is present, and its free-text value is preserved exactly ("1.2% min RM 0.20").
- **Provenance:** every extracted entity, row and cell carries a source page or cell reference, and opening it shows that location.
- **Failures:** a corrupt file lands in Failed with a human-readable reason within 30 seconds.
- **Isolation:** nothing from an unconfirmed extraction appears in search, retrieval or any agent output.

### 7.3 The catalogue (offering graph)

In the UI, the offering graph is presented as the **Catalogue**, a sidebar group with four modules: Offerings, Proof, Constraints and Partners. Entity shapes follow ADR-0001. Editing is for Editors and Owners, and Viewers see everything read-only.

| ID | Pri | Requirement |
|---|---|---|
| FR-OG-1 | M | **Offerings module.** Offerings are shown as cards by default, with a table toggle. Sub-offerings nest under their parent. Each card shows the summary, feature count, pricing count, linked proof count, last-verified state and status. |
| FR-OG-2 | M | **Offering record page,** following the record-page pattern (FR-HUB-3). It has six tabs:<br>- **Overview:** name, summary, description, status, owner, technology, sub-offerings, and features. Features form an ordered list with name, description and status; they can be added, edited, moved up or down, and removed, with no drag-to-reorder (Q6).<br>- **Pricing:** the offering's rate cards (FR-OG-3) and fee schedules (FR-OG-4).<br>- **Proof:** linked proof.<br>- **Constraints and partners:** the ones that apply to this offering.<br>- **Sources:** the documents and pages the record was extracted from.<br>- **Activity:** changes, last verified, and the opportunities it was mapped in (FR-OG-13). |
| FR-OG-3 | M | **Rate card grid editor.** Editing works like a spreadsheet: click a cell to edit its free text. Columns (tiers or packages) and rows (line items) can be added, renamed and removed. Rows carry an optional group label, and a heading renders wherever the group changes. A cell can be marked "current". Clearing a cell removes it. The card saves as a whole, with conflict detection (ADR-0001 D3). |
| FR-OG-4 | M | **Fee schedule editor.** An ordered list of lines: group, label, basis, price, cost, paid to, owner, note. **Cost is visibly marked private to the company.** The margin shows only when price and cost both parse, and it is never stored. |
| FR-OG-5 | M | **Proof module and records.** Covers case studies, metrics, logos and testimonials, each linked to one or more offerings. Every item has a **Public / Not public** toggle. Non-public proof is visibly badged and is never cited in an artefact. |
| FR-OG-6 | M | **Constraints module.** Each constraint has a kind (region, industry, minimum deal size, integration, other), a statement, optional values, and a scope (all offerings or selected ones). |
| FR-OG-7 | M | **Partners module and records.** Name, what they cover, technology and contacts. They are linked from offerings. |
| FR-OG-8 | M | **Technology** is edited as `{category, value}` pairs from a catalogue kept in code, with "Other" free text allowed in every category (R7). |
| FR-OG-9 | M | **Source viewer.** Any source chip opens a side drawer showing the document page, slide or sheet range, with the quoted text highlighted where possible. |
| FR-OG-10 | S | **Last verified.** Offerings and rate cards show who verified them and when, plus a "Mark verified" action. Anything more than 90 days old is badged as stale, and appears in the Overview's Needs attention list. |
| FR-OG-11 | S | **Export and import.** The whole offering graph downloads or uploads as one versioned JSON file (R12). Import shows a summary and validates the file before writing anything. |
| FR-OG-12 | S | **Graph view.** A toggle in the Offerings module gives a read-only visual of offerings, proof, constraints and partners and the links between them. It belongs to the Offerings module, not the home page. |
| FR-OG-13 | M | **Used in opportunities.** An offering's Activity tab lists the opportunities it was mapped to, with the fit strength and the outcome. This closes the loop between the catalogue and the deal rooms. |

**AC**
- Adding a new tier column to a rate card takes one click and a name, with no page reload. A save while someone else has changed the card shows a conflict message rather than overwriting their change.
- A cell value such as "Waived", "On quote" or "1.5%" saves and displays exactly as typed.
- Cost values are visible to workspace members in the pricing editors only (Q13). They never appear in search results, agent outputs, artefacts, or exports marked "for sharing".
- A Viewer sees every catalogue page, with no edit controls available.

### 7.4 Opportunities module

| ID | Pri | Requirement |
|---|---|---|
| FR-OPP-1 | M | **Opportunities module** (in the sidebar). A table of opportunities with these columns: prospect, persona, intake type, status, current stage and gate, go/no-go score, value (free text), owner (who created it), and last updated. |
| FR-OPP-2 | M | Status is one of a fixed set: **new, researching, proposing, sent, won, lost, no decision** (R8). It changes automatically as stages complete, and Editors can also set it by hand. Moving to "sent" is always a manual step. |
| FR-OPP-3 | M | The table can be filtered by status, persona and owner, and sorted by last updated. |
| FR-OPP-4 | M | A "New opportunity" button (Editors and Owners) opens intake (7.5). |
| FR-OPP-5 | S | An opportunity can be archived with a soft delete (7.12). |

### 7.5 Intake (stage 1 and Gate A)

| ID | Pri | Requirement |
|---|---|---|
| FR-INT-1 | M | **Input.** The user can paste text (a calendar invite or an email), upload one file (PDF, DOCX, EML or an image), or enter a company URL. They can combine these, for example an email plus the company URL. |
| FR-INT-2 | M | **Classification** sets the persona (SME, Startup or Enterprise) and the intake type (meeting invite, client email, company URL, tender document). The workspace's default persona breaks ties. |
| FR-INT-3 | M | **Extraction** captures: the prospect company (name, website, country), the contact people (name and role, if given), the meeting date and time, what the prospect is asking for, the stated requirements, budget signals and deadlines. For a tender document it also captures the issuer, the submission deadline, and the top-level requirements (at most 30), each with its page reference. |
| FR-INT-4 | M | **Gate A: confirm the prospect.** The user sees the extracted company, with its website and a one-line description as a disambiguation check, plus the persona and requirements. They can correct any field, then press **Research this prospect**. |
| FR-INT-5 | M | Where the prospect is an individual rather than a company (for example a sole proprietor), research is limited to what the intake gives plus any company they name. It never profiles a private person. |
| FR-INT-6 | M | **Missing information.** If no company can be identified, the user is asked for a name or URL before research can start. |

**AC**
- **Speed:** intake completes within 10 seconds (p50) for pasted text.
- **Accuracy:** for the eval set, the prospect company is identified correctly 9 times out of 10.
- **Edge case:** an invite that names only a person and a Gmail address ends at FR-INT-6, never at a guess.

### 7.6 Research brief (stage 2 and Gate B)

| ID | Pri | Requirement |
|---|---|---|
| FR-RES-1 | M | **Brief sections:**<br>(1) *Snapshot*: what they do, size, locations.<br>(2) *Recent news and events*.<br>(3) *Hiring signals*.<br>(4) *Technology signals*: the detected stack, as technology pairs.<br>(5) *Sector pressures*: industry-aware.<br>(6) *Likely needs*.<br>(7) *Questions to ask*.<br>Sections with nothing credible are shown as "Nothing found" rather than padded out. Google's Search Suggestions are shown unchanged (ADR-0006 D2). |
| FR-RES-2 | M | **Every factual claim has at least one source chip** showing the domain and the publication date if known. Opening the chip opens the source. **A claim with no source is dropped** and counted in "N claims dropped for lack of a source", so the user can see how many were removed. |
| FR-RES-3 | M | **Inferences are labelled.** "Likely needs" and "Sector pressures" can contain reasoning rather than facts. Each such item is labelled *Inference* and must point to the claims it rests on. An inference with no supporting claims is dropped. |
| FR-RES-4 | M | **Freshness.** News older than 18 months is flagged as old. Sources are shown with their dates. |
| FR-RES-5 | M | **Gate B: approve the brief.** The user can remove a claim or add a note, then press **Continue to fit**. A user note is marked as a *Seller note*: it isn't a sourced claim, but it can be used downstream as the company's own statement. |
| FR-RES-6 | M | **Detected technology is matched against the company's integrations.** Overlaps show as a fit signal in 7.7. |
| FR-RES-7 | S | The brief can be copied as formatted text for use outside FlowHub, subject to the grounding terms review (section 15). |

**AC**
- **Speed:** the brief completes within 90 seconds (p50), and the first progress event appears within 3 seconds of Gate A.
- **Sources:** 100% of the displayed factual claims have a working source link.
- **Eval:** each brief has at least 3 sourced claims in Snapshot or News for a prospect with a normal public footprint.
- **Streaming:** the progress log shows what the agent is doing ("Reading example.com.my", "Searching recent news"), not a spinner alone.

### 7.7 Fit map, go/no-go and pricing (stage 3 and Gate C)

| ID | Pri | Requirement |
|---|---|---|
| FR-FIT-1 | M | **Gaps.** A list of the prospect's needs, derived from the intake requirements and the approved brief. Each gap cites its origin: an intake line, a brief claim, or a seller note. |
| FR-FIT-2 | M | **Mappings.** Each gap maps to zero or more offerings or sub-offerings, with:<br>(a) a fit strength (Strong, Partial, Weak),<br>(b) the features cited as supporting detail, with source chips into the catalogue,<br>(c) a suggested customisation where the fit is partial,<br>(d) proof the company could reference. Public and non-public proof are distinguished. |
| FR-FIT-3 | M | **Cannot meet.** A gap that conflicts with a constraint shows "Cannot meet" with the constraint cited. Where a partner covers it, the gap also suggests "Consider partner X". Constraints are checked before fit is scored. |
| FR-FIT-4 | M | **Go/no-go score**, from 0 to 100, with a recommendation (**Go** at 70 or above, **Consider** from 40 to 69, **No-go** below 40; Q5) and three reasons, each linking to the gaps or constraints behind it. The score is computed in code (ADR-0006 D4). A prospect that breaks a company-wide selling rule, as found in code (industry or region, FR-FIT-3), is capped at **No-go** (39 at most), whatever else fits. A person can still remove that gap at Gate C and go on (added 2026-10-15). |
| FR-FIT-5 | M | **Pricing estimate** covers the mapped offerings, using the rate card cells and fee schedule lines that apply.<br>(a) Each line shows its source cell or line.<br>(b) Values the parser can't read show as "On quote" and are never invented.<br>(c) One-time, recurring and variable amounts are shown separately, never summed across bases.<br>(d) The currency comes from the source, or the workspace default.<br>The Pricing agent only selects lines; code copies the prices (ADR-0006 D3). |
| FR-FIT-6 | M | **Staleness.** If the fit relies on an offering or rate card not verified in more than 90 days, a warning names it. This depends on FR-OG-10; without it, the warning is skipped. |
| FR-FIT-7 | M | **Gate C: edit and approve.** The user can remove or add a gap, change a mapping, change the fit strength, remove a pricing line or choose a different tier column, and add a customisation note. Then they press **Write the proposal**. Their edits are what the Writer uses. |
| FR-FIT-8 | M | **Visual.** The fit map shows gaps on the left, offerings on the right, and lines between them, colour-coded by strength. "Cannot meet" gaps are visually distinct. The list view carries the same information for accessibility. |

**AC**
- **Speed:** fit and pricing together complete within 60 seconds (p50) of Gate B.
- **Price traceability:** every price displayed traces back to a cell or line. A test on the eval set shows no price without a source.
- **Constraints:** a planted "we don't work with the tobacco industry" constraint produces "Cannot meet" for a tobacco prospect, with that constraint cited.
- **Cost privacy:** no cost value appears anywhere in the fit map or pricing output.

### 7.8 Writing and review (stage 4 and Gate D)

| ID | Pri | Requirement |
|---|---|---|
| FR-WRI-1 | M | **SME and enterprise proposal (P1, P4)** is a Google Doc with these sections: title page, executive summary, our understanding of your situation (drawn from the brief, with a numbered Sources list), proposed scope (by gap and offering), approach and indicative timeline, indicative pricing (from FR-FIT-5, with "On quote" lines kept), relevant work (public proof only), next steps. For a tender (P4), the scope section follows the order of the tender's requirements and cites each requirement's page. |
| FR-WRI-2 | — | *Retired in v2.0: the freelancer reply and quote (Q12).* |
| FR-WRI-10 | M | **Startup meeting pack (P3)** is a Google Doc in two parts. Part 1 is a one-page meeting brief: who is in the room, their footprint and pressures from the research, the three questions to ask, and the pilot pitch in one paragraph. Part 2 is a pilot proposal: the problem in their terms, pilot scope and success metrics, timeline, pilot and subscription pricing from the rate card, relevant work (public proof only), and next steps. |
| FR-WRI-3 | M | **Tone and customisation.** Before writing, the user can pick a tone (Formal, Friendly or Concise) and add up to 500 characters of instructions. |
| FR-WRI-4 | M | **The Reviewer** checks each claim in the draft and classifies it as supported by *Research* (with a source), supported by the *Offering graph* (with an entity), or *Neither*. The Writer revises unsupported claims automatically, up to 2 times. |
| FR-WRI-5 | M | **Gate D: resolve and finalise.** Any claim still marked Neither **blocks** finalisation. For each one the user either accepts it (it's marked as a seller statement) or removes it. The review report shows a summary such as "12 claims: 11 research or offering, 1 seller statement". |
| FR-WRI-6 | M | **Finalise** creates the Google Doc and saves its link, the review report and the go/no-go score on the opportunity. The status moves to "proposing". |
| FR-WRI-7 | M | **Drive permission at Finalise.**<br>- Pressing Finalise asks Google for the narrowest Drive permission (`drive.file`: only files FlowHub creates). The first time, Google shows its consent popup; after that it is usually silent.<br>- The Doc is created in a "FlowHub" folder in **the Drive of the person who finalises.**<br>- The token is used once and never stored (ADR-0007).<br>- If the user declines, the artefact stays viewable and copyable in the app, and "Create in Google Docs" can be retried (Q8).<br>- Other members open the Doc through the link, subject to its sharing in Drive.<br>- A .docx download is a Could item, added only if time allows. |
| FR-WRI-8 | M | **Invariants.** No cost value, no non-public proof, and no price without a source may appear in an artefact. Each of these is enforced in code and tested, not left to the prompt alone. |
| FR-WRI-9 | S | **Artefact history.** Re-running the stage creates a new version. Earlier Doc links stay listed. |

**AC**
- **Speed:** writing and review complete within 120 seconds (p50) of Gate C.
- **Reviewer:** in the eval set, a planted unsupported claim ("We are ISO 27001 certified", with no such proof) is flagged 100% of the time.
- **Demo:** the video shows one planted claim being flagged, and the user removing it.
- **Docs:** the Doc opens in Google Docs with headings, a pricing table and working source links.

### 7.9 Deal room and live progress

The deal room is the **opportunity's record page** (FR-HUB-3).

| ID | Pri | Requirement |
|---|---|---|
| FR-DR-1 | M | **Layout.** A stage rail shows Intake → Research → Fit → Write → Done, with a state for each stage: not started, running, awaiting approval, approved, out of date, or failed. The current stage's content panel sits beside it. |
| FR-DR-2 | M | **Progress log.** While a stage runs, a live log of agent steps streams in (the agent name and the step), updating within 3 seconds of each event. All members viewing the deal room see it live. |
| FR-DR-3 | M | **Resilience.** Closing the tab or reloading never loses progress, because the state comes from the server. A failed stage shows the error and a Retry action. |
| FR-DR-4 | M | **Going back.** A completed stage can be reopened. Re-running it marks later stages as out of date and asks for confirmation first. |
| FR-DR-5 | M | **Who did what.** Each gate shows who passed it and when (from the audit trail). Gates and edits are available to Editors and Owners; Viewers follow read-only. |

### 7.10 Usage caps (budget protection)

| ID | Pri | Requirement |
|---|---|---|
| FR-CAP-1 | M | **Per-workspace daily caps:** 10 research runs, 30 stage runs in total, 20 uploads (Q3) and 60 Ask or tell messages (added 2026-10-15), shared by all members. Settings shows the usage, and when a cap is reached a clear message says when it resets. |
| FR-CAP-2 | M | **A global kill switch** (a config flag) stops all agent runs if the budget alert fires. |

### 7.11 Outcome capture (S)

| ID | Pri | Requirement |
|---|---|---|
| FR-OUT-1 | S | An Editor marks an opportunity as won, lost or no decision, with a reason from a short list (price, fit, timing, competitor, no response, other) and an optional note. |
| FR-OUT-2 | S | The Opportunities module shows outcomes, and they can be filtered. Outcomes also appear on each mapped offering's Activity tab (FR-OG-13). |

### 7.12 Trust layer and search (S)

| ID | Pri | Requirement |
|---|---|---|
| FR-TR-1 | S | **Soft delete** for offerings, proof, constraints, partners, documents and opportunities. A recycle bin allows Owners and Editors to restore. Deleting an offering deletes its sub-offerings and pricing along with it, and restoring it brings them back (R10). |
| FR-TR-2 | S | **Audit trail** of create, update, delete, restore and generate events, with who and when. It is shown on each record's Activity tab and in the deal room. |
| FR-TR-3 | S | **Full-text search** across offerings, features, proof, notes and document contents, from the top bar. Snippets never show restricted content, and results never cross workspaces (R11). |

### 7.13 Stretch items (C)

**Stretch order (Q14):** C6, then C1, C2, C3, C4, C5. The IDs are kept stable from v1.0.

**v3.0 stretch order (Q20):** C8 (quotes), then C7 (clients), then C1 to C5. C6 is now a Must, as 7.17.

- **C6: Ask the hub.** A side panel available on every hub page. Members ask questions in plain language, such as "What's our Growth price for migrating 80 VMs?" or "Which case studies can we cite for retail?".
  - Answers come only from the confirmed catalogue and confirmed document contents, and every sentence carries a citation to a record or a page.
  - Prices come through the same selection path as Pricing (ADR-0006 D3), so the model never writes a figure.
  - It never discusses cost, and never cites non-public proof as citable.
  - Viewers can use it.
  - It is a side panel, not the main UI.
- **C1: Rehearsal.** From a completed deal room, the user presses Rehearse and speaks with the prospect's decision-maker, played by Gemini through the Live API, using the brief and fit map as context. The prospect pushes back on price, fit and timing. A coaching summary follows with three strengths, three things to fix, and questions the user wasn't ready for. A text fallback is always available. Sessions are capped at 10 minutes.
- **C2: Slides.** The SME and startup personas can generate a deck outline as Google Slides (a title slide, one slide per gap and offering, pricing, relevant work, next steps).
- **C3: Follow-up email.** A draft email after the meeting or proposal, in the chosen tone, ready to copy. FlowHub never sends it.
- **C4: Outcome learning.** Recorded outcomes adjust which offerings and proof points the Writer emphasises for the same sector, and the adjustment is shown to the user ("Emphasising fast delivery for retail: 2 of 3 won deals cited timeline").
- **C5: Enterprise compliance matrix.** On top of the standard proposal, a tender produces a compliance matrix (requirement → can meet / partial / cannot, with the offering or constraint cited), a bid/no-bid recommendation and a draft outline. Until it is built, the demo shows it as a template.

### 7.14 Hub shell and Overview (added in v2.0)

| ID | Pri | Requirement |
|---|---|---|
| FR-HUB-1 | M | **Sidebar navigation.** A persistent left sidebar with:<br>- **Overview**<br>- **Opportunities**<br>- **Catalogue** (Offerings, Proof, Constraints, Partners)<br>- **Documents**, with a "to review" badge<br>- **Settings** (Workspace, Members, Usage, Recycle bin)<br>Each module shows a count of its records. The top bar holds the workspace name, **jump-to** (FR-HUB-5), today's usage, and the user menu with the user's role. The sidebar can collapse. |
| FR-HUB-2 | M | **Overview** is the home page after sign-in. It has five parts:<br>(a) **Needs attention:** extractions waiting for review, opportunities waiting at a gate, failed runs, and (with FR-OG-10) stale records. Each item has one action.<br>(b) **Open opportunities:** each with its current stage and next gate.<br>(c) **Agent activity:** recent agent runs and extractions, with who started them and what happened.<br>(d) **Catalogue at a glance:** counts by module, recently changed records, and records with pending updates.<br>(e) **Quick actions:** New opportunity, Upload documents.<br>Every item clicks through to its record. |
| FR-HUB-3 | M | **Record-page pattern.** Offerings, proof, partners, documents and opportunities share one layout:<br>- a header with the name, status badge, owner, last verified (where it applies) and actions<br>- tabs<br>- a side rail for activity or sources<br>Opportunities use the deal-room layout (7.9) inside the same header. |
| FR-HUB-4 | M | **Role-aware UI.** Controls a user's role can't use are hidden, or disabled with a tooltip that says why ("Viewers can't edit. Ask an Editor"). The server enforces roles regardless (ADR-0008). |
| FR-HUB-5 | M | **Jump-to** (Ctrl/Cmd+K) finds any offering, proof item, partner, document or opportunity by name and opens it. Full-text search is FR-TR-3. |
| FR-HUB-6 | S | **Pending updates.** When a re-uploaded document proposes changes to a record (FR-ING-7), the record shows "N pending updates from <document>" with a link to review them. |

**AC**
- After sign-in, a member lands on Overview. Every Needs attention item opens the right record in one click.
- A Viewer can reach every module and record, but can't start an agent run, pass a gate, upload, or edit. The server refuses these even if the UI is bypassed.
- Jump-to opens a record within two keystrokes of its name being unique.

### 7.15 Members and roles (added in v2.0)

| ID | Pri | Requirement |
|---|---|---|
| FR-MEM-1 | M | **Roles.**<br>- **Owner:** everything, plus workspace settings, members, reset and delete.<br>- **Editor:** edit the catalogue, upload and confirm documents, create opportunities, pass gates, finalise.<br>- **Viewer:** read everything in the workspace, including deal rooms and sources. Can use Ask the hub (C6) when built.<br>A workspace has at least one Owner. |
| FR-MEM-2 | M | **Inviting without email.** An Owner adds an email address with a role. **FlowHub sends no email:** the Owner shares the app link themselves. When a Google account with that address signs in, it joins the workspace with that role. Pending invitations are listed and can be revoked. |
| FR-MEM-3 | M | **One workspace per user.** If an invited user already has a workspace, they choose between joining (a sample workspace is then replaced; a non-sample workspace must be deleted first) and declining. FlowHub doesn't merge workspaces. |
| FR-MEM-4 | M | **Managing members.** Owners change a member's role or remove them. Removing a member keeps everything they did, with their name on it in the audit trail. |
| FR-MEM-5 | M | **Attribution.** Every confirm, gate, edit, finalise and outcome records who did it, and the UI shows it where it matters: gates, record Activity tabs, and the Overview's agent activity. |

**AC**
- An Owner invites a second Google account as Viewer. That account signs in, lands on the workspace's Overview, and sees no edit controls.
- Changing that member to Editor takes effect on their next action, without signing out.
- A removed member's next request is refused, and their past actions still show their name.

### 7.16 Offering pages (added in v3.0)

ADR-0009 D1. Everything about an offering lives on its own page. Proof, constraints and partners are read inside its tabs.

| ID | Pri | Requirement |
|---|---|---|
| FR-OFR-1 | M | **Offerings list.** One card per offering, kept to what a first-time reader needs to tell them apart: name, type (service, package or product), summary and starting price. Status shows only when it isn't Active. Pending proposals show as a marker. Everything else is on the offering page. Filter by type, shown when there is more than one. **New offering** opens a short form; **Add from a brochure** opens Ask or tell (simplified 2026-10-15: scope count, partners, deals, the document marker and the owner moved off the card) |
| FR-OFR-2 | M | **Offering page.** A header with the name, status, type, owner, last update and "kept current from N documents". Overview also shows a strip of four headline numbers. Six tabs: **Overview, Scope, Pricing, Partners, Sales material, Notes**, each with its own URL |
| FR-OFR-3 | M | **Overview tab.** What it is; key facts (typical length, best for, sub-offerings, technology, where we sell it); results you can cite (public only); recent deals with fit and outcome (FR-OG-13); recent changes, with markers |
| FR-OFR-4 | M | **Scope tab.** *What's included*: features, each with its source and who added it. *Not included*: exclusions, each with what to offer instead (a partner, another offering, or man-days). *Company-wide rules*, read-only from Settings. The Fit Analyst reads this tab: a need under Not included is Cannot meet (FR-FIT-3) |
| FR-OFR-5 | M | **Pricing tab.** An offering can mix several kinds of pricing: tiers (rate card grid), price lists, add-ons and man-day rates (fee schedules), each line with how it is charged (one-off, monthly, per unit and so on). Cost columns and margins are shown to the team and marked private (invariant 2). By hand: edit prices; add, rename and remove lines and tiers; add a new kind of pricing (it opens ready for its first line); remove one (soft delete). A card saves as a whole, with conflict detection. Lines and tiers keep their IDs, so proposals and deal-room runs still resolve. A private cost card keeps to its values (changed 2026-10-15) |
| FR-OFR-6 | M | **Partners tab.** One card per partner, vendor or supplier: what they cover for this offering, the arrangement, the person in charge (name, role, email, phone), the buy price (private), and "also on" other offerings. Contacts and buy prices never appear in proposals |
| FR-OFR-7 | M | **Sales material tab.** A PDF drop zone. Files with their kind, a share flag (OK to share with clients, or internal only) and what FlowHub read from them. Results you can cite, each Public or Not public, with its source and where it was cited (FR-OG-5) |
| FR-OFR-8 | M | **Notes tab.** Add and pin notes. Each note shows its author and marker. An AI summary is written only from these notes, and each summary line links to its note |
| FR-OFR-9 | M | **Settings › Selling rules.** Company-wide constraints (region, minimum deal size, industries, other), shown on every Scope tab |

**AC**
- Every Must task in this section can be done without Ask or tell.
- Every fact on an offering page shows its source chip or who entered it.
- Cost values appear only in the Pricing and Partners tabs, and are marked private there.

### 7.17 Ask or tell FlowHub (added in v3.0; replaces C6)

ADR-0009 D2. One panel for changing the hub in plain language, and for asking about it.

| ID | Pri | Requirement |
|---|---|---|
| FR-ASK-1 | M | **Everywhere.** A button in the top bar (Ctrl+J) and a box on Home. It accepts typed text or a PDF. On an offering page it is scoped to that offering |
| FR-ASK-2 | M | **Tell.** FlowHub returns a proposal: a list of changes. Each shows its kind, exactly where it will land (for example *Google Cloud migration › Pricing › Packages › Landing zone setup › Growth*), the before and after values, and its source (the message or the document page) |
| FR-ASK-3 | M | **Checked in code.** Unknown or stale targets, any cost field, and any price that doesn't appear word for word in the source are dropped, and shown as dropped |
| FR-ASK-4 | M | **Apply, Edit or Discard** each proposal, and **Undo** after applying. Applied changes record how they arrived (message or document), who applied them and when. Nothing changes before Apply |
| FR-ASK-5 | M | **Pending proposals show where they'll land:** a highlight on the record, and an item under Waiting for you on Home |
| FR-ASK-6 | M | **Price changes warn about open deals** that used the old price. Those deals keep it until pricing is re-run. A change with a start date ("from 1 November") is scheduled: the old price stays in use until that day, and the Pricing tab shows both (added 2026-10-15) |
| FR-ASK-7 | M | **A told lead** creates an opportunity with the prospect, contact, offerings they're interested in, next meeting, and "came in as: told to FlowHub". It waits at Gate A, so research never starts on an unconfirmed company |
| FR-ASK-8 | M | **Ask.** Answers cite records and document pages. Prices follow the Pricing path: the model picks the lines, code copies them, and code calculates any total (marked Calculated). It never discusses cost and never cites non-public proof. It says "not in the hub" when confirmed data can't answer |

**AC**
- "From 1 November our Growth landing zone goes up to RM 19,500" proposes exactly one change to that cell. Apply changes only that cell.
- A price that the person didn't write (for example, one the model rounded) never reaches Apply.
- "What's our Growth price for 80 VMs?" answers with the copied line and a calculated total.
- The first proposal appears within 10 seconds (p50) for a typed message.

### 7.18 Who-did-what markers (added in v3.0)

ADR-0009 D4.

| ID | Pri | Requirement |
|---|---|---|
| FR-MRK-1 | M | **Three markers, used everywhere:** *AI* (and *AI, waiting for you*), *Calculated* (code, no model), and a person's name. Each marker carries a text label, so colour is never the only signal |
| FR-MRK-2 | M | **Opportunities table:** an AI work column with one marker per stage (research, fit, write): done and approved, waiting for you, failed, or not started. A legend explains them |
| FR-MRK-3 | M | **Deal room:** each stage in the rail shows the AI's run time and who passed the gate. Each block (brief, fit map, score, pricing, draft, review) carries its marker, and so does each line of the activity log |
| FR-MRK-4 | M | **Offering pages and Home:** facts and changes show whether they came from a document, a message, or a person |

### 7.19 Clients (C7, added in v3.0)

Designed, not built for the submission (Q20).
- A won opportunity becomes a client. FlowHub pre-fills the client, its first contract (value, term, offering, links to the proposal and quote) and milestones from the approved proposal. A person confirms them.
- The client page has tabs: Overview, Contracts, Contacts, Documents, Notes.

### 7.20 Quotes and approval (C8, added in v3.0)

Designed, not built for the submission (Q20). Invoices won't be built in the hackathon.
- A quote is built from a deal's approved priced lines, on the company's template. AI writes the scope wording. Code copies the prices and calculates totals, discount and SST. A person enters any "on quote" price.
- A quote is sent to an approver, who sees the checks (prices match the Pricing tabs, discount within the limit, totals calculated) and approves or requests changes.
- An approved quote can be created as a Google Doc or a PDF. FlowHub never sends it.

## 8. Agent behaviour requirements

**v3.0:** the agents are named steps in TypeScript pipelines (ADR-0010). Ask or tell is added below, and the hub assistant row is merged into it.

These are product-level rules. The agent design (ADR-0006) satisfies them.

| Agent | Stage | Reads | Produces | Rules |
|---|---|---|---|---|
| Extraction | Ingest | Uploaded document | Proposed catalogue entities | Flash tier. Proposals are staged, and nothing reaches the catalogue until someone confirms it |
| Intake | 1 | Raw intake | Structured intake (FR-INT-3) | Flash tier. Never guesses a company (FR-INT-6) |
| Researcher | 2 | Confirmed intake | Brief with claims, sources and inferences | Google Search grounding and URL context. Drops claims without a source. No profiling of private individuals |
| Fit Analyst | 3 | Approved brief, confirmed catalogue | Gaps, mappings, cannot-meets, score inputs | Checks constraints first. Cites entities by ID and revision |
| Pricing | 3 | Mappings, rate cards, fee schedules | Selected price lines | **Selects references only.** Never sees cost |
| Writer | 4 | Approved fit map, brief, persona template, tone | Draft artefact | Public proof only. Price placeholders only. Cites every claim |
| Reviewer | 4 | Draft, brief, catalogue | Claim table | Blocks on Neither. Up to 2 revision loops. Hard checks in code |
| Orchestrator | all | Opportunity state | Runs stages, writes progress | Stops at every gate |
| Hub assistant | C6 | Confirmed catalogue and document contents | Cited answers | *Merged into Ask or tell in v3.0* |
| Ask or tell | Any time | A message or PDF, plus the confirmed hub outline (no cost) | A proposal of typed changes, or a cited answer | Flash tier. Proposes only; code validates every change, and a person applies it. Prices must appear word for word in the source. Answers price questions by selection, with totals calculated in code |
| Coach | C1 | Brief, fit map | Voice session, coaching notes | Live API. 10-minute cap |
| Outcome Learner | C4 | Outcomes | Emphasis notes per sector | Changes are visible to the user |

## 9. Screens

**v3.0 screens for the submission.** They are drawn on the mockup canvas, page "v2 · Offering-centred" (ADR-0010 D6). New IDs start at S21.

| ID | Screen | Requirements |
|---|---|---|
| S1, S2 | Sign in; workspace setup with Kelapa Cloud, then Giliran and Rantai Supply (Q24) | FR-WS-1 to FR-WS-3 |
| S21 | Home | FR-HUB-2, FR-ASK-1, FR-MRK-4 |
| S22 | Ask or tell: a new lead becomes an opportunity | FR-ASK-2 to FR-ASK-7 |
| S23 | Ask or tell: a price question and a price change | FR-ASK-2 to FR-ASK-8 |
| S4 | Offerings | FR-OFR-1 |
| S24 to S29 | Offering tabs: Overview, Scope, Pricing, Partners, Sales material, Notes | FR-OFR-2 to FR-OFR-8 |
| S3 | Opportunities, with AI work marked | FR-OPP-1 to FR-OPP-4, FR-MRK-2 |
| S11 | New opportunity (paste, upload or URL) | FR-INT-1 |
| S12, S12a to S12d | Deal room and stage panels, with markers | 7.5 to 7.9, FR-MRK-3 |
| S13 | Source drawer | FR-OG-9 |
| S14 | Settings: workspace, selling rules, Drive access, usage | FR-WS-6, FR-OFR-9, FR-CAP-1 |
| S30 to S33 | Clients, client record, Quotes, quote approval | C7, C8: designed, not built |

The v2.0 inventory below stays for reference.

This is the inventory for step 2. **Bold** screens appear in the demo video. Every signed-in screen sits inside the hub shell (FR-HUB-1).

| # | Screen | Purpose | Key elements | States to design |
|---|---|---|---|---|
| S1 | Sign in | Entry | Product line, Google button | Signed out, error, invitation found |
| S2 | **Workspace setup** | First run | Short form, and a **Try with sample data** picker with three seller cards (persona, city, what they sell) | Empty, loading sample, replacing sample, invitation pending |
| **S18** | **Overview** | Hub home | Needs attention, open opportunities, agent activity, catalogue at a glance, quick actions | Populated, first run (nothing yet), all clear |
| S3 | **Opportunities** | Module | Table, filters, New opportunity | Empty, populated, Viewer (no New button) |
| S4 | **Offerings** | Catalogue module | Cards with a table toggle, sub-offerings nested, stale and pending badges, graph view toggle (S) | Empty (prompt to upload), populated |
| S5 | Documents | Module | Drop zone, document list with extraction state, "to review" filter | Reading, extracting, failed, scanned or OCR |
| S6 | **Extraction review** | Confirm entities | Grouped proposed entities, source quote, accept, edit, reject, diff badges | First upload, re-upload diff with conflicts |
| S7 | **Offering record** | Record page | Header, tabs (Overview, Pricing, Proof, Constraints and partners, Sources, Activity), side rail | View, edit, Viewer read-only, pending updates |
| S8 | **Rate card editor** | Pricing tab | Spreadsheet grid, group headings, current marker, source chips | Editing, conflict |
| S9 | Fee schedule editor | Pricing tab | Ordered lines, private cost column, derived margin | Editing |
| S10 | Proof, Constraints, Partners | Catalogue modules and records | Lists, record pages, public toggle | Empty, populated |
| S11 | **New opportunity (intake)** | Start a deal | Paste area, file, URL | Empty, parsing |
| S12 | **Deal room** | Opportunity record page | Header, stage rail, content panel, progress log, gate bar with who passed each gate | Each stage state from FR-DR-1, Viewer read-only |
| S12a | Gate A panel | Confirm prospect | Extracted fields, disambiguation line | Ambiguous prospect |
| S12b | **Brief panel** | Research | Sections, claim rows with source chips, Inference labels, dropped-claims count, Search Suggestions area | Streaming, complete, nothing found |
| S12c | **Fit map panel** | Fit | Gap ↔ offering lines, cannot-meet, score dial, reasons, pricing table | Editing, stale warning |
| S12d | **Artefact panel** | Write and review | Tone picker, draft preview, claim table, Doc link | Revising, blocked, finalised, Drive permission declined |
| S13 | Source viewer (drawer) | Citations | Page render, highlighted quote, open original | Web source, document page |
| S14 | Settings: Workspace and Usage | Workspace | Fields, Drive access (per user), usage against caps, export and import (S) | Cap reached, Drive not granted |
| **S19** | Settings: Members | Team | Member list with roles, invite by email with role, pending invitations, change role, remove | One member, several members, pending |
| S15 | Recycle bin (S) | Restore | Deleted items, restore | Empty |
| S16 | Rehearsal (C1) | Practise | Mic control, transcript, coaching summary, text fallback | Connecting, live, ended |
| S17 | Home and privacy pages | Public pages the consent screen links to (FR-WS-7) | Product line, sign-in link, plain-language privacy text | Signed out |
| S20 | Ask the hub panel (C6) | Answers | Question box, cited answer, record and page chips | Empty, answering, answered, "not in the hub" |

**The shell** (FR-HUB-1) is the frame every screen sits in. **The record-page pattern** (FR-HUB-3) is shared by S7, S10, S12 and document pages. **The stage rail** is the deal room's signature interaction: stages, gates, state and who approved each gate must be readable at a glance.

## 10. Content and data requirements for the demo

Only Kelapa Cloud, whose ingestion appears in the video, gets real source files. Giliran and Rantai Supply load like Kelapa Cloud's sample: a TypeScript sample validated against R12, with document records (names and page counts, no stored file) so their source chips still name a page (v3.1, Q24). Their full catalogues are in `docs/product/personas/`.

| Seller | Catalogue | Delivered as | Demo prospect |
|---|---|---|---|
| **Kelapa Cloud** (SME) | Four offerings: Google Cloud migration, Workspace rollout, data and analytics on BigQuery, AI agent build. One rate card with three tiers × about 15 lines, including free-text cells. Two fee schedules (standard and add-ons). Six proof items, two of them non-public. Four constraints, one of them industry-based. One partner, for network and hardware. Three members (Nadia, Arif, Mei Ling) in the sample's audit history | **Source files:** a sales deck PDF, a rate card XLSX and two past proposals, so ingestion is shown for real. Also an R12 JSON file for FR-WS-3 | Two or three real Malaysian retail or services companies with a rich public footprint |
| **Giliran** (Software) | Thirteen offerings: six product lines (Shifts, Time, Payroll, Leave and Claims, Hire in pilot, Insights), two sub-offerings with their own terms, and an Enterprise and projects arm with four sub-offerings. An editions rate card (modules × Essentials, Business, Enterprise, per employee per month), a USD price list, onboarding fees, man-day rates and add-ons, all with private cost. Planned features on the roadmap. Eight proof items, two of them non-public. Planted conflicts: on-premise installation, labour-supply agencies. Persona: `giliran.md` | A TypeScript sample, after Q24's condition. Document records for source chips | One or two real Malaysian employers with large shift workforces: a plantation, manufacturing or hospital group |
| **Rantai Supply** (Products) | Fourteen offerings: laptops and desktops (five models as sub-offerings), printers, accessories, and six services. Rate cards by volume band with a private buy-price card, managed print per page, leasing per device per month, and fee schedules for deployment, warranty, disposal and delivery. Eight proof items, two of them non-public. Planted conflicts: Wi-Fi installation, prices held for 90 days, fixed delivery dates to interior sites. Persona: `rantai-supply.md` | As for Giliran | One or two real Malaysian universities or large employers refreshing their devices |

**Before Giliran or Rantai Supply is loaded** (Q24):
- **The price parser must read a unit and a period together.** Today "RM 9 / employee / month" and "RM 119 / device / month" parse as unreadable, so they would show as On quote (FR-FIT-5b). Add cases to `fixtures/price-strings.json` first, including "RM 380 / unit / year".
- **Non-price rows must not hold bare numbers.** "1" and "3" in a row such as "Legal entities included" parse as RM 1 and RM 3. Write "1 entity".

**v3.0 additions to Kelapa Cloud's sample.** These match the mockup:
- **Each offering:** a type (service or package), man-day rates with private cost, add-ons, and notes.
- **A second partner:** Sempadan Security, a vendor with a private buy price.
- **Selling rules:** region, minimum deal size, industries.
- **Two pending proposals:** one from a message, one from a brochure.
- **Opportunities:** a few past opportunities, including one won and one lost.
- **Real prospects for live research:** two or three Malaysian retail or services companies, using public information only. The mockup's Anjung Serai Living is a fictional stand-in.

- **No real company's catalogue, prices or clients** ever appear in the repository.
- **Every seller has at least one planted constraint conflict and one non-public proof item,** so the controls can be demonstrated for any of them.
- **Sample workspaces come with history:** a few past opportunities (one won, one lost) and some audit entries, so the Overview, Activity tabs and FR-OG-13 aren't empty on first view.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | p50 targets: intake 10 s, brief 90 s, fit and pricing 60 s, write and review 120 s, ingestion of a 20-page deck to review 2 min. First progress event within 3 s of any gate. UI interactions under 200 ms |
| Platform | Desktop-first. Chrome, Edge and Safari (latest). The hub and deal room are designed for 1280 px and wider, and stay usable down to 1024 px. Phones get read-only views of Overview, opportunities and briefs, with no horizontal scrolling |
| Accessibility | WCAG 2.1 AA for the core flows: keyboard-operable sidebar, gates and editors, visible focus, contrast, labelled controls. The fit map has an equivalent list view |
| Language | English UI and outputs. Intake and sources may be in Malay or Chinese, but outputs are in English (Q4). Supporting other languages is a prompt change, and the pitch can say so |
| Security | Google sign-in only. Workspace isolation on every read (rules and server checks). **Roles enforced on the server for every write and agent run** (ADR-0008). No secrets in the client. Only the server calls agents (ADR-0003). The Drive permission is limited to files the app creates, and Google tokens are never stored (ADR-0007) |
| Privacy | Cost values and non-public proof never leave the company's workspace: never to agents, artefacts, search snippets or shared exports. No profiling of private individuals. The public repo holds only synthetic seller data |
| Reliability | Every failure is visible with a retry. Stage state survives reloads. Idempotent re-runs |
| Cost | Runs within free tiers and trial credits. Caps from 7.10. Budget alert before any deploy |
| Observability | Every agent run is traced (Agent Runtime tracing), with the opportunity ID and stage |
| Data retention | Soft delete (S). Sample workspaces can be reset |

## 12. Evaluation plan (product view)

- **v3.0 eval set:** 4 Kelapa Cloud opportunities in `fixtures/opportunities/`, plus 6 Ask or tell messages in `fixtures/messages/`, each with its expected changes. One message plants a price the person didn't write, and it must be dropped. `npm run eval` runs the set (ADR-0010 D5). The v2.0 set below is the target after the hackathon.
- **v3.1 addition (Q24):** when Giliran and Rantai Supply are loaded, one opportunity each joins the set: the demo deal from each persona, with its planted constraint conflict and planted unsupported claims.
- **Eval set:** 10 sample opportunities (4 Kelapa Cloud, 3 Giliran, 3 Rantai Supply; v3.1 replaces the startup and enterprise sellers). Each has an expected prospect, expected gaps, expected offering mappings, one planted constraint conflict, and one planted unsupported claim for the Reviewer.
- **Automated checks:**
  - prospect identified correctly (9/10)
  - gap-to-offering mapping (80% or more)
  - 100% of research claims have a source
  - 100% of prices trace to a source
  - 0 cost leaks
  - 100% of planted unsupported claims flagged
  - constraint conflicts caught (10/10)
- **When it runs:** in CI when `web/src/server/` or `fixtures/` change (ADR-0010).

## 13. Release plan

**v3.0 plan, from 13 October:**

| Date | Milestone |
|---|---|
| 13 Oct | Docs updated (this version). Scaffold: Next.js, Tailwind v4, shadcn/ui and tokens, Firebase Auth, Firestore emulator, the Zod schema and Kelapa Cloud's sample data. Google Cloud project with a budget alert, then a hello-world deploy |
| 14 Oct | The hub: shell, Home, Offerings, the six offering tabs, hand edits and Selling rules (7.16) |
| 15 Oct | The deal room: Cloud Tasks route, intake, cited research, fit and pricing, with markers (7.5 to 7.7, 7.9, 7.18) |
| 16 Oct | Write and review, the Google Doc at Finalise, Ask or tell (tell first, then ask), and caps (7.8, 7.10, 7.17) |
| 17 Oct | PDFs in Ask or tell, the eval script, and fixes on the deployed app. Giliran and Rantai Supply as sample sellers, once the deal room runs end to end for Kelapa Cloud (Q24). Feature freeze at noon, then record the video |
| 18 Oct | Deck (with the three sellers, Q24), proposal PDF, README and deploy check. Submit early |

**If the plan slips, cut in this order:**
1. Giliran and Rantai Supply as sample sellers (Q24). They stay in the deck and the video's last frame.
2. Ask (questions). Keep Tell.
3. PDFs in Ask or tell. The sample documents arrive already applied.
4. The Google Doc. Fall back to the in-app preview and copy (Q8).
5. The AI notes summary.

**Never cut:** cited research, Cannot meet, prices copied by code, the Reviewer flag, and Tell with Apply.

**v2.0 plan, kept for reference:**

| Date | Milestone | PRD scope |
|---|---|---|
| 2 Oct | Design (step 2) | Hub shell, Overview, record-page pattern and the Tier 1 screens on mock data, including the design system |
| 5 Oct | Hosting gate | Hello-world agent deployed, and one stage end to end |
| 10 Oct | Core loop | 7.1 to 7.9, 7.14 and 7.15 working for Kelapa Cloud (SME) on sample data |
| 14 Oct | Complete must-haves | Startup template, Karang Systems end to end, Reviewer loop, caps, roles enforced, eval set in CI |
| 16 Oct | Should items, then C6 if on schedule | In this order (Q10): outcome capture, last-verified stamps, soft delete, search, export and import. Then Ask the hub (C6) |
| 18 Oct | Submit | Video, deck, README, deploy check |

## 14. Decisions

| # | Date | Question | Decision |
|---|---|---|---|
| Q1 | 2026-09-28 | Should Intake get its own quick gate (Gate A) before Research? | **Yes.** It avoids researching the wrong company |
| Q2 | 2026-09-28 | Multi-user workspaces? | *Superseded by Q13.* Originally: No |
| Q3 | 2026-09-28 | Should judges get "Try with sample data" plus daily caps? | **Yes**, both. The caps are 10 research runs, 30 stage runs and 20 uploads per workspace per day |
| Q4 | 2026-09-28 | Output language? | **English only.** The pitch mentions that other languages need only a prompt change |
| Q5 | 2026-09-28 | Go/no-go thresholds? | 70 or above is Go, 40–69 Consider, below 40 No-go |
| Q6 | 2026-09-28 | How much hand-editing of the catalogue? | **Full editors** as in 7.3, including the rate card grid. No drag-to-reorder |
| Q7 | 2026-09-28 | Demo sellers? | **Tech companies, one per persona** (section 4.1). Amended by Q12: three sellers, and the freelancer was removed |
| Q8 | 2026-09-28 | If Drive isn't connected, is the in-app view and copy enough? | **Yes.** A .docx download only if time allows |
| Q9 | 2026-09-28 | Export the research brief to a Google Doc? | **Not now.** FR-RES-7 covers copying it |
| Q10 | 2026-09-28 | Order for the Should items? | Outcome capture, then last-verified, then soft delete, then search, then export and import |
| Q11 | 2026-09-29 | Deal-room-first or hub-first? | **Hub-first** (ADR-0008). FlowHub is the hub for everything a company sells, with agents built in. The deal room is the opportunity's record page inside it. The engine is unchanged |
| Q12 | 2026-09-29 | Keep the freelancer persona? | **No.** A one-person business has no staff hub. P2, Wei Jie Tan, FR-WRI-2 and the marketplace intake are removed |
| Q13 | 2026-09-29 | Multi-user? | **Light:**<br>- roles Owner, Editor and Viewer<br>- invitations by email address, with no email sent<br>- one workspace per user<br>- cost visible to all members in the pricing editors, and never to agents, artefacts, snippets or shared exports |
| Q14 | 2026-09-29 | Stretch order? | **Ask the hub (C6) first,** because it is the most direct expression of the hub and reuses retrieval and citations. Then rehearsal (C1) and the rest as before |
| Q15 | 2026-10-13 | Agent stack? | **A GenAI workflow in TypeScript, in the Next.js app on Cloud Run,** calling Gemini through the Gen AI SDK on Agent Platform (ADR-0010). The hackathon requires Gemini, not agents |
| Q16 | 2026-10-13 | Multi-user for the submission? | **No.** One Owner per workspace. Roles stay in the data model for later (ADR-0009 D5) |
| Q17 | 2026-10-13 | How should the hub be organised? | **Around offerings.** One page per offering with six tabs. Proof, constraints and partners are read inside them, not as modules (ADR-0009 D1) |
| Q18 | 2026-10-13 | How do people update the hub? | **By hand, or by telling FlowHub** in plain language or with a PDF. FlowHub proposes; a person applies (ADR-0009 D2). C6 becomes a Must and is extended |
| Q19 | 2026-10-13 | Show where AI was involved? | **Yes, everywhere,** with three markers: AI, Calculated, and a person (ADR-0009 D4) |
| Q20 | 2026-10-13 | Clients, quotes, invoices? | **Clients (C7) and quotes with approval (C8) are designed but deferred.** Invoices won't be built. New stretch order: C8, C7, then C1 to C5 |
| Q21 | 2026-10-13 | How many sample sellers? | **Kelapa Cloud only.** Stoklane and Karang Systems go in the deck. *Amended by Q24* |
| Q22 | 2026-10-13 | How much hand editing? | **Notes, features, price cells, the public flag on proof, and opportunity basics.** Everything else changes through Ask or tell. *Amended 2026-10-15:* pricing lines, tiers and sections can be added, renamed and removed by hand too (FR-OFR-5, ADR-0009 amendment) |
| Q23 | 2026-10-13 | Embeddings, search and Document AI? | **Dropped for the submission.** The sample hub fits in context, and Gemini reads scanned PDFs (ADR-0010 D3) |
| Q24 | 2026-10-15 | Which demo sellers? | **Three, one for each kind of thing a company sells:** Kelapa Cloud (services), Giliran (software) and Rantai Supply (products). All three go in the deck and the PRD now. Giliran and Rantai Supply become sample sellers once the deal room runs end to end for Kelapa Cloud, before the 17 Oct freeze, and are the first thing cut. Stoklane and Karang Systems retire (ADR-0012) |

## 15. Assumptions and risks

- **File formats.** Gemini file understanding reads PDFs and images natively. How it handles PPTX, DOCX and XLSX needs confirming in the tech docs. Spreadsheets are parsed in code (ADR-0006), which suits rate cards anyway.
- **Google Search grounding** is billed separately from tokens. The caps in 7.10 cover it.
- **Google Search grounding terms.**
  - The brief must display Google's Search Suggestions unchanged (S12b).
  - Storing grounded text for users to review and for reuse in later prompts appears to be permitted, but the exact wording must be verified before the first deploy.
  - That review also covers whether copying the brief (FR-RES-7) and using grounded content in the prospect-facing Doc are allowed (ADR-0006, Confirmation).
- **The Drive permission** (`drive.file`) is non-sensitive and needs no Google verification. The consent screen must be published to Production before the demo (ADR-0007).
- **Real prospects in the demo** must have enough public information. Pick them early (section 10).
- **Schedule.** The hub shell, Overview and members add scope to a tight plan. If week 2 slips, cut Should items first, then FR-HUB-6, and keep the Overview minimal (Needs attention and open opportunities).
- **Schedule (v3.0).** Nothing was built by 13 October, and five days remain. Section 13 sets the cut order. Feature freeze is noon on 17 October.
- **Tooling (v3.0).** The Google Cloud CLI is not yet installed on the build machine. The Firestore emulator needs Java. Both are needed on day 1. *Resolved 2026-10-14:* the CLI is installed and the app is deployed. The emulator won't run on the build machine, so local development uses a dev project (ADR-0011), and automated Firestore tests run on the emulator in CI.
- **Team rule.** The hackathon requires teams of 2 to 4 people. The team must be confirmed before submission.
- **Fresh-project rule (v3.0).** The offering-centred layout is a generic pattern. FlowHub's names, layout, design and code are its own. Nothing from any internal portal is reused.
- **Fresh-project rule.** The hub pattern (sidebar modules, record pages with tabs) is generic. FlowHub's layout, naming, design system and code are designed and built fresh during the hackathon, and no existing product's design or code is reused.

## 16. Glossary

| Term | Meaning |
|---|---|
| Hub | FlowHub's workspace for a company: Overview, Catalogue, Documents, Opportunities and Settings |
| Catalogue | The UI name for the offering graph: Offerings, Proof, Constraints, Partners |
| Offering graph | The structured model behind the catalogue: offerings, features, rate cards, fee schedules, proof, constraints, partners, technology (ADR-0001) |
| Member, role | A person in a workspace, as Owner, Editor or Viewer (7.15) |
| Opportunity | One potential deal, with a flat record (R8) and a deal room |
| Deal room | The opportunity's record page, where stages run and gates are approved |
| Stage | One agent invocation between gates (ADR-0003) |
| Gate | A person's approval that starts the next stage |
| Claim | A statement in a brief or artefact that needs support from a source, an entity or the company |
| Fit map | Gaps mapped to offerings, with strength, customisations, cannot-meets and a score |
| Artefact | A generated deliverable: a proposal Doc, a startup meeting pack, or (stretch) Slides |
| Seller statement | A claim a person has accepted on the company's own authority |
| Offering page | One offering's record page, with six tabs: Overview, Scope, Pricing, Partners, Sales material, Notes (v3.0) |
| Ask or tell | The panel where people ask about the hub or tell it what changed, in plain language or with a PDF (v3.0) |
| Proposal | A list of changes FlowHub suggests from a message or a document. Nothing changes until a person applies it (v3.0) |
| Marker | The label on a block that says who produced it: AI, Calculated, or a person (v3.0) |
