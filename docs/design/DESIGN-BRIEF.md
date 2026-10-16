# FlowHub: Design Brief for Claude Design

> **Superseded for the submission on 2026-10-13.** No Claude Design handoff was produced. The design source is now the mockup canvas, page "v2 · Offering-centred" (ADR-0010 D6), and PRD v3.0 sections 7.16 to 7.18 and 9. What this brief says about principles, tokens, accessibility and mock content still applies. Its screen list, the separate Proof, Constraints and Partners modules, and the Members screens do not (ADR-0009).

| | |
|---|---|
| Revision | **2 (2026-09-29): hub-first.** Replaces revision 1 (2026-09-29), which was deal-room-first. See "What changed" below |
| Give Claude Design | This brief, plus `docs/product/PRD.md` (v2.0) |
| What we need back | A handoff package, as specified in section 10. It is built directly in Tailwind CSS v4 and shadcn/ui (ADR-0004) |
| Deadline | Handoff by **2 Oct 2026** |

**What changed in revision 2**

- **FlowHub is hub-first** (PRD Q11, ADR-0008). It's the hub for everything a company sells, with an agent team built in.
  - Every signed-in screen sits in a **hub shell** with a left sidebar.
  - The home page is **Overview**.
  - The deal room becomes the **opportunity's record page**.
- **Light multi-user:** Owner, Editor and Viewer roles, with a Members screen. The UI has to make roles legible.
- **The freelancer persona is dropped.** There are three sample sellers, and the Copy-reply and marketplace flows are gone.
- **Work already done carries over.** The deal room and research brief already designed (S12 and S12b) keep their content, stage rail, claim rows, source chips, gate bar and activity log. They move into the hub shell, with a record-page header.

---

## 1. The product

FlowHub is **the hub for everything a company sells, with an agent team built in.**

**The hub.** Staff keep everything the company sells in one place: offerings, pricing, proof, constraints, partners, and the documents behind them. The UI calls this the **Catalogue**. Underneath it is a structured "offering graph" in which every item links to the page it came from.

**Agents keep the hub current.** When someone uploads a deck or a rate card, an agent extracts what's in it and proposes updates. Nothing changes until someone confirms it.

**Agents turn the hub into offers.** Each opportunity (a meeting invite, email, company URL or tender) becomes a **deal room**. There, AI agents work in **stages**, and after each stage a person reviews the result, edits it if needed, and presses a **gate** button to start the next one:

1. **Intake** identifies the prospect → *Gate A: confirm the prospect*
2. **Research** writes a brief in which every claim is cited → *Gate B: approve the brief*
3. **Fit** maps the prospect's gaps to the company's offerings, scores the opportunity, and prices it from the rate card → *Gate C: approve the fit map*
4. **Write and review** drafts the proposal as a Google Doc, and a Reviewer agent flags any claim it can't support → *Gate D: resolve flagged claims and finalise*

The work is judged in a hackathon: technical merit 40%, impact 25%, innovation 25%, UX 10%, plus a separate prize for the best UI/UX. Judges will see a **3-minute video**, and some will try the deployed app themselves.

## 2. Users and context

| User | Context | What they need from the UI |
|---|---|---|
| **Nadia**, founder of Kelapa Cloud, a 14-person cloud and data consultancy in Kuala Lumpur. **Owner** (the main demo persona) | At her desk before a discovery call, on a laptop or a 1440 px monitor | A home page that shows what needs her. Deal rooms she can trust line by line. A simple way to invite staff |
| **Arif**, solutions consultant at Kelapa Cloud. **Editor** | Keeps the catalogue current and runs most deal rooms | Fast editing (the rate card grid, extraction review) and clear gates |
| **Mei Ling**, delivery engineer at Kelapa Cloud. **Viewer** | Looks things up: "what's our Growth price?", "which case study can we cite?" | To find any offering, price or proof in seconds, read-only, without controls she can't use cluttering the screen |
| **Stoklane**, a Singapore SaaS startup | Preparing for a pilot meeting with a restaurant group | A one-page meeting brief plus a pilot proposal |
| **Karang Systems**, a Jakarta systems integrator | Responding to tenders | Requirements handled in the tender's own order, with every answer cited |
| **A hackathon judge** | Arrives cold on the URL with 5 minutes, or watches the video | To understand the value in seconds. "Try with sample data" makes them the Owner of a ready sample workspace |

**Primary canvas: 1440 × 900 desktop.** The video is recorded at 1920 × 1080. Every screen must also work at 1280, and stay usable down to 1024. On phones, only Overview, the opportunities list and the brief need to be readable, with no horizontal scrolling.

## 3. Design principles

1. **The hub is home.** Staff come to FlowHub to find out what the company sells and what needs doing. The agents are part of the hub, visible wherever they help, not a separate app.
2. **Evidence is always visible.** Every research claim, every catalogue fact and every price shows where it came from, as a small source chip that opens the source. This is the product's core promise, so make citations beautiful, not footnotes.
3. **A person holds the gate.** In a deal room it's always obvious which stage is running, what's waiting for approval, who approved what, and what pressing the gate will start. It should never feel like autopilot.
4. **A workbench, not a chat.** Use structured modules, record pages, tables, lists and maps. **Don't make chat bubbles the main interface.**
5. **Calm density.** There's a lot on screen: briefs, maps, grids, tabs. Keep it readable through hierarchy and spacing, not by hiding things.
6. **Private stays visibly private.** Cost values and proof that isn't public carry a consistent marker wherever they appear.
7. **Roles are legible.** People can see their own role. Controls they can't use are hidden, or disabled with a reason, never broken.

## 4. Brand and visual direction

- **Name:** FlowHub. Deliver a wordmark (a typographic treatment is fine) and a favicon.
- **Personality:** trustworthy, precise, quietly confident, and warm enough for small companies. Think of a well-run company's shared workbench, not a trading terminal or a consumer app.
- **Starting palette,** from the proposal document. You may change it, but say why in the handoff:

  | Role | Colour |
  |---|---|
  | Brand blue | `#1a56db` |
  | Success green | `#0f9d58` |
  | Ink | `#1a1c22` |
  | Muted | `#5b6070` |
  | Lines | `#d9dce3` |

  If you move away from it, the proposal and the deck will be restyled to match.
- **Regional:** the three demo sellers are in KL, Singapore and Jakarta. A regional touch is welcome if it's subtle. Avoid clichés.
- **Original design.** A hub with a sidebar of modules and record pages with tabs is a common pattern. FlowHub's own layout, naming and visual identity must be original. Don't model them on any existing product or portal.
- **Avoid:**
  - Google logos, Google product branding, or anything resembling Google partner badges.
  - A Material Design look-alike.
  - Purple-to-blue AI gradients, sparkle icons as decoration, emoji as icons, and chat bubbles as the main UI.

## 5. Technical constraints

The handoff must follow these so it can be built without translation.

- **Stack:** Tailwind CSS v4 and **shadcn/ui** (built on Radix). Use shadcn components wherever they fit: Sidebar, Button, Badge, Card, Table and Data Table, Tabs, Dialog, Sheet, Drawer, Popover, Tooltip, Dropdown Menu, Command, Select, Input, Textarea, Switch, Checkbox, Toggle Group, Progress, Skeleton, Toast, Resizable, Scroll Area, Empty, Alert, Avatar, Breadcrumb and the others in its catalogue. **The hub sidebar should be built on shadcn's Sidebar component.**
- **Tokens:** CSS variables in **OKLCH**, using **shadcn's variable names**:

  | Group | Variables |
  |---|---|
  | Surfaces | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground` |
  | Actions and emphasis | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive` |
  | Borders and focus | `--border`, `--input`, `--ring` |
  | Charts | `--chart-1` to `--chart-5` |
  | Sidebar | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` |
  | Shape | `--radius` |

  Provide a `:root` (light) block and a `.dark` block. **Both themes are required.**
- **Icons:** Lucide only.
- **Fonts:** Google Fonts only. Name the families and weights.
- **Accessibility: WCAG 2.1 AA.**
  - Every text and background pair used must meet contrast.
  - **Colour is never the only carrier of meaning.** Pair it with an icon, a label or a pattern.
  - Focus states are visible.
  - The sidebar and every custom interactive component are keyboard-operable.
  - The fit map has an equivalent list view.
- **Motion:** purposeful and short, with a `prefers-reduced-motion` alternative for everything that moves.

## 6. FlowHub semantic tokens

Define these in the same `:root` and `.dark` blocks, alongside shadcn's. Each takes two variables, both in OKLCH:
- `--<name>`: the strong colour, for text, icons and borders on the normal surfaces.
- `--<name>-soft`: a tinted background that `--<name>` text reads well on.

| Group | Token names | Used for |
|---|---|---|
| Stage state | `--stage-idle`, `--stage-running`, `--stage-waiting`, `--stage-approved`, `--stage-stale`, `--stage-failed` | The stage rail, stage headers, the progress log, Overview's open opportunities. *Waiting* means awaiting a person's approval. *Stale* means out of date because an earlier stage was re-run |
| Fit strength | `--fit-strong`, `--fit-partial`, `--fit-weak`, `--fit-cannot` | Fit map lines and badges, and an offering's "used in opportunities" list. *Cannot* means a constraint blocks it, and it must look distinct, not just weaker |
| Claim support | `--claim-research`, `--claim-offering`, `--claim-seller`, `--claim-neither` | Source chips and the Reviewer's claim table. *Neither* blocks finalising |
| Go/no-go | `--score-go`, `--score-consider`, `--score-nogo` | Score dial and badges (Go is 70 or above, Consider 40–69, No-go below 40) |
| Privacy | `--private` | Cost values, proof that isn't public, "never leaves your workspace" markers |
| Outcome | `--outcome-won`, `--outcome-lost` | Opportunity status badges. Other statuses stay neutral |
| Attention | `--attention` | Overview's Needs attention items, "to review" badges, pending updates, stale records |

## 7. Custom components and patterns

Give each one its anatomy, variants, every state, and its keyboard behaviour.

### Hub components

1. **Hub shell** (built on shadcn Sidebar).
   - **Sidebar:**
     - Overview
     - Opportunities
     - **Catalogue** group: Offerings, Proof, Constraints, Partners
     - Documents, with a "to review" badge
     - Settings: Workspace, Members, Usage, Recycle bin

     Each module shows its record count, and the sidebar collapses to icons.
   - **Top bar:**
     - workspace name
     - **jump-to** trigger (Ctrl/Cmd+K)
     - a compact usage meter (research runs today)
     - theme toggle
     - user menu showing the **role**
2. **Record-page pattern.** One layout shared by offerings, proof, partners, documents and opportunities:
   - breadcrumb
   - a header with name, status badge, owner, last-verified stamp (where it applies) and actions
   - **tabs**
   - an optional side rail for activity or sources

   Show how the deal room fits this pattern: the opportunity header, then the stage rail and panel as its body.
   **A layout problem to solve:** the deal room already has a vertical stage rail and a right-hand activity panel. With the hub sidebar present as well, that's four columns. Choose between collapsing the sidebar to icons on deal rooms, a horizontal stage rail, or another answer, and justify it at 1440 and 1280.
3. **Module list.** Cards by default, with a table toggle, filters and a count. Sub-offerings nest under their parent. Badges on cards for stale, pending updates, and non-public proof.
4. **Needs attention list** (Overview). Items of four types, each with one action:
   - extraction ready to review
   - opportunity waiting at a gate
   - failed run
   - stale record
5. **Agent activity feed** (Overview, and each record's Activity tab). Entries such as "Researcher finished the brief for Anjung Serai Living, started by Arif, 09:14" and "Extraction proposed 12 updates from Rate card 2026.xlsx". It shows who, what and when, and links to the result.
6. **Role-aware controls.** How a control looks when the viewer's role can't use it: hidden, or disabled with a tooltip ("Viewers can't edit. Ask an Editor"). Pick a rule and apply it everywhere. Also a small **role badge** (Owner, Editor, Viewer).
7. **Jump-to palette** (shadcn Command). Search by name across offerings, proof, partners, documents and opportunities, grouped by type, each result with its icon and status.
8. **Pending updates banner** on a record: "3 pending updates from Rate card 2026.xlsx · Review".
9. **Member list and invite form.** Name, email, role (as a select), and when they joined. An invite form takes an email and a role, with the note "FlowHub doesn't send an email. Share the link yourself". Pending invitations can be revoked. Include the "last Owner can't be removed" state.

### Deal-room and catalogue components (carried over from revision 1)

10. **Stage rail (the deal room's signature component).**
    - It shows Intake → Research → Fit → Write → Done. Each stage has a state from the stage-state tokens, and the gates sit between stages.
    - Each passed gate shows **who approved it and when.**
    - Clickable to reopen a completed stage.
11. **Progress log.** A live stream of agent steps, such as "Researcher · Reading anjungserai.example". Calm streaming, not a noisy terminal.
12. **Gate bar.** Shows what the person changed, anything still blocking, and exactly what pressing the button will start ("Research this prospect", "Continue to fit", "Write the proposal", "Finalise"). Viewers see it read-only.
13. **Claim row and source chip.** A claim is a sentence plus one or more chips. There are four kinds of chip:
    - a **web** source: domain and date
    - a **document** source: file name and page or slide
    - an **Inference** label, linking to the claims it rests on
    - a **Seller note**

    The row needs a Remove action. The brief also shows a count of dropped claims.
14. **Source drawer.** A side sheet that opens from any chip.
    - A web source shows the title, domain, date, the quoted passage and "Open original".
    - A document source shows the page, with the quoted text highlighted.
15. **Fit map.** Gaps on the left, offerings on the right, and lines between them in the fit-strength tokens.
    - A "cannot meet" gap shows the blocking constraint and "Consider partner X".
    - Editing: remove or add a gap, remap it, change its strength, add a customisation note.
    - There's an equivalent **list view** toggle.
16. **Score dial.** Shows 0 to 100 with its Go, Consider or No-go band, plus three reasons that each link to the gaps or constraints behind them.
17. **Pricing table.** Each line shows the offering, the rate card column or fee schedule line, the free-text price as written and a source chip.
    - Lines are grouped into one-time, recurring and variable, which are never summed together.
    - Values the system can't read show as **On quote**.
18. **Rate card grid editor.** Spreadsheet-like, and it lives in an offering's **Pricing tab**.
    - Columns are tiers, and rows are line items with group headings.
    - Cells hold free text, a cell can be marked "current", and each cell has a source chip on hover or focus.
    - The user can add a column or a row.
    - Keyboard: arrows move, Enter edits, Esc cancels, Tab moves on.
    - A conflict banner appears when someone else saved first.
19. **Fee schedule table.** Ordered lines with a **private cost** column and a derived margin. Rows move up and down with buttons, not dragging.
20. **Extraction review item.** One proposed entity, with its source quote and page.
    - Actions: accept, edit, reject.
    - For a re-upload, diff badges: new, changed, removed, **conflict**.
    - A feature can be moved up to a sub-offering, or down to a feature.
21. **Document status pill.** Uploaded, Reading, Extracting, Ready to review, Confirmed, Failed (with the reason and Retry), and Scanned, running OCR.
22. **Reviewer claim table.** Each claim is classified as Research, Offering, Seller or **Neither**. Rows marked Neither block finalising, and each one needs "Accept as seller statement" and "Remove".
23. **Seller picker card** for "Try with sample data", used for **three** sellers. Shows the persona, seller name, city, a one-line description and what the demo will show.
24. **Usage meter.** Today's usage against the caps, shared by the workspace: 10 research runs, 30 stage runs, 20 uploads. It includes the cap-reached state.
25. **Search Suggestions area (a compliance requirement).**
    - Google's terms require that research grounded with Google Search displays Google's **Search Suggestions** alongside it.
    - Google supplies this element as ready-made HTML and CSS, and **it must be shown unchanged**. Don't restyle it, crop it or put it behind an interaction.
    - Design a clearly labelled area for it in the brief panel (S12b).

## 8. Screens, in priority order

The full inventory and states are in PRD section 9. The requirement IDs are in PRD section 7.

**Tier 1: in the video. Design these first, in full fidelity, with every state.**

| Screen | Name | Requirements | Notes |
|---|---|---|---|
| — | **Hub shell** | FR-HUB-1, FR-HUB-4, FR-HUB-5 | The frame for everything below. Show it expanded and collapsed, and the jump-to palette |
| **S18** | Overview | FR-HUB-2 | Populated (the sample workspace with history), first run, all clear |
| **S12** | Deal room (opportunity record page) | FR-DR-1 to 5, FR-HUB-3 | Header, stage rail with who approved each gate, content panel, progress log, gate bar. Editor view and Viewer read-only view |
| S12a | Gate A: confirm the prospect | FR-INT-4 to 6 | Includes the ambiguous-prospect state |
| S12b | Research brief | FR-RES-1 to 6 | Streaming, complete, "nothing found" sections. Includes the Search Suggestions area |
| S12c | Fit map, score and pricing | FR-FIT-1 to 8 | Editing, stale warning |
| S12d | Artefact and review | FR-WRI-1, 3 to 10 | Tone picker, draft preview, claim table, blocked, finalised, **Drive permission declined** (the draft stays viewable, with Copy and a retry for "Create in Google Docs"). At Finalise, Google's consent popup appears the first time. Design the moment before it: "FlowHub will create this proposal in a 'FlowHub' folder in your Drive" |
| **S7** | Offering record page | FR-OG-2, FR-OG-13, FR-HUB-6 | Tabs: Overview, Pricing, Proof, Constraints and partners, Sources, Activity (including "used in opportunities"). Pending-updates banner. Viewer read-only |
| **S8** | Rate card editor | FR-OG-3 | Inside S7's Pricing tab |
| **S4** | Offerings module | FR-OG-1 | Cards and table, with the graph view toggle marked as a Should item |
| **S6** | Extraction review | FR-ING-5 to 7 | First upload, and a re-upload diff with conflicts |
| **S2** | Workspace setup | FR-WS-2, FR-WS-3 | The seller picker with three cards, and the "invitation found" variant |
| **S11** | New opportunity | FR-INT-1 | Paste an invite or email, add a URL or a file |
| **S3** | Opportunities module | FR-OPP-1 to 4 | With stage and next-gate columns |
| **S13** | Source drawer | FR-OG-9, FR-RES-2 | |

**Tier 2: needed for the build, in standard fidelity.**

| Screen | Name |
|---|---|
| S19 | Settings: Members (roles, invite without email, pending invitations, change role, remove, last Owner) |
| S14 | Settings: Workspace and Usage, with Drive access per user |
| S1 | Sign in |
| S5 | Documents module |
| S9 | Fee schedule editor (in S7's Pricing tab) |
| S10 | Proof, Constraints and Partners modules and records |
| S17 | Public home page and privacy page |

**Tier 3: sketch only.**

| Screen | Name |
|---|---|
| S20 | Ask the hub panel (stretch C6): a side panel with a question box and a cited answer, with record and page chips |
| S15 | Recycle bin |
| S16 | Rehearsal: voice, with a text fallback and a coaching summary |

## 9. Mock content

All of this is fictional. Use `.example` domains for sources, and don't invent real-looking news outlets.

### The three sample sellers (S2 picker)

| Seller | Persona | Location | What they sell |
|---|---|---|---|
| Kelapa Cloud | SME | Kuala Lumpur | Cloud and data consultancy: Google Cloud migration, Workspace rollout, BigQuery analytics, AI agent builds |
| Stoklane | Startup | Singapore | AI demand forecasting for restaurant chains, with Pilot, Growth and Enterprise tiers |
| Karang Systems | Enterprise | Jakarta | Systems integrator: core-system modernisation, managed services |

### Kelapa Cloud's members (S19)

| Name | Role |
|---|---|
| Nadia | Owner |
| Arif | Editor |
| Mei Ling | Viewer |

There's also one pending invitation: `ops@kelapacloud.example`, as a Viewer.

### Kelapa Cloud's Overview (S18)

**Needs attention:**
- "Rate card 2026.xlsx: 12 updates ready to review"
- "Anjung Serai Living: waiting at Gate B"
- "Workspace rollout: pricing not verified in 94 days"

**Agent activity:**

| Time | What happened |
|---|---|
| 09:14 | Researcher finished the brief for Anjung Serai Living (started by Arif) |
| 08:52 | Extraction proposed 12 updates from Rate card 2026.xlsx (uploaded by Nadia) |
| Yesterday | Writer and Reviewer finalised the proposal for a logistics prospect: 12 claims, all supported |

**Catalogue at a glance:**

| Module | Count |
|---|---|
| Offerings | 4 |
| Proof | 6 |
| Constraints | 4 |
| Partners | 1 |
| Documents | 5 |

**History:** past opportunities show 1 won and 1 lost.

### Offering record: "Google Cloud migration" (S7)

- **Overview:** status Active, owner Arif. Four features, including "Landing zone setup" and "Workload migration". Two sub-offerings: "Migration assessment" and "Managed cloud operations".
- **Activity:** used in 3 opportunities (Strong, Strong, Partial), with one won.

### Kelapa Cloud rate card: "Google Cloud migration" (S8, in the Pricing tab)

The "current" marker is on the Growth column.

| Group | Line | Essentials | Growth | Scale |
|---|---|---|---|---|
| Assess | Discovery workshop | RM 6,000 | RM 9,500 | On quote |
| Assess | Migration plan | Included | Included | Included |
| Migrate | Landing zone setup | RM 12,000 | RM 18,000 | RM 30,000 |
| Migrate | Workload migration | RM 450 / VM | RM 380 / VM, min 50 VMs | RM 300 / VM |
| Migrate | Database migration | On quote | RM 8,000 per DB | RM 6,500 per DB |
| Run | Managed support | *(empty)* | RM 4,500 / month | RM 9,000 / month |
| Run | Cloud cost review | Waived | Quarterly | Monthly |

### Kelapa Cloud fee schedule: "Workspace rollout" (S9)

Costs are private.

| Basis | Line | Price | Cost |
|---|---|---|---|
| One-time | Workspace setup and DNS | RM 3,500 | RM 1,200 |
| One-time | Migration from another suite | RM 25 / user, min RM 5,000 | RM 9 / user |
| One-time | Training session | RM 1,800 / session | RM 600 |
| Monthly | Admin support | RM 1,200 / month | RM 450 |
| Per unit | Extra data migration | RM 0.80 / GB | RM 0.20 / GB |

### Deal room example (S12)

**The prospect: Anjung Serai Living** (fictional), a home-furnishings retailer with 42 stores in Malaysia. The intake is a calendar invite: "Intro call, Anjung Serai Living, Thursday 10am". **Arif** passed Gate A at 09:12.

**Brief claims:**

| Claim | Source |
|---|---|
| "Operates 42 stores across Peninsular Malaysia" | anjungserai.example/about, 2026 |
| "Announced 8 new stores in Johor and Penang for 2027" | news.example.com, Aug 2026 |
| "Hiring a Head of E-commerce and two data analysts" | jobs.example.com, Sep 2026 |
| Technology: an e-commerce platform on self-managed servers, and a web analytics suite | anjungserai.example |
| *Inference:* "Likely needs one view of store and online sales as it expands" | Rests on claims 2 and 3 |

Two claims were dropped for lack of a source.

**Fit map:**

| Gap | Offering | Strength | Detail |
|---|---|---|---|
| Unified reporting across stores and online | Data and analytics on BigQuery | Strong | |
| Scale the e-commerce platform for peak sales | Google Cloud migration | Partial | Customisation: a hosting assessment |
| Collaboration across 42 stores | Workspace rollout | Strong | |
| In-store kiosk hardware | **Cannot meet** | | Constraint: "We don't supply or install hardware". Consider partner **Jentayu Networks** (fictional) |

**Score:** 78, **Go**.

**Claim table:** 12 claims. Seven are Research and four are Offering. One is **Neither**, "We are ISO 27001 certified", and it blocks finalising until it's removed.

## 10. What the handoff must contain (the contract)

Deliver these files. They will be saved to `docs/design/` in the repository.

| File | Contents |
|---|---|
| `HANDOFF.md` | The main document, with the sections below |
| `tokens.css` | Ready to paste. A `:root` block and a `.dark` block holding every shadcn variable from section 5 and every FlowHub token from section 6, in OKLCH, plus `--radius` |
| `assets/` | `wordmark.svg`, `favicon.svg`, and any illustrations for empty states (as SVG) |
| `screens/` | A PNG of each designed screen and state, named like `S12b-brief-streaming.png` or `S18-overview-populated.png` |

**Sections of `HANDOFF.md`:**

1. **Visual direction.** Two or three paragraphs explaining the choices, including any change from the starting palette.
2. **Tokens.** A table of every token: name, light value, dark value, what it's used for. Then:
   - the type scale: families, sizes, weights and line heights for each role
   - spacing, radius, shadow and border conventions
   - motion: durations, easings, and the reduced-motion alternatives
3. **Component inventory.** One row per component: name, **the shadcn base component and variant, or "custom"**, variants, states, and notes. For every custom component and pattern in section 7: its anatomy, states and keyboard behaviour.
4. **Screen specs,** one per screen (the hub shell, and S1 to S20 as prioritised): purpose, layout (grid, region widths at 1440 and 1280), the components used, **every state from the PRD, including the Viewer variant where it applies**, the exact UI copy, the empty, loading and error states, and how the screen responds at narrower widths.
5. **Interaction specs.** The flows in section 11 step by step, the streaming behaviour, the gate transitions, role-gated controls, and keyboard maps for the sidebar, jump-to, the grid and the fit map.
6. **Accessibility.** Contrast results for every token pair used, focus order on the hub shell and the deal room, and the list view that stands in for the fit map.
7. **Copy.** Tone of voice, and every user-facing string, including errors, empty states and role messages.
8. **Mock data used,** as JSON where possible, so the build can reuse it as fixtures.
9. **Deviations and open questions.** Anything that differs from the PRD or this brief, listed explicitly, never changed silently.

## 11. Flows to prototype

1. **Main demo (Kelapa Cloud, as Arif the Editor):**
   1. Overview (S18): "Anjung Serai Living" is waiting at Gate B.
   2. Or start fresh: New opportunity (S11), paste the invite, then Gate A (S12a) to confirm the prospect.
   3. The brief streams in (S12b). Open a source chip (S13). Remove one claim. Gate B.
   4. The fit map (S12c): change one mapping, see the cannot-meet with its partner suggestion and the score of 78. Gate C.
   5. Artefact (S12d): the Reviewer flags the ISO claim, Arif removes it, then Finalise, which shows the Doc link.
   6. Back on the "Google Cloud migration" offering (S7), the Activity tab now lists this opportunity.
2. **Judge's first run:**
   1. Sign in (S1).
   2. Workspace setup (S2): pick Kelapa Cloud.
   3. Overview (S18), then Offerings (S4), then the "Google Cloud migration" record (S7).
   4. On the Pricing tab (S8): edit one cell and add a column.
   5. Use jump-to (Ctrl+K) to open a proof item.
3. **Ingestion:**
   1. Documents (S5): upload a rate card, and watch the status pill move to "Ready to review".
   2. Extraction review (S6): accept, edit and reject items, then Confirm.
   3. Re-upload a newer version. See the pending-updates banner on the offering (S7) and the diff with one conflict (S6).
4. **Roles:**
   1. Nadia (Owner) invites Mei Ling as a Viewer (S19).
   2. Mei Ling signs in, lands on Overview, opens the deal room read-only (no gate buttons, but she can see who approved each gate), and opens the rate card read-only.
5. **Startup cut (Stoklane):**
   1. Paste a pilot meeting invite from a restaurant group.
   2. Go through the brief and the fit, ending with the **startup meeting pack**: a one-page meeting brief plus a pilot proposal, previewed, then Finalise.

## 12. Out of scope for this design

A marketing site beyond S17, native mobile apps, billing screens, multiple workspaces per user, departments or per-record permissions, and any freelancer flow.
