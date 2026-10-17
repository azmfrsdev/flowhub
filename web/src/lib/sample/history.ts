import { AuditEvent, DocumentRecord, IntakeOutput, Opportunity, Proposal, Run, type SampleSeller } from "@/lib/schema";
import { validateOperations } from "@/server/proposals/validate";
import { SAMPLES } from "./index";

/**
 * History for the sample workspaces (PRD section 10): past deals, one won and
 * one lost at least, some audit entries by the seller's fictional staff, and
 * for Olvessa two pending proposals, one from a message and one from a
 * file. Everyone and everything here is fictional.
 *
 * The past deals were closed before the deal room was used, so they have no
 * stage history. The pending proposals go through the same validator as live
 * ones when a workspace is created, so they can never disagree with the catalogue.
 */

type PastDeal = {
  id: string;
  prospect: { name: string; country: string };
  contact?: { name: string; role?: string };
  intakeType: Opportunity["intakeType"];
  source: string;
  interestedOfferingIds: string[];
  value: string;
  score: number;
  outcome: { result: "won" | "lost" | "no_decision"; reason: string; at: string; by: string };
  createdAt: string;
  createdBy: string;
};

type SeedAudit = { action: AuditEvent["action"]; entity: string; entityId: string; summary: string; byName: string; at: string };

type SeedProposal = {
  id: string;
  createdBy: string;
  createdAt: string;
  offeringIds: string[];
  summary: string;
  operations: Record<string, unknown>[];
} & ({ via: "message"; text: string; scopeOfferingId?: string } | { via: "document"; document: { id: string; name: string; kind: DocumentRecord["kind"]; summary: string; pages: string[] } });

/**
 * FR-WS-3: one deal whose intake is read and waits at Gate A, so a judge can
 * start live research in one click. The prospect is a real company, so it
 * arrives as its website only: nothing is written in its name, and the one
 * line about it is public. Research then runs live, with cited sources.
 */
type ReadyDeal = {
  id: string;
  prospect: { name: string; website: string; country: string; oneLine: string };
  interestedOfferingIds: string[];
  createdAt: string;
  createdBy: string;
};

type SampleHistory = { deals: PastDeal[]; ready?: ReadyDeal; proposals: SeedProposal[]; audit: SeedAudit[] };

const HISTORY: Record<SampleSeller, SampleHistory> = {
  "olvessa": {
    deals: [
      {
        id: "opp_teluk",
        prospect: { name: "Teluk Logistik", country: "MY" },
        contact: { name: "Hafiz Rahman", role: "IT Manager" },
        intakeType: "client_email",
        source: "Pasted",
        interestedOfferingIds: ["off_gcm", "off_gcm_ops"],
        value: "RM 96,500",
        score: 78,
        outcome: { result: "won", reason: "Chose Growth over Scale. Managed support was the deciding factor.", at: "2026-09-26T15:10:00+08:00", by: "Arif" },
        createdAt: "2026-08-18T10:00:00+08:00",
        createdBy: "Arif",
      },
      {
        id: "opp_bukit_damai",
        prospect: { name: "Bukit Damai Clinics", country: "MY" },
        intakeType: "meeting_invite",
        source: "Pasted",
        interestedOfferingIds: ["off_gcm", "off_bq"],
        value: "RM 142,000",
        score: 64,
        outcome: { result: "lost", reason: "Price. They compared our Scale tier with a cheaper lift-and-shift quote.", at: "2026-09-19T10:15:00+08:00", by: "Nadia" },
        createdAt: "2026-08-25T09:30:00+08:00",
        createdBy: "Nadia",
      },
      {
        id: "opp_pantai_rasa",
        prospect: { name: "Pantai Rasa Foods", country: "MY" },
        intakeType: "client_email",
        source: "Pasted",
        interestedOfferingIds: ["off_bq"],
        value: "RM 38,600",
        score: 71,
        outcome: { result: "no_decision", reason: "Their finance director put all projects on hold until next year.", at: "2026-10-06T17:00:00+08:00", by: "Mei Ling" },
        createdAt: "2026-09-08T14:20:00+08:00",
        createdBy: "Mei Ling",
      },
    ],
    proposals: [
      {
        id: "prop_wco",
        via: "message",
        text: "From 1 November the weekend cut-over goes up to RM 3,500 per event.",
        scopeOfferingId: "off_gcm",
        createdBy: "Mei Ling",
        createdAt: "2026-10-14T16:40:00+08:00",
        offeringIds: ["off_gcm"],
        summary: "1 change to review. Nothing is saved until you apply it.",
        operations: [
          {
            kind: "set_fee_line_price",
            evidence: "the weekend cut-over goes up to RM 3,500 per event",
            feeScheduleId: "fs_gcm_addons",
            lineId: "ln_wco",
            expectedRev: 1,
            before: "RM 3,000 per event",
            after: "RM 3,500 per event",
            effectiveFrom: "2026-11-01",
          },
        ],
      },
      {
        id: "prop_ai_onepager",
        via: "document",
        document: {
          id: "doc_ai_onepager",
          name: "AI agent build one-pager.pdf",
          kind: "brochure",
          summary: "A one-page brochure for the AI agent build: what's new in 2026, a starter price and a client result.",
          pages: [
            "Olvessa · AI agent build\nAgents for customer support and internal knowledge, built on Gemini.\nNew in 2026: a WhatsApp channel for the support agent, so customers can ask in the app they already use.\nEvery agent is tested against an agreed question set before go-live.",
            "Prices\nStarter agent (one channel, one knowledge base): RM 24,000\nLarger builds: on quote\nResult\nA 40-branch tuition centre answers 70% of parents' questions without staff, two months after launch.",
          ],
        },
        createdBy: "Arif",
        createdAt: "2026-10-15T09:20:00+08:00",
        offeringIds: ["off_ai"],
        summary: "Read 2 pages. 4 changes to review. Nothing is saved until you apply them.",
        operations: [
          { kind: "add_feature", page: 1, evidence: "a WhatsApp channel for the support agent", offeringId: "off_ai", name: "WhatsApp channel", description: "The support agent answers customers on WhatsApp, as well as on the website." },
          { kind: "add_fee_line", page: 2, evidence: "Starter agent (one channel, one knowledge base): RM 24,000", feeScheduleId: "fs_ai", expectedRev: 1, label: "Starter agent (one channel, one knowledge base)", basis: "one_time", price: "RM 24,000" },
          { kind: "add_proof", page: 2, evidence: "A 40-branch tuition centre answers 70% of parents' questions without staff", proofKind: "metric", title: "A 40-branch tuition centre answers 70% of parents' questions without staff.", body: "Two months after the support agent launched.", isPublic: true, offeringIds: ["off_ai"] },
          { kind: "link_document", evidence: "AI agent build one-pager.pdf", documentId: "doc_ai_onepager", offeringIds: ["off_ai"] },
        ],
      },
    ],
    ready: {
      id: "opp_mrdiy",
      prospect: { name: "MR D.I.Y. Group (M) Berhad", website: "mrdiy.com", country: "MY", oneLine: "Home improvement retailer with stores across Malaysia." },
      interestedOfferingIds: ["off_bq"],
      createdAt: "2026-10-15T09:40:00+08:00",
      createdBy: "Nadia",
    },
    audit: [
      { action: "create", entity: "opportunity", entityId: "opp_mrdiy", summary: "Added MR D.I.Y. from its website, for data and analytics on BigQuery.", byName: "Nadia", at: "2026-10-15T09:40:00+08:00" },
      { action: "update", entity: "rateCards", entityId: "rc_gcm", summary: "Changed a price on Packages: Workload migration · Growth: RM 400 / VM → RM 380 / VM, min 50 VMs.", byName: "Arif", at: "2026-10-02T11:20:00+08:00" },
      { action: "update", entity: "opportunity", entityId: "opp_pantai_rasa", summary: "Marked Pantai Rasa Foods as no decision: projects on hold until next year.", byName: "Mei Ling", at: "2026-10-06T17:00:00+08:00" },
      { action: "create", entity: "partners", entityId: "ptn_sempadan", summary: "Added the vendor Sempadan Security for penetration testing.", byName: "Mei Ling", at: "2026-09-22T14:05:00+08:00" },
      { action: "update", entity: "opportunity", entityId: "opp_teluk", summary: "Marked Teluk Logistik as won: RM 96,500.", byName: "Arif", at: "2026-09-26T15:10:00+08:00" },
      { action: "update", entity: "opportunity", entityId: "opp_bukit_damai", summary: "Marked Bukit Damai Clinics as lost on price.", byName: "Nadia", at: "2026-09-19T10:15:00+08:00" },
    ],
  },
  yorvex: {
    deals: [
      {
        id: "opp_pelita",
        prospect: { name: "Pelita Waris Hospitals", country: "MY" },
        intakeType: "tender_document",
        source: "Pasted",
        interestedOfferingIds: ["off_shifts", "off_time"],
        value: "RM 18,200 / month",
        score: 83,
        outcome: { result: "won", reason: "Skills rules covered nurse-to-patient ratios without custom work.", at: "2026-09-30T12:00:00+08:00", by: "Marcus" },
        createdAt: "2026-08-20T09:00:00+08:00",
        createdBy: "Marcus",
      },
      {
        id: "opp_seroja",
        prospect: { name: "Seroja Components", country: "MY" },
        intakeType: "client_email",
        source: "Pasted",
        interestedOfferingIds: ["off_payroll", "off_ent"],
        value: "RM 12,500 / month",
        score: 58,
        outcome: { result: "lost", reason: "A local vendor installed on-premise. Our private deployment came in about 40% higher.", at: "2026-09-12T17:20:00+08:00", by: "Farhana" },
        createdAt: "2026-08-12T11:15:00+08:00",
        createdBy: "Farhana",
      },
    ],
    proposals: [],
    audit: [
      { action: "update", entity: "opportunity", entityId: "opp_pelita", summary: "Marked Pelita Waris Hospitals as won: RM 18,200 / month.", byName: "Marcus", at: "2026-09-30T12:00:00+08:00" },
      { action: "update", entity: "opportunity", entityId: "opp_seroja", summary: "Marked Seroja Components as lost to an on-premise vendor.", byName: "Farhana", at: "2026-09-12T17:20:00+08:00" },
    ],
  },
  "trassoq": {
    deals: [
      {
        id: "opp_teratai",
        prospect: { name: "Teratai Mutual Assurance", country: "MY" },
        intakeType: "client_email",
        source: "Pasted",
        interestedOfferingIds: ["off_print"],
        value: "RM 6,900 / month",
        score: 80,
        outcome: { result: "won", reason: "The 30-day print audit showed the saving before they signed.", at: "2026-09-24T16:30:00+08:00", by: "Faizal" },
        createdAt: "2026-08-14T10:45:00+08:00",
        createdBy: "Faizal",
      },
      {
        id: "opp_cendana",
        prospect: { name: "Cendana Specialist Centre", country: "MY" },
        intakeType: "tender_document",
        source: "Pasted",
        interestedOfferingIds: ["off_laptops", "off_deploy", "off_delivery"],
        value: "RM 1,240,000",
        score: 61,
        outcome: { result: "lost", reason: "Lost on the delivery schedule, not on price.", at: "2026-09-22T11:30:00+08:00", by: "Kavitha" },
        createdAt: "2026-08-27T09:10:00+08:00",
        createdBy: "Kavitha",
      },
    ],
    proposals: [],
    audit: [
      { action: "update", entity: "opportunity", entityId: "opp_teratai", summary: "Marked Teratai Mutual Assurance as won: RM 6,900 / month.", byName: "Faizal", at: "2026-09-24T16:30:00+08:00" },
      { action: "update", entity: "opportunity", entityId: "opp_cendana", summary: "Marked Cendana Specialist Centre as lost on the delivery schedule.", byName: "Kavitha", at: "2026-09-22T11:30:00+08:00" },
    ],
  },
};

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** The documents to write for a sample's history, as { path, data }, checked against the sample's own catalogue. */
export function sampleHistoryDocs(seller: SampleSeller, workspaceId: string): { path: string; data: Record<string, unknown> }[] {
  const { graph, documents } = SAMPLES[seller];
  const history = HISTORY[seller];
  const base = `workspaces/${workspaceId}`;
  const docs: { path: string; data: Record<string, unknown> }[] = [];
  const idle = (at: string) => ({ state: "idle" as const, currentRunId: null, updatedAt: at });

  for (const deal of history.deals) {
    const opportunity = Opportunity.parse({
      id: deal.id,
      workspaceId,
      prospect: deal.prospect,
      ...(deal.contact ? { contact: deal.contact } : {}),
      persona: "sme",
      intakeType: deal.intakeType,
      source: deal.source,
      interestedOfferingIds: deal.interestedOfferingIds,
      value: deal.value,
      status: deal.outcome.result,
      outcome: deal.outcome,
      score: deal.score,
      recommendation: deal.score >= 70 ? "go" : deal.score >= 40 ? "consider" : "nogo",
      inputs: [],
      stages: { intake: idle(deal.createdAt), research: idle(deal.createdAt), fit: idle(deal.createdAt), write: idle(deal.createdAt) },
      rev: 1,
      createdAt: deal.createdAt,
      createdBy: deal.createdBy,
      updatedAt: deal.outcome.at,
    });
    docs.push({ path: `${base}/opportunities/${deal.id}`, data: plain(opportunity) });
  }

  if (history.ready) {
    const { id, prospect, interestedOfferingIds, createdAt, createdBy } = history.ready;
    const runId = `run_${id.replace(/^opp_/, "")}_intake`;
    const intake = IntakeOutput.parse({ persona: "sme", intakeType: "company_url", prospect, contacts: [], askingFor: [], requirements: [], budgetSignals: [], deadlines: [], needsCompany: false });
    const run = Run.parse({
      id: runId,
      stage: "intake",
      attempt: 1,
      state: "waiting",
      inputs: { upstreamRunIds: {} },
      output: intake,
      working: intake,
      approvedAt: null,
      approvedBy: null,
      startedAt: createdAt,
      startedBy: createdBy,
      lastEventAt: createdAt,
      endedAt: createdAt,
      error: null,
      metrics: null,
      rev: 0,
      schemaVersion: 1,
    });
    const opportunity = Opportunity.parse({
      id,
      workspaceId,
      prospect: { name: prospect.name, website: prospect.website, country: prospect.country },
      persona: "sme",
      intakeType: "company_url",
      source: "Company website",
      interestedOfferingIds,
      status: "new",
      inputs: [{ kind: "url", url: `https://www.${prospect.website}` }],
      stages: { intake: { state: "waiting", currentRunId: runId, updatedAt: createdAt }, research: idle(createdAt), fit: idle(createdAt), write: idle(createdAt) },
      rev: 1,
      createdAt,
      createdBy,
      updatedAt: createdAt,
    });
    docs.push({ path: `${base}/opportunities/${id}`, data: plain(opportunity) });
    docs.push({ path: `${base}/opportunities/${id}/runs/${runId}`, data: plain(run) });
  }

  for (const seed of history.proposals) {
    const file =
      seed.via === "document"
        ? DocumentRecord.parse({
            id: seed.document.id,
            workspaceId,
            name: seed.document.name,
            kind: seed.document.kind,
            offeringIds: [],
            shareable: true,
            storagePath: "",
            pages: seed.document.pages.length,
            status: "ready_to_review",
            proposalId: seed.id,
            summary: seed.document.summary,
            uploadedBy: seed.createdBy,
            uploadedAt: seed.createdAt,
          })
        : null;
    let n = 0;
    const operations = validateOperations({
      operations: seed.operations,
      graph: { ...graph, documents: [...documents, ...(file ? [file] : [])] },
      sourceText: seed.via === "message" ? seed.text : "",
      ...(seed.via === "document" ? { pages: new Map(seed.document.pages.map((text, i) => [i + 1, text])) } : {}),
      source: seed.via === "message" ? { proposalId: seed.id, locator: {}, quote: seed.text.slice(0, 400) } : { documentId: seed.document.id, locator: {} },
      requireEvidenceInSource: seed.via === "message",
      newId: () => `op_${++n}`,
    });
    const failed = operations.filter((item) => item.status !== "proposed");
    if (failed.length) throw new Error(`Sample proposal ${seed.id} fails the checks: ${failed.map((item) => item.dropReason).join("; ")}`);
    const proposal = Proposal.parse({
      id: seed.id,
      workspaceId,
      via: seed.via,
      input: seed.via === "message" ? { text: seed.text } : { documentId: seed.document.id, fileName: seed.document.name },
      ...(seed.via === "message" && seed.scopeOfferingId ? { scopeOfferingId: seed.scopeOfferingId } : {}),
      offeringIds: seed.offeringIds,
      operations,
      summary: seed.summary,
      status: "proposed",
      createdBy: seed.createdBy,
      createdAt: seed.createdAt,
    });
    docs.push({ path: `${base}/proposals/${seed.id}`, data: plain(proposal) });
    if (file) docs.push({ path: `${base}/documents/${file.id}`, data: plain(file) });
  }

  history.audit.forEach((entry, i) => {
    const event = AuditEvent.parse({ ...entry, by: `sample:${entry.byName.toLowerCase().replace(/\s+/g, "-")}` });
    docs.push({ path: `${base}/auditEvents/sample_${String(i + 1).padStart(2, "0")}`, data: plain(event) });
  });
  return docs;
}
