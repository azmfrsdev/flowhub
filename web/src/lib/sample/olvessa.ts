/**
 * Olvessa: the services sample seller, one of three in "Try with sample
 * data" with Yorvex (software) and Trassoq (products) (PRD Q24,
 * ADR-0012). Everything here is fictional: the company, its people, prices,
 * clients and partners. Never put a real company's catalogue, prices or
 * clients here.
 *
 * `npm run sample` validates this against the R12 schema and writes
 * fixtures/sample/olvessa.graph.json.
 */
import {
  type Constraint,
  type DocumentRecord,
  type FeeSchedule,
  type Note,
  type Offering,
  type OfferingGraphExport,
  type Partner,
  type Proof,
  type RateCard,
  type SourceRef,
} from "@/lib/schema";

const WS = "sample";
const AT = "2026-10-02T09:00:00+08:00";

const deck = (page: number, quote?: string): SourceRef => ({ documentId: "doc_deck", versionId: "v1", locator: { page }, quote });
const cases = (page: number, quote?: string): SourceRef => ({ documentId: "doc_cases", versionId: "v1", locator: { page }, quote });
const past = (page: number, quote?: string): SourceRef => ({ documentId: "doc_past", versionId: "v1", locator: { page }, quote });

function env(id: string, sources: SourceRef[] = [], via: "import" | "manual" = "import", by = "Nadia") {
  return {
    id,
    workspaceId: WS,
    rev: 1,
    provenance: { via, confirmedBy: by, confirmedAt: AT },
    sources,
    restricted: false,
    deletedAt: null,
    deleteBatchId: null,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: by,
  };
}

const offerings: Offering[] = [
  {
    ...env("off_gcm", [deck(4)]),
    parentId: null,
    type: "service",
    name: "Google Cloud migration",
    summary: "Move workloads from your own servers or another cloud, with a landing zone, migration waves and managed support.",
    description:
      "We move workloads from your own servers, or from another cloud, to Google Cloud. We start with a discovery workshop, set up a secure landing zone, migrate in planned waves, and can run the platform for you afterwards.",
    status: "active",
    owner: "Nadia",
    facts: { typicalLength: "6 to 12 weeks, then optional managed support", bestFor: "Retail, logistics and healthcare companies with 20 to 200 servers" },
    features: [
      { id: "f_lz", name: "Landing zone setup", description: "Networking, identity and billing guardrails, ready for the first workloads.", status: "active", sources: [deck(5)] },
      { id: "f_wm", name: "Workload migration", description: "Virtual machines moved in planned waves, each with a rollback plan.", status: "active", sources: [deck(5)] },
      { id: "f_dbm", name: "Database migration", description: "Databases moved to managed services, with a tested cut-over.", status: "active", sources: [deck(6)] },
      { id: "f_ccr", name: "Cloud cost review", description: "A usage and commitments review after go-live.", status: "active", sources: [], provenance: { via: "manual", confirmedBy: "Arif", confirmedAt: "2026-09-28T10:00:00+08:00" } },
    ],
    technology: [
      { category: "hosting", value: "google_cloud", label: "Google Cloud" },
      { category: "database", value: "cloud_sql", label: "Cloud SQL" },
      { category: "ci_cd", value: "cloud_build", label: "Cloud Build" },
    ],
    partnerIds: ["ptn_jentayu", "ptn_sempadan"],
  },
  {
    ...env("off_gcm_assess", [deck(4)]),
    parentId: "off_gcm",
    type: "service",
    name: "Migration assessment",
    summary: "A fixed-scope review of what to move, in what order, and what it will cost to run.",
    description: "",
    status: "active",
    facts: {},
    features: [],
    technology: [],
    partnerIds: [],
  },
  {
    ...env("off_gcm_ops", [deck(7)]),
    parentId: "off_gcm",
    type: "service",
    name: "Managed cloud operations",
    summary: "We run the platform after migration: monitoring, patching and monthly cost reviews.",
    description: "",
    status: "active",
    facts: {},
    features: [],
    technology: [],
    partnerIds: [],
  },
  {
    ...env("off_bq", [deck(11), cases(3)]),
    parentId: null,
    type: "service",
    name: "Data and analytics on BigQuery",
    summary: "One reporting layer for sales, stock and online data, with dashboards managers actually use.",
    description:
      "We bring sales, stock and online-shop data into BigQuery and build the dashboards store and operations managers use every morning.",
    status: "active",
    owner: "Nadia",
    facts: { typicalLength: "4 to 8 weeks", bestFor: "Retailers and service chains with many outlets" },
    features: [
      { id: "f_rf", name: "Reporting foundation", description: "Sales, stock and online data in one BigQuery dataset.", status: "active", sources: [deck(11)] },
      { id: "f_sd", name: "Store-level sales dashboard", description: "Daily sales by store and category, refreshed before trading opens.", status: "active", sources: [deck(12)] },
      { id: "f_pl", name: "Data pipelines", description: "Scheduled loads from tills, the online shop and spreadsheets.", status: "active", sources: [deck(12)] },
      { id: "f_tr", name: "Manager training", description: "Hands-on sessions so managers can answer their own questions.", status: "active", sources: [deck(12)] },
    ],
    technology: [
      { category: "analytics", value: "bigquery", label: "BigQuery" },
      { category: "analytics", value: "looker_studio", label: "Looker Studio" },
    ],
    partnerIds: [],
  },
  {
    ...env("off_ws", [deck(9)], "import", "Arif"),
    parentId: null,
    type: "package",
    name: "Workspace rollout",
    summary: "Move a company onto Google Workspace: setup and DNS, mailbox migration, training and admin support.",
    description: "",
    status: "active",
    owner: "Arif",
    facts: { typicalLength: "2 to 4 weeks", bestFor: "Companies of 20 to 500 staff" },
    features: [
      { id: "f_dns", name: "Setup and DNS", description: "Domains, users and security settings.", status: "active", sources: [deck(9)] },
      { id: "f_mail", name: "Mailbox migration", description: "Mail, calendars and contacts from another suite.", status: "active", sources: [deck(9)] },
      { id: "f_drive", name: "File migration", description: "Shared drives set up and files moved.", status: "active", sources: [deck(9)] },
      { id: "f_train", name: "Training", description: "Sessions for staff and administrators.", status: "active", sources: [deck(10)] },
      { id: "f_admin", name: "Admin support", description: "Monthly help desk for your administrators.", status: "active", sources: [deck(10)] },
    ],
    technology: [{ category: "collaboration", value: "google_workspace", label: "Google Workspace" }],
    partnerIds: ["ptn_jentayu"],
  },
  {
    ...env("off_ai", [deck(13)]),
    parentId: null,
    type: "service",
    name: "AI agent build",
    summary: "Agents for customer support and internal knowledge, built on Gemini and tested before go-live.",
    description: "",
    status: "active",
    owner: "Nadia",
    facts: { typicalLength: "6 to 10 weeks" },
    features: [
      { id: "f_kb", name: "Knowledge assistant", description: "Answers staff questions from your own documents, with sources.", status: "active", sources: [deck(13)] },
      { id: "f_cs", name: "Support agent", description: "Handles common customer questions and hands over to a person.", status: "active", sources: [deck(13)] },
      { id: "f_eval", name: "Evaluation before go-live", description: "A test set agreed with you, run before every release.", status: "active", sources: [deck(14)] },
    ],
    technology: [],
    partnerIds: [],
  },
];

const cell = (value: string, page = 7, isCurrent?: boolean) => ({ value, sources: [deck(page)], ...(isCurrent ? { isCurrent } : {}) });

const rateCards: RateCard[] = [
  {
    ...env("rc_gcm", [deck(7)]),
    offeringId: "off_gcm",
    kind: "pricing",
    name: "Packages",
    note: "Rate card 2026",
    columns: [
      { id: "col_ess", label: "Essentials", sources: [] },
      { id: "col_gro", label: "Growth", note: "Most sold", sources: [] },
      { id: "col_sca", label: "Scale", sources: [] },
    ],
    rows: [
      { id: "row_dw", label: "Discovery workshop", groupLabel: "Assess", sources: [] },
      { id: "row_mp", label: "Migration plan", groupLabel: "Assess", sources: [] },
      { id: "row_lz", label: "Landing zone setup", groupLabel: "Migrate", sources: [] },
      { id: "row_wm", label: "Workload migration", groupLabel: "Migrate", sources: [] },
      { id: "row_dbm", label: "Database migration", groupLabel: "Migrate", sources: [] },
      { id: "row_ms", label: "Managed support", groupLabel: "Run", sources: [] },
      { id: "row_ccr", label: "Cloud cost review", groupLabel: "Run", sources: [] },
    ],
    cells: {
      row_dw: { col_ess: cell("RM 6,000"), col_gro: cell("RM 9,500", 7, true), col_sca: cell("On quote") },
      row_mp: { col_ess: cell("Included"), col_gro: cell("Included", 7, true), col_sca: cell("Included") },
      row_lz: { col_ess: cell("RM 12,000"), col_gro: cell("RM 18,000", 7, true), col_sca: cell("RM 30,000") },
      row_wm: { col_ess: cell("RM 450 / VM"), col_gro: cell("RM 380 / VM, min 50 VMs", 7, true), col_sca: cell("RM 300 / VM") },
      row_dbm: { col_ess: cell("On quote"), col_gro: cell("RM 8,000 per DB", 7, true), col_sca: cell("RM 6,500 per DB") },
      row_ms: { col_gro: cell("RM 4,500 / month", 7, true), col_sca: cell("RM 9,000 / month") },
      row_ccr: { col_ess: cell("Waived"), col_gro: cell("Quarterly", 7, true), col_sca: cell("Monthly") },
    },
  },
  {
    ...env("rc_gcm_cost", [], "manual"),
    offeringId: "off_gcm",
    kind: "cost",
    name: "Delivery cost 2026",
    columns: [
      { id: "col_ess", label: "Essentials", sources: [] },
      { id: "col_gro", label: "Growth", sources: [] },
      { id: "col_sca", label: "Scale", sources: [] },
    ],
    rows: [
      { id: "row_dw", label: "Discovery workshop", sources: [] },
      { id: "row_lz", label: "Landing zone setup", sources: [] },
    ],
    cells: {
      row_dw: { col_ess: { value: "RM 2,900", sources: [] }, col_gro: { value: "RM 4,100", sources: [] } },
      row_lz: { col_ess: { value: "RM 6,300", sources: [] }, col_gro: { value: "RM 9,800", sources: [] }, col_sca: { value: "RM 16,400", sources: [] } },
    },
  },
];

const feeSchedules: FeeSchedule[] = [
  {
    ...env("fs_gcm_days", [], "manual"),
    offeringId: "off_gcm",
    name: "Man-day rates",
    section: "man_days",
    lines: [
      { id: "ln_con", label: "Consultant", basis: "daily", price: "RM 2,400", cost: "RM 1,100", sources: [] },
      { id: "ln_sen", label: "Senior consultant", basis: "daily", price: "RM 3,200", cost: "RM 1,500", sources: [] },
      { id: "ln_arc", label: "Solution architect", basis: "daily", price: "RM 4,000", cost: "RM 1,900", sources: [] },
    ],
  },
  {
    ...env("fs_gcm_addons", [past(15)]),
    offeringId: "off_gcm",
    name: "Add-ons",
    section: "add_ons",
    lines: [
      { id: "ln_xdm", label: "Extra data migration", basis: "per_unit", price: "RM 0.80 / GB", cost: "RM 0.20 / GB", sources: [past(15)] },
      { id: "ln_wco", label: "Weekend cut-over", basis: "per_unit", price: "RM 3,000 per event", cost: "RM 1,200", sources: [past(15)] },
      { id: "ln_pt", label: "Penetration test", basis: "other", price: "On quote", cost: "RM 8,000", paidTo: "Sempadan Security", sources: [past(17)] },
    ],
  },
  {
    ...env("fs_ws", [deck(10)], "import", "Arif"),
    offeringId: "off_ws",
    name: "Price list",
    section: "other",
    lines: [
      { id: "ln_dns", label: "Workspace setup and DNS", basis: "one_time", price: "RM 3,500", cost: "RM 1,200", sources: [deck(10)] },
      { id: "ln_mig", label: "Migration from another suite", basis: "per_unit", price: "RM 25 / user, min RM 5,000", cost: "RM 9 / user", sources: [deck(10)] },
      { id: "ln_trn", label: "Training session", basis: "per_unit", price: "RM 1,800 / session", cost: "RM 600", sources: [deck(10)] },
      { id: "ln_adm", label: "Admin support", basis: "monthly", price: "RM 1,200 / month", cost: "RM 450", sources: [deck(10)] },
    ],
  },
  {
    ...env("fs_bq", [deck(11)]),
    offeringId: "off_bq",
    name: "Price list",
    section: "other",
    lines: [
      { id: "ln_rf", label: "Reporting foundation", basis: "one_time", price: "On quote", sources: [deck(11)] },
      { id: "ln_dash", label: "Dashboard build", basis: "per_unit", price: "RM 2,800 per dashboard", cost: "RM 1,100", sources: [deck(12)] },
      { id: "ln_btr", label: "Training session", basis: "per_unit", price: "RM 1,800 / session", cost: "RM 600", sources: [deck(12)] },
    ],
  },
  {
    ...env("fs_ai", [deck(13)]),
    offeringId: "off_ai",
    name: "Price list",
    section: "other",
    lines: [{ id: "ln_ai", label: "Agent build", basis: "one_time", price: "On quote", sources: [deck(13)] }],
  },
];

const proof: Proof[] = [
  { ...env("prf_120vm", [cases(2)]), kind: "case_study", title: "A retail chain moved 120 VMs in 9 weeks.", body: "Two migration waves, no unplanned downtime during trading hours.", isPublic: true, offeringIds: ["off_gcm"] },
  { ...env("prf_31pct", [cases(5)]), kind: "metric", title: "Hosting cost down 31% for a logistics firm.", body: "Measured over the first six months after migration.", isPublic: true, offeringIds: ["off_gcm"] },
  { ...env("prf_bank", [past(12)]), kind: "case_study", title: "Core banking data migration.", body: "The client asked not to be named.", clientName: "Withheld", isPublic: false, offeringIds: ["off_gcm"] },
  { ...env("prf_sameday", [cases(3)]), kind: "metric", title: "Same-day reporting for a 30-store retailer.", body: "Weekly reporting that took three days now lands the same morning.", isPublic: true, offeringIds: ["off_bq"] },
  { ...env("prf_clinic", [cases(6)]), kind: "case_study", title: "A clinic group sees bookings and revenue in one dashboard.", body: "The client asked not to be named in marketing.", isPublic: false, offeringIds: ["off_bq"] },
  { ...env("prf_450", [cases(7)]), kind: "case_study", title: "450 staff moved to Google Workspace over one weekend.", body: "Mail, calendars and shared drives, with training the following week.", isPublic: true, offeringIds: ["off_ws"] },
];

const constraints: Constraint[] = [
  { ...env("con_hw", [deck(16)]), kind: "scope", statement: "Hardware supply or installation", values: ["hardware", "kiosk", "network", "cabling"], offeringIds: ["off_gcm", "off_ws"], insteadText: "Partner Jentayu Networks covers network and hardware installation.", partnerId: "ptn_jentayu" },
  { ...env("con_pt", [past(17)]), kind: "scope", statement: "Penetration testing", values: ["penetration test", "security test"], offeringIds: ["off_gcm"], insteadText: "Vendor Sempadan Security, resold on quote.", partnerId: "ptn_sempadan" },
  { ...env("con_code", [], "manual"), kind: "scope", statement: "Application code changes", values: [], offeringIds: ["off_gcm"], insteadText: "Quoted separately, in man-days." },
  { ...env("con_region", [deck(16)]), kind: "region", statement: "Malaysia and Singapore only.", values: ["MY", "SG"], offeringIds: [] },
  { ...env("con_min", [deck(16)]), kind: "min_deal_size", statement: "RM 20,000 minimum per engagement.", values: ["20000"], offeringIds: [] },
  { ...env("con_ind", [deck(17)]), kind: "industry", statement: "No work for tobacco or gambling companies.", values: ["tobacco", "gambling"], offeringIds: [] },
];

const partners: Partner[] = [
  {
    ...env("ptn_jentayu", [past(17)]),
    name: "Jentayu Networks",
    relationship: "partner",
    covers: ["Network and hardware supply and installation"],
    arrangement: "Referral. They quote the client directly.",
    technology: [],
    contacts: [{ name: "Aiman Rosli", role: "Project lead", email: "aiman@jentayu.example", phone: "+60 12-000 0142" }],
    region: "Peninsular Malaysia",
  },
  {
    ...env("ptn_sempadan", [], "manual", "Arif"),
    name: "Sempadan Security",
    relationship: "vendor",
    covers: ["Penetration testing before go-live"],
    arrangement: "We buy and resell. Our price: on quote.",
    buyPrice: "RM 8,000 per test",
    technology: [],
    contacts: [{ name: "Lim Wei Han", role: "Account manager", email: "weihan@sempadan.example", phone: "+60 12-000 0187" }],
  },
];

const note = (id: string, offeringId: string, text: string, by: string, at: string, pinned = false): Note => ({
  id,
  workspaceId: WS,
  offeringId,
  text,
  pinned,
  by: by.toLowerCase(),
  byName: by,
  at,
  provenance: { via: "manual", confirmedBy: by, confirmedAt: at },
  deletedAt: null,
});

const notes: Note[] = [
  note("nt_peak", "off_gcm", "Retail clients keep asking how we handle sale-day peaks. Worth packaging a peak-load assessment as its own sub-offering.", "Nadia", "2026-10-10T16:20:00+08:00", true),
  note("nt_3wk", "off_gcm", "Growth landing zones take about 3 weeks in practice. Don't promise 2.", "Arif", "2026-10-02T11:05:00+08:00"),
  note("nt_teluk", "off_gcm", "Teluk Logistik chose Growth over Scale because managed support was the deciding factor.", "Arif", "2026-09-28T15:40:00+08:00"),
  note("nt_lost", "off_gcm", "Lost Bukit Damai Clinics on price. They compared our Scale tier with a cheaper lift-and-shift quote.", "Nadia", "2026-09-19T10:15:00+08:00"),
];

/**
 * The documents the sample's sources cite. The R12 export doesn't carry files,
 * so "Try with sample data" creates these records alongside the import. They
 * have no stored file: the source chips need their names and page counts only.
 */
export const olvessaDocuments: DocumentRecord[] = [
  { id: "doc_deck", name: "Sales deck 2026.pdf", kind: "sales_deck", pages: 18, shareable: true, offeringIds: ["off_gcm", "off_bq", "off_ws", "off_ai"] },
  { id: "doc_cases", name: "Case studies 2025.pdf", kind: "case_study", pages: 8, shareable: true, offeringIds: ["off_gcm", "off_bq", "off_ws"] },
  { id: "doc_past", name: "Past proposal, Teluk Logistik.pdf", kind: "past_proposal", pages: 20, shareable: false, offeringIds: ["off_gcm"] },
].map((doc) => ({ ...doc, workspaceId: WS, storagePath: "", status: "applied", uploadedBy: "Nadia", uploadedAt: "2026-10-02T08:30:00+08:00" }) as DocumentRecord);

export const olvessa: OfferingGraphExport = {
  format: "flowhub.offering-graph",
  version: 1,
  exportedAt: AT,
  workspace: { name: "Olvessa Cloud", currency: "MYR", country: "MY" },
  offerings,
  rateCards,
  feeSchedules,
  proof,
  constraints,
  partners,
  notes,
};
