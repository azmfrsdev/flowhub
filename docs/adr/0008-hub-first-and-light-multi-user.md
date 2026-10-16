---
status: accepted
date: 2026-09-29
deciders: FlowHub maintainers
---

# ADR-0008: Hub-first product, light multi-user, and no freelancer persona

## Context and problem statement

PRD v1.0 framed FlowHub as a **deal room first**:
- the opportunity was the home screen
- the offering graph was a set-up area behind it
- each workspace had one user
- there were four personas, including a freelancer

The maintainers' intended product is **hub-first**. A company's staff have a hub holding everything about what the company sells, and the agent team works inside that hub, grounded in it. Three product decisions on 2026-09-29 (PRD Q11 to Q13) made this the direction:

- **Q11: hub-first.** The deal room becomes the opportunity's record page inside the hub.
- **Q12: drop the freelancer persona.** A one-person business has no staff hub.
- **Q13: light multi-user.** Three roles per workspace.

This ADR records the architectural consequences. The engine is unchanged: offering graph, stages and gates, grounding, pricing rules, Cloud Tasks and Agent Runtime (ADR-0001 to ADR-0007).

## Decision drivers

- **Match the intended product** without reopening the engine, 19 days before submission.
- **Keep the trust invariants intact** as more people use a workspace.
- **Roles are enforced on the server,** consistent with ADR-0005 D4 (server-only writes).
- **The least new infrastructure.** No email service, no role engine, no per-field security.
- **Fresh-project rule.** The hub pattern is generic. The layout, naming, design system and code are all designed and built fresh.

## Decision outcome

### D1. Hub-first information architecture

- **Every signed-in screen sits in a hub shell** (PRD FR-HUB-1):
  - a left sidebar with Overview, Opportunities, Catalogue (Offerings, Proof, Constraints, Partners), Documents and Settings, each with record counts
  - a top bar with jump-to, usage and the user's role
- **One record-page pattern** (FR-HUB-3) serves offerings, proof, partners, documents and opportunities: a header, tabs, and a side rail. **The deal room is the opportunity's record page.**
- **Overview is the home page** (FR-HUB-2): needs attention, open opportunities, agent activity, and the catalogue at a glance. It's a working dashboard, not a portfolio map. The graph view (FR-OG-12) stays a toggle inside the Offerings module.
- **"Catalogue" is the UI name for the offering graph.** The data model and the pitch still use "offering graph".

### D2. Light multi-user: three roles, enforced on the server

**Roles and permissions:**

| Action | Owner | Editor | Viewer |
|---|---|---|---|
| Read everything in the workspace (catalogue, documents, deal rooms, sources) | ✓ | ✓ | ✓ |
| Edit the catalogue, upload, confirm extractions | ✓ | ✓ | |
| Create opportunities, pass gates, edit `working`, finalise, record outcomes | ✓ | ✓ | |
| Start any agent run (and so use the caps) | ✓ | ✓ | |
| Ask the hub (C6, when built) | ✓ | ✓ | ✓ |
| Workspace settings, members, reset, delete | ✓ | | |

**Data added to ADR-0005's layout:**

```
users/{uid}                          { workspaceId }                        server-written; the user may read their own
workspaces/{ws}/members/{uid}        { role, email, addedBy, addedAt }      server-written; members may read
invitations/{id}                     { workspaceId, email, role, invitedBy,
                                       createdAt, acceptedAt, revokedAt }    server only
```

**Enforcement:**
- **Security rules:**
  - Reading `workspaces/{ws}/**` requires a `members/{request.auth.uid}` document in that workspace. The role doesn't matter for reading.
  - A user may read their own `users/{uid}` document.
  - `invitations/**` and `system/**` can't be read from a client.
  - No client can write anywhere (unchanged, ADR-0005 D4).
- **Every server action** loads the caller's member document and checks the role against the table above before doing anything. The check is one function, `requireRole(ws, uid, minRole)`, and it is covered by tests.
- **Agents never check roles.** They are only started by a server action that has already checked. Runs record `startedBy`, and gates record `approvedBy` (ADR-0005), which gives the attribution FR-MEM-5 needs.

**Invitations (FR-MEM-2):**
- An Owner creates an invitation (the email is stored in lower case). **No email is sent.**
- At sign-in, the server looks up unaccepted, unrevoked invitations for the account's verified Google email.
  - If there's one and the user has no workspace, the server creates the member document and `users/{uid}`, and marks the invitation accepted.
  - If the user already has a workspace, FR-MEM-3's choice applies: replace a sample workspace, or decline.
- **One workspace per user** (`users/{uid}.workspaceId`) keeps every query and rule simple. Multiple workspaces per user would be a later change.

**Caps and Drive stay as they were:**
- **Caps** (FR-CAP-1) stay per workspace and are shared by all members.
- **Drive access** is per user (ADR-0007). The Doc is created in the Drive of whoever finalises, and the opportunity stores its link for everyone.

### D3. Cost visibility within a workspace

| Option | Pros | Cons |
|---|---|---|
| **A. Every member can see cost in the pricing editors. Cost never reaches agents, artefacts, snippets or shared exports** | No schema change. The rules stay "members read". Fits an internal company hub | Viewers see cost |
| B. Move cost into separate documents that only Owners and Editors can read | Viewers can't see cost | Splits fee-schedule lines across two documents (against ADR-0001 D3's one-document design), and needs role-aware rules and two listeners per editor |

**Chosen: A** (PRD Q13). Cost privacy in CLAUDE.md rule 2 was always about cost leaving the company (agents and artefacts). That rule is unchanged. If per-role cost hiding is ever needed, B is the path, as a new ADR.

### D4. The freelancer persona is removed

This amends ADR-0005 and ADR-0006:
- **Persona values:** `sme`, `startup`, `enterprise`. `freelancer` is removed.
- **Intake types:** `meeting_invite`, `client_email`, `company_url`, `tender_document`. `marketplace_brief` is removed.
- **Writing:** `WriteOutput.reply` (the freelancer reply) and the freelancer template are removed. The remaining templates are SME and enterprise (shared) and startup.
- **The eval set** becomes 4 SME, 3 startup and 3 enterprise opportunities.

### D5. Where agents show up in the hub

The agents stay the ADR-0006 pipelines. They become visible across the hub, not only in the deal room:

- **Extraction.** An upload's proposals appear as "to review" in Documents and in the Overview's Needs attention list. A re-upload's diff shows as pending updates on the affected records (FR-HUB-6).
- **Agent activity.** The Overview's activity feed reads recent run documents and extraction statuses. No new data is needed.
- **Used in opportunities** (FR-OG-13). Each offering's Activity tab lists the approved fit runs that reference it. This is a query on `graphRefs` in approved fit runs, or a small denormalised list written when a gate is approved, decided at build time.
- **Ask the hub** (C6, stretch). It is a new `ask` pipeline in the same ADK app, using the existing chunk retrieval (ADR-0001 D7) and the Pricing selection path (ADR-0006 D3), with citations to records and pages. Its answers aren't stored as runs unless saved. That is decided if it gets built.

## Consequences

**Good**

- **Matches the intended product,** and fits the Future of Work and Enterprise Productivity theme more directly: a company's staff working from one grounded source.
- **The engine is untouched.** Every earlier ADR stays valid, except the specific amendments above.
- **Roles need no new infrastructure:** one member document, one server-side check, and read rules based on membership.
- **Attribution comes almost free** from `startedBy` and `approvedBy`, which ADR-0005 already records.

**Bad**

- **More UI scope:** the shell, Overview, the record-page pattern, and the Members screen. PRD section 15 sets the order for cutting if the schedule slips.
- **The design already started in Claude Design** needs a new shell. The deal-room content itself carries over.
- **Viewers can see cost** (D3 A). That's acceptable for an internal hub, and recorded here so it isn't forgotten.
- **Invitations without email** mean the Owner has to tell people the link. That's acceptable for the hackathon.

## Confirmation

- **Rules tests in the emulator:**
  - a non-member can't read the workspace
  - Viewers, Editors and Owners can all read it
  - nobody can write from a client
  - `invitations/**` can't be read from a client
- **Server tests** for `requireRole`: a Viewer can't start a run, pass a gate, upload or edit, and an Editor can't manage members.
- **End to end:** an Owner invites a second account as Viewer. It signs in, lands on the workspace's Overview, and sees no edit controls. It is then promoted to Editor and can pass a gate.

## More information

- **Amended by [ADR-0009](0009-offering-centred-hub-and-ask-or-tell.md) (2026-10-13):** the Catalogue modules become tabs on each offering page (D1), members and roles are deferred for the submission (D2), and Ask or tell replaces the stretch `ask` pipeline (D5).
- PRD v2.0: sections 3.2, 4, 7.14, 7.15, 9 and 14 (Q11 to Q14).
- **Amends:**
  - ADR-0005: persona and intake-type values; adds `users`, `members` and `invitations`.
  - ADR-0006: the freelancer template and reply are removed; an `ask` pipeline is added as a stretch item.
