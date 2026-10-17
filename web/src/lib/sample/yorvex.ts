/**
 * Yorvex: the software sample seller (PRD Q24, ADR-0012), from
 * docs/product/personas/yorvex.md. Everything here is fictional: the company,
 * its people, prices, partners and clients. Never put a real company's
 * catalogue, prices or clients here.
 *
 * The persona's one Subscriptions grid is split by product line, so each
 * product's Pricing tab (and the Pricing step) finds its own row. The rows
 * every product shares (minimums, support, uptime, entities, sandbox) are
 * one Editions card on Yorvex Payroll, next to the private cost to serve.
 *
 * `npm run sample` validates this against the R12 schema and writes
 * fixtures/sample/yorvex.graph.json.
 */
import {
  type Constraint,
  type DocumentRecord,
  type FeeSchedule,
  type Note,
  type Offering,
  type OfferingGraphExport,
  type Partner,
  type PriceCell,
  type Proof,
  type RateCard,
  type SourceRef,
  type TechPair,
} from "@/lib/schema";

const WS = "sample";
const AT = "2026-10-12T09:00:00+08:00";

const source = (documentId: string) => (page: number, quote?: string): SourceRef => ({ documentId, versionId: "v1", locator: { page }, quote });
const deck = source("doc_deck");
const pricing = source("doc_pricing");
const ps = source("doc_ps");
const security = source("doc_security");
const stories = source("doc_stories");
const release = source("doc_release");
const roadmap = source("doc_roadmap");
const past = source("doc_past");

function env(id: string, sources: SourceRef[] = [], via: "import" | "manual" = "import", by = "Aina") {
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

const feature = (id: string, name: string, description: string, sources: SourceRef[], status: "active" | "planned" = "active") => ({ id, name, description, status, sources });

const CLOUD: TechPair = { category: "hosting", value: "google_cloud", label: "Google Cloud" };
const APP: TechPair = { category: "mobile", value: "other", label: "iOS and Android staff app" };

const PRODUCT_LINES = ["off_shifts", "off_time", "off_payroll", "off_leave", "off_hire", "off_insights"];

const offerings: Offering[] = [
  {
    ...env("off_shifts", [deck(5)], "import", "Shalini"),
    parentId: null,
    type: "product",
    name: "Yorvex Shifts",
    summary: "Build rosters from demand, with skills, rest-hour and labour-law checks, and let staff swap shifts in the app.",
    description:
      "Shifts builds weekly or monthly rosters from a demand forecast (footfall, bed occupancy or a production plan). It only rosters people who hold the right skills and certificates, checks rest hours and weekly limits, and publishes the roster to the staff app, where people swap and pick up open shifts.",
    status: "active",
    owner: "Shalini",
    facts: { typicalLength: "3 to 6 weeks to go live", bestFor: "Hospitals, factories, retail and F&B chains with 100 or more shift workers" },
    features: [
      feature("f_sh_demand", "Demand-based rostering", "Rosters built from forecast footfall, bed occupancy or a production plan.", [deck(6)]),
      feature("f_sh_skills", "Skills and certificate rules", "Only staff with a valid certificate (for example a forklift licence or a nursing registration) can fill a shift.", [deck(7)]),
      feature("f_sh_law", "Labour-law checks", "Rest hours, weekly hour limits, rest days and public holidays by state.", [deck(7)]),
      feature("f_sh_swap", "Shift swaps and open shifts", "Staff swap or claim shifts in the app, with a manager's approval.", [deck(8)]),
      feature("f_sh_fill", "Auto-fill suggestions", "Suggests who should fill each gap, ranked by cost and fairness.", [release(3)]),
      feature("f_sh_bid", "Shift bidding", "Staff bid for preferred shifts before the roster is published.", [release(5)]),
      feature("f_sh_fatigue", "Fatigue risk score", "Flags rosters with long runs of night shifts. Roadmap, H1 2027.", [roadmap(4)], "planned"),
    ],
    technology: [CLOUD, APP],
    partnerIds: [],
  },
  {
    ...env("off_time", [deck(9)], "import", "Shalini"),
    parentId: null,
    type: "product",
    name: "Yorvex Time",
    summary: "Clock in by app, face or fingerprint, even without mobile coverage, with overtime calculated by rule.",
    description:
      "Time records attendance through the staff app (with a face match), QR codes at sites, or wall-mounted terminals. Clock-ins made without coverage sync later. Overtime, lateness and allowances are calculated by rule and flow straight to payroll.",
    status: "active",
    owner: "Shalini",
    facts: { typicalLength: "2 to 4 weeks to go live", bestFor: "Sites with poor connectivity, such as estates, warehouses and construction sites" },
    features: [
      feature("f_tm_face", "App clock-in with face match", "A selfie is matched to the employee's photo on the phone.", [deck(10)]),
      feature("f_tm_geo", "Geofence and QR site check-in", "Clock-in only counts inside the site's boundary, or after scanning the site's code.", [deck(10)]),
      feature("f_tm_offline", "Offline clock-in", "Clock-ins without coverage are stored on the phone or terminal and synced later.", [deck(11)]),
      feature("f_tm_ot", "Overtime rules", "Overtime, rest-day and public-holiday rates by grade and agreement.", [deck(11)]),
      feature("f_tm_sheets", "Project and cost-centre timesheets", "Hours booked to projects or cost centres.", [deck(12)]),
      feature("f_tm_term", "Attendance terminals", "Wall terminals with face and fingerprint, through the Attendance terminals sub-offering.", [deck(12)]),
    ],
    technology: [CLOUD, APP],
    partnerIds: ["ptn_isyarat"],
  },
  {
    ...env("off_terminals", [ps(9)], "import", "Ravi"),
    parentId: "off_time",
    type: "product",
    name: "Attendance terminals",
    summary: "Face and fingerprint terminals for sites where staff don't carry phones, installed and supported by our hardware supplier.",
    description:
      "Wall-mounted face and fingerprint terminals, bought from our supplier Sentuh Devices and resold with their installation and warranty. Clock-ins flow to Yorvex Time like any other.",
    status: "active",
    owner: "Ravi",
    facts: { bestFor: "Factories, estates and yards where staff don't carry phones" },
    features: [
      feature("f_tt_std", "Standard terminal", "Indoor wall unit, face and fingerprint, 3,000 users, works offline for 30 days.", [ps(9)]),
      feature("f_tt_out", "Outdoor terminal", "Weatherproof unit with a 4G connection, for estates and yards.", [ps(9)]),
      feature("f_tt_inst", "Installation", "Mounting, power and set-up by the supplier's technicians.", [ps(10)]),
    ],
    technology: [],
    partnerIds: ["ptn_sentuh"],
  },
  {
    ...env("off_payroll", [deck(13)], "import", "Kelvin"),
    parentId: null,
    type: "product",
    name: "Yorvex Payroll",
    summary: "Statutory payroll for Malaysia, Singapore and Indonesia, paid from what was actually worked.",
    description:
      "Payroll takes hours, overtime and allowances from Time, calculates statutory contributions and tax for each country, produces payslips in the staff app, and creates bank files and statutory returns. It handles many legal entities and currencies in one account.",
    status: "active",
    owner: "Kelvin",
    facts: { typicalLength: "4 to 8 weeks to go live, including two parallel runs", bestFor: "Employers with 50 to 10,000 staff in Malaysia, Singapore or Indonesia" },
    features: [
      feature("f_py_my", "Malaysia statutory payroll", "EPF, SOCSO, EIS, monthly tax deductions and HRDF levy, with the year-end forms.", [deck(14)]),
      feature("f_py_sg", "Singapore statutory payroll", "CPF, SDL and year-end income forms.", [deck(14)]),
      feature("f_py_id", "Indonesia statutory payroll", "BPJS contributions and PPh 21 income tax.", [deck(15)]),
      feature("f_py_ph", "Philippines statutory payroll", "SSS, PhilHealth, Pag-IBIG and income tax. Roadmap, Q2 2027, not committed.", [roadmap(2)], "planned"),
      feature("f_py_piece", "Piece-rate and productivity pay", "Pay by output (for example per tonne harvested or per piece sewn). Roadmap, Q1 2027, not committed.", [roadmap(3)], "planned"),
      feature("f_py_multi", "Multi-entity and multi-currency", "Many legal entities and currencies in one account, with consolidated reports.", [deck(15)]),
      feature("f_py_bank", "Bank files", "Bulk-payment files in the formats of the main Malaysian, Singaporean and Indonesian banks.", [deck(16)]),
      feature("f_py_slip4", "Payslips in four languages", "English, Malay, Indonesian and Chinese, in the staff app.", [release(2)]),
      feature("f_py_slipnb", "Payslips in Nepali and Bengali", "For foreign workers. Roadmap, H1 2027.", [roadmap(5)], "planned"),
      feature("f_py_audit", "Approvals and audit trail", "Two-step approval of each pay run, with a full change history.", [deck(16)]),
    ],
    technology: [CLOUD, { category: "database", value: "cloud_sql", label: "Cloud SQL" }, APP],
    partnerIds: ["ptn_isyarat", "ptn_tanjung"],
  },
  {
    ...env("off_managed", [ps(11)], "import", "Ravi"),
    parentId: "off_payroll",
    type: "service",
    name: "Managed payroll",
    summary: "Our payroll specialists run every pay cycle for you, file the statutory returns and answer employees' pay questions.",
    description: "",
    status: "active",
    owner: "Ravi",
    facts: {},
    features: [
      feature("f_mp_run", "Monthly pay run", "We collect changes, run payroll, and send it for your approval.", [ps(11)]),
      feature("f_mp_stat", "Statutory submissions", "Monthly contributions and tax filed on time.", [ps(11)]),
      feature("f_mp_ye", "Year-end forms", "Year-end tax forms for every employee.", [ps(12)]),
      feature("f_mp_desk", "Employee pay help desk", "Pay questions answered within two working days.", [ps(12)]),
    ],
    technology: [],
    partnerIds: [],
  },
  {
    ...env("off_leave", [deck(17)], "import", "Shalini"),
    parentId: null,
    type: "product",
    name: "Yorvex Leave and Claims",
    summary: "Leave policies by entity, state and grade, and expense claims with receipt capture and approval chains.",
    description: "",
    status: "active",
    owner: "Shalini",
    facts: {},
    features: [
      feature("f_lv_policy", "Leave policies", "Entitlements by entity, state, grade and length of service.", [deck(18)]),
      feature("f_lv_claims", "Expense claims", "Receipt photos, mileage and per-diem rules.", [deck(18)]),
      feature("f_lv_approve", "Approval chains", "Approvals by amount, department and delegate.", [deck(19)]),
      feature("f_lv_panel", "Clinic panel claims", "Direct billing from panel clinics. Roadmap, H2 2027.", [roadmap(6)], "planned"),
    ],
    technology: [CLOUD, APP],
    partnerIds: [],
  },
  {
    ...env("off_hire", [deck(20)], "import", "Shalini"),
    parentId: null,
    type: "product",
    name: "Yorvex Hire",
    summary: "Job posts, onboarding checklists and expiry alerts for workers' documents, in pilot with eight customers.",
    description: "",
    status: "pilot",
    owner: "Shalini",
    facts: {},
    features: [
      feature("f_hr_jobs", "Job posts", "Post to job boards and track applicants.", [deck(21)]),
      feature("f_hr_onboard", "Onboarding checklist and e-signature", "Contracts and forms signed in the app before day one.", [deck(21)]),
      feature("f_hr_docs", "Worker document tracking", "Permit, passport and medical expiry dates, with alerts 90, 60 and 30 days ahead.", [release(6)]),
      feature("f_hr_bg", "Background checks", "Through a screening provider. Roadmap, 2027.", [roadmap(6)], "planned"),
    ],
    technology: [CLOUD, APP],
    partnerIds: [],
  },
  {
    ...env("off_insights", [deck(22)], "import", "Shalini"),
    parentId: null,
    type: "product",
    name: "Yorvex Insights",
    summary: "Labour cost, overtime and absence by site and shift, with an export to the customer's own data warehouse.",
    description: "",
    status: "active",
    owner: "Shalini",
    facts: {},
    features: [
      feature("f_in_cost", "Labour cost by site and shift", "Daily cost against budget.", [deck(23)]),
      feature("f_in_trend", "Overtime and absence trends", "Trends by site, team and manager.", [deck(23)]),
      feature("f_in_head", "Headcount and turnover", "Joiners, leavers and turnover by month.", [deck(24)]),
      feature("f_in_export", "Data export", "Scheduled export to BigQuery or as files.", [deck(24)]),
    ],
    technology: [{ category: "analytics", value: "bigquery", label: "BigQuery" }],
    partnerIds: [],
  },
  {
    ...env("off_ent", [ps(3)], "import", "Ravi"),
    parentId: null,
    type: "service",
    name: "Enterprise and projects",
    summary: "Implementation, integrations, custom modules and private deployments for employers with 1,000 staff or more.",
    description:
      "The professional services team takes large employers from their old systems to Yorvex: design workshops, configuration, data migration, parallel pay runs, integrations, training and go-live support. Where the product doesn't do something yet, the team can build a custom module on the platform, priced in man-days.",
    status: "active",
    owner: "Ravi",
    facts: { typicalLength: "8 to 16 weeks", bestFor: "Employers with 1,000 to 10,000 staff and several legal entities" },
    features: [
      feature("f_en_sec", "Security and compliance", "ISO/IEC 27001 certified since 2024. An independent penetration test every year.", [security(3)]),
      feature("f_en_uptime", "Uptime commitment", "99.9% monthly uptime on Enterprise, with service credits.", [pricing(2)]),
      feature("f_en_csm", "Named success manager", "One person who owns the account after go-live.", [pricing(2)]),
    ],
    technology: [],
    partnerIds: [],
  },
  {
    ...env("off_impl", [ps(3)], "import", "Ravi"),
    parentId: "off_ent",
    type: "service",
    name: "Implementation",
    summary: "Design, configuration, data migration, two parallel runs, training and go-live support.",
    description: "",
    status: "active",
    owner: "Ravi",
    facts: {},
    features: [
      feature("f_im_design", "Design workshops", "Pay rules, rosters and approvals agreed with HR, finance and operations.", [ps(3)]),
      feature("f_im_config", "Configuration", "Entities, policies, overtime rules and approval chains set up.", [ps(3)]),
      feature("f_im_data", "Data migration from another payroll", "Employees, balances and year-to-date figures moved across.", [ps(4)]),
      feature("f_im_parallel", "Parallel runs", "Old and new payroll run side by side until the results match.", [ps(4)]),
      feature("f_im_ttt", "Train-the-trainer", "Your HR and payroll team trained to train everyone else.", [ps(5)]),
      feature("f_im_care", "Hypercare", "Close support for the first two pay runs.", [ps(5)]),
    ],
    technology: [],
    partnerIds: ["ptn_tanjung"],
  },
  {
    ...env("off_integ", [ps(6)], "import", "Ravi"),
    parentId: "off_ent",
    type: "service",
    name: "Integrations",
    summary: "Connect Yorvex to finance, HR and factory systems.",
    description: "",
    status: "active",
    owner: "Ravi",
    facts: {},
    features: [
      feature("f_ig_sso", "Single sign-on", "SAML or OpenID Connect.", [ps(6)]),
      feature("f_ig_acct", "Accounting connectors", "Connectors for popular cloud accounting packages.", [ps(6)]),
      feature("f_ig_api", "REST API and webhooks", "Read and write employees, attendance and pay results.", [ps(7)]),
      feature("f_ig_sftp", "SFTP file exchange", "Scheduled files for systems without an API.", [ps(7)]),
      feature("f_ig_gl", "General-ledger posting", "Payroll journals posted to the finance system by API or SFTP.", [ps(7)]),
    ],
    technology: [
      { category: "auth_security", value: "other", label: "SAML and OpenID Connect single sign-on" },
      { category: "integration_external", value: "other", label: "REST API, webhooks, SFTP" },
    ],
    partnerIds: [],
  },
  {
    ...env("off_custom", [ps(8)], "import", "Ravi"),
    parentId: "off_ent",
    type: "service",
    name: "Custom modules",
    summary: "Features built on the platform for one customer, before or instead of the roadmap.",
    description: "",
    status: "active",
    owner: "Ravi",
    facts: {},
    features: [
      feature("f_cm_build", "Built and maintained by Yorvex", "Designed with the customer, built on the platform and priced in man-days.", [ps(8)]),
      feature("f_cm_release", "May be released to all customers", "A custom module can later become part of the product.", [ps(8)]),
    ],
    technology: [],
    partnerIds: [],
  },
  {
    ...env("off_private", [security(6)], "import", "Ravi"),
    parentId: "off_ent",
    type: "package",
    name: "Private deployment",
    summary: "A dedicated environment for one customer, hosted by Yorvex.",
    description: "",
    status: "active",
    owner: "Ravi",
    facts: { bestFor: "Employers with 3,000 employees or more" },
    features: [
      feature("f_pd_project", "Dedicated Google Cloud project", "One environment for one customer, run by Yorvex.", [security(6)]),
      feature("f_pd_region", "Region of the customer's choice", "Malaysia or Singapore.", [security(6)]),
      feature("f_pd_keys", "Customer-managed encryption keys", "The customer holds the keys to its data.", [security(6)]),
      feature("f_pd_line", "Dedicated support line", "A direct line to the team that runs the environment.", [security(6)]),
    ],
    technology: [CLOUD],
    partnerIds: [],
  },
];

const cell = (value: string, page = 2, isCurrent?: boolean): PriceCell => ({ value, sources: [pricing(page)], ...(isCurrent ? { isCurrent } : {}) });
const EDITIONS = [
  { id: "col_ess", label: "Essentials", note: "Up to 150 employees", sources: [] },
  { id: "col_bus", label: "Business", note: "Most sold", sources: [] },
  { id: "col_ent", label: "Enterprise", note: "From 1,000 employees", sources: [] },
];

/** One product line's row of a subscriptions grid. A missing edition isn't offered. */
function subscription(id: string, offeringId: string, name: string, note: string, page: number, row: string, prices: [string | null, string | null, string | null]): RateCard {
  const [ess, bus, ent] = prices;
  return {
    ...env(id, [pricing(page)], "import", "Kelvin"),
    offeringId,
    kind: "pricing",
    name,
    note,
    columns: EDITIONS,
    rows: [{ id: "row_sub", label: row, groupLabel: "Products", sources: [] }],
    cells: {
      row_sub: {
        ...(ess ? { col_ess: cell(ess, page) } : {}),
        ...(bus ? { col_bus: cell(bus, page, true) } : {}),
        ...(ent ? { col_ent: cell(ent, page) } : {}),
      },
    },
  };
}

const MYR_NOTE = "Prices per employee per month, billed annually. Monthly billing adds 15%.";
const USD_NOTE = "For customers billed in Singapore or Indonesia. Per employee per month, billed annually.";
const myr = (offeringId: string, row: string, prices: [string | null, string | null, string | null]) =>
  subscription(`rc_${offeringId.slice(4)}_myr`, offeringId, "Subscriptions 2026", MYR_NOTE, 2, row, prices);
const usd = (offeringId: string, row: string, prices: [string | null, string | null, string | null]) =>
  subscription(`rc_${offeringId.slice(4)}_usd`, offeringId, "Regional price list 2026", USD_NOTE, 4, row, prices);

const rateCards: RateCard[] = [
  myr("off_shifts", "Yorvex Shifts", [null, "RM 6 / employee / month", "RM 5 / employee / month"]),
  usd("off_shifts", "Yorvex Shifts", [null, "USD 2.20 / employee / month", "USD 1.90 / employee / month"]),
  myr("off_time", "Yorvex Time", ["RM 3 / employee / month", "RM 5 / employee / month", "RM 4 / employee / month"]),
  usd("off_time", "Yorvex Time", ["USD 1.00 / employee / month", "USD 1.80 / employee / month", "USD 1.50 / employee / month"]),
  myr("off_payroll", "Yorvex Payroll", ["RM 6 / employee / month", "RM 9 / employee / month", "RM 7 / employee / month"]),
  usd("off_payroll", "Yorvex Payroll", ["USD 2.50 / employee / month", "USD 3.50 / employee / month", "USD 2.80 / employee / month"]),
  myr("off_leave", "Yorvex Leave and Claims", ["RM 2 / employee / month", "Included", "Included"]),
  usd("off_leave", "Yorvex Leave and Claims", ["USD 0.80 / employee / month", "Included", "Included"]),
  myr("off_hire", "Yorvex Hire", [null, "RM 450 / hiring site / month", "On quote"]),
  myr("off_insights", "Yorvex Insights", [null, "RM 2 / employee / month", "Included"]),
  usd("off_insights", "Yorvex Insights", [null, "USD 0.80 / employee / month", "Included"]),
  {
    ...env("rc_editions", [pricing(2)], "import", "Kelvin"),
    offeringId: "off_payroll",
    kind: "pricing",
    name: "Editions 2026",
    note: "Applies to every product line.",
    columns: EDITIONS,
    rows: [
      { id: "row_min", label: "Minimum monthly fee", groupLabel: "Minimums", sources: [] },
      { id: "row_min_usd", label: "Minimum monthly fee, USD price list", groupLabel: "Minimums", sources: [pricing(4)] },
      { id: "row_support", label: "Support", groupLabel: "Service", sources: [] },
      { id: "row_uptime", label: "Uptime commitment", groupLabel: "Service", sources: [] },
      { id: "row_entities", label: "Legal entities included", groupLabel: "Service", sources: [] },
      { id: "row_sandbox", label: "Sandbox environment", groupLabel: "Service", sources: [] },
    ],
    cells: {
      row_min: { col_ess: cell("RM 300 / month"), col_bus: cell("RM 1,500 / month", 2, true), col_ent: cell("RM 15,000 / month") },
      row_min_usd: { col_ess: cell("USD 90 / month", 4), col_bus: cell("USD 450 / month", 4, true), col_ent: cell("USD 4,500 / month", 4) },
      row_support: { col_ess: cell("Email, office hours"), col_bus: cell("Email and chat, office hours", 2, true), col_ent: cell("Named success manager, 24x7 for urgent issues") },
      row_uptime: { col_bus: cell("99.5% uptime", 2, true), col_ent: cell("99.9% uptime") },
      // Never a bare number: "1" would parse as RM 1 (ADR-0012 D3).
      row_entities: { col_ess: cell("1 entity"), col_bus: cell("3 entities", 2, true), col_ent: cell("10 entities") },
      row_sandbox: { col_bus: cell("Add-on", 2, true), col_ent: cell("Included") },
    },
  },
  {
    ...env("rc_cost_to_serve", [], "manual", "Kelvin"),
    offeringId: "off_payroll",
    kind: "cost",
    name: "Cost to serve 2026",
    columns: EDITIONS.map(({ id, label }) => ({ id, label, sources: [] })),
    rows: [
      { id: "row_hosting", label: "Hosting and infrastructure", sources: [] },
      { id: "row_success", label: "Support and success", sources: [] },
    ],
    cells: {
      row_hosting: {
        col_ess: { value: "RM 0.60 / employee / month", sources: [] },
        col_bus: { value: "RM 0.75 / employee / month", sources: [] },
        col_ent: { value: "RM 0.90 / employee / month", sources: [] },
      },
      row_success: {
        col_ess: { value: "RM 0.40 / employee / month", sources: [] },
        col_bus: { value: "RM 0.70 / employee / month", sources: [] },
        col_ent: { value: "RM 1.30 / employee / month", sources: [] },
      },
    },
  },
];

const feeSchedules: FeeSchedule[] = [
  {
    ...env("fs_onboarding", [ps(4)], "import", "Ravi"),
    offeringId: "off_impl",
    name: "Onboarding",
    section: "other",
    lines: [
      { id: "ln_quick", label: "Essentials quick start (remote, 2 weeks)", basis: "one_time", price: "RM 1,500", cost: "RM 600", sources: [ps(4)] },
      { id: "ln_bus_base", label: "Business implementation, base fee", basis: "one_time", price: "RM 8,000", cost: "RM 3,600", sources: [ps(4)] },
      { id: "ln_bus_emp", label: "Business implementation, per employee", basis: "per_unit", price: "RM 15 / employee", cost: "RM 6 / employee", sources: [ps(4)] },
      { id: "ln_migration", label: "Data migration from another payroll system", basis: "per_unit", price: "RM 3,500 per entity", cost: "RM 1,400", sources: [ps(4)] },
      { id: "ln_parallel", label: "Extra parallel payroll run", basis: "per_unit", price: "RM 2,500 per run", cost: "RM 1,100", sources: [ps(4)] },
      { id: "ln_training", label: "Training session (up to 15 people)", basis: "per_unit", price: "RM 1,600 / session", cost: "RM 550", sources: [ps(4)] },
      { id: "ln_ent_impl", label: "Enterprise implementation", basis: "other", price: "On quote", sources: [ps(4)] },
    ],
  },
  {
    ...env("fs_days", [ps(13)], "import", "Ravi"),
    offeringId: "off_ent",
    name: "Man-day rates",
    section: "man_days",
    lines: [
      { id: "ln_consultant", label: "Implementation consultant", basis: "daily", price: "RM 1,800", cost: "RM 820", sources: [ps(13)] },
      { id: "ln_specialist", label: "Payroll specialist", basis: "daily", price: "RM 2,200", cost: "RM 1,000", sources: [ps(13)] },
      { id: "ln_developer", label: "Integration developer", basis: "daily", price: "RM 2,000", cost: "RM 900", sources: [ps(13)] },
      { id: "ln_pm", label: "Project manager", basis: "daily", price: "RM 2,400", cost: "RM 1,050", sources: [ps(13)] },
      { id: "ln_architect", label: "Solution architect", basis: "daily", price: "RM 3,000", cost: "RM 1,350", sources: [ps(13)] },
      { id: "ln_afterhours", label: "After-hours go-live support", basis: "hourly", price: "RM 450 / hour", cost: "RM 200 / hour", sources: [ps(13)] },
    ],
  },
  {
    ...env("fs_addons", [pricing(5)], "import", "Kelvin"),
    offeringId: "off_payroll",
    name: "Add-ons",
    section: "add_ons",
    lines: [
      { id: "ln_sms", label: "SMS one-time passwords and alerts", basis: "per_unit", price: "RM 0.12 / SMS", cost: "RM 0.05 / SMS", paidTo: "Isyarat Messaging", sources: [pricing(5)] },
      { id: "ln_entity", label: "Extra legal entity", basis: "monthly", price: "RM 250 / month", sources: [pricing(5)] },
      { id: "ln_sandbox", label: "Sandbox environment (Business)", basis: "monthly", price: "RM 1,000 / month", cost: "RM 300 / month", sources: [pricing(5)] },
      { id: "ln_premium", label: "Premium support (Business)", basis: "monthly", price: "RM 2,500 / month", cost: "RM 1,100 / month", sources: [pricing(5)] },
      { id: "ln_report", label: "Custom report", basis: "per_unit", price: "RM 1,800 per report", cost: "RM 700", sources: [pricing(5)] },
    ],
  },
  {
    ...env("fs_terminals", [ps(10)], "import", "Ravi"),
    offeringId: "off_terminals",
    name: "Price list",
    section: "other",
    lines: [
      { id: "ln_std", label: "Standard terminal", basis: "per_unit", price: "RM 2,900 per unit", cost: "RM 1,850", paidTo: "Sentuh Devices", sources: [ps(10)] },
      { id: "ln_outdoor", label: "Outdoor terminal with 4G", basis: "per_unit", price: "RM 4,600 per unit", cost: "RM 3,050", paidTo: "Sentuh Devices", sources: [ps(10)] },
      { id: "ln_install", label: "Installation", basis: "per_unit", price: "RM 650 per site", cost: "RM 400", paidTo: "Sentuh Devices", sources: [ps(10)] },
      { id: "ln_care", label: "Terminal care plan", basis: "annual", price: "RM 380 / unit / year", cost: "RM 190", paidTo: "Sentuh Devices", sources: [ps(10)] },
    ],
  },
  {
    ...env("fs_managed", [ps(12)], "import", "Ravi"),
    offeringId: "off_managed",
    name: "Price list",
    section: "other",
    lines: [
      { id: "ln_payslip", label: "Monthly pay run", basis: "per_unit", price: "RM 22 / payslip, min RM 2,000", cost: "RM 9 / payslip", sources: [ps(12)] },
      { id: "ln_offcycle", label: "Off-cycle pay run", basis: "per_unit", price: "RM 1,200 per run", cost: "RM 450", sources: [ps(12)] },
      { id: "ln_yearend", label: "Year-end tax forms", basis: "per_unit", price: "RM 15 / employee", cost: "RM 5 / employee", sources: [ps(12)] },
    ],
  },
  {
    ...env("fs_custom", [ps(8)], "import", "Ravi"),
    offeringId: "off_custom",
    name: "Price list",
    section: "other",
    lines: [
      { id: "ln_build", label: "Custom module build", basis: "other", price: "On quote", sources: [ps(8)] },
      { id: "ln_maint", label: "Custom module maintenance", basis: "annual", price: "20% of the build price per year", sources: [ps(8)] },
    ],
  },
  {
    ...env("fs_private", [security(6)], "import", "Ravi"),
    offeringId: "off_private",
    name: "Price list",
    section: "other",
    lines: [
      { id: "ln_setup", label: "Environment set-up", basis: "one_time", price: "RM 45,000", cost: "RM 21,000", sources: [security(6)] },
      { id: "ln_env", label: "Dedicated environment", basis: "monthly", price: "RM 18,000 / month", cost: "RM 7,500 / month", note: "36-month minimum term", sources: [security(6)] },
    ],
  },
];

const proof: Proof[] = [
  { ...env("prf_2300", [stories(2)]), kind: "case_study", title: "A 2,300-staff electronics manufacturer runs payroll in 6 hours instead of 4 days.", body: "Three shifts, 11 overtime rules and two legal entities, live in 9 weeks.", isPublic: true, offeringIds: ["off_payroll", "off_time"] },
  { ...env("prf_nurses", [stories(4)]), kind: "case_study", title: "A hospital group rosters 1,100 nurses across three hospitals.", body: "Rosters that took a week are published in a day, with every certificate checked.", isPublic: true, offeringIds: ["off_shifts"] },
  { ...env("prf_estates", [stories(6)]), kind: "case_study", title: "Offline attendance across 14 oil palm estates in Sabah.", body: "Field workers clock in at muster points without coverage. Data syncs at the estate office.", isPublic: true, offeringIds: ["off_time", "off_terminals"] },
  { ...env("prf_fnb", [stories(8)]), kind: "testimonial", title: "“Our managers stopped building rosters in spreadsheets.”", body: "Head of HR, a 60-outlet F&B chain.", isPublic: true, offeringIds: ["off_shifts"] },
  { ...env("prf_340", [deck(2)]), kind: "metric", title: "340 companies and 61,000 employees on Yorvex each month.", body: "As of September 2026.", isPublic: true, offeringIds: PRODUCT_LINES },
  { ...env("prf_6wk", [ps(2)]), kind: "metric", title: "Business implementations average 6 weeks from kick-off to first live payroll.", body: "Across 41 implementations in 2025.", isPublic: true, offeringIds: ["off_impl"] },
  { ...env("prf_overtime", [past(31)]), kind: "metric", title: "Overtime cost down 18% in six months for a logistics company.", body: "The client hasn't approved publication.", isPublic: false, offeringIds: ["off_shifts", "off_time"] },
  { ...env("prf_9000", [past(33)]), kind: "case_study", title: "9,000 employees moved from an on-premise payroll system.", body: "A government-linked company. The client asked not to be named.", clientName: "Withheld", isPublic: false, offeringIds: ["off_impl", "off_payroll"] },
];

const constraints: Constraint[] = [
  { ...env("con_region", [deck(2)], "import", "Farhana"), kind: "region", statement: "We sell in Malaysia, Singapore and Indonesia only.", values: ["MY", "SG", "ID"], offeringIds: [] },
  { ...env("con_payroll_region", [roadmap(2)], "import", "Shalini"), kind: "region", statement: "Payroll only for employees in Malaysia, Singapore and Indonesia.", values: ["MY", "SG", "ID"], offeringIds: ["off_payroll", "off_managed"], insteadText: "Philippines payroll is on the roadmap. Don't promise a date." },
  { ...env("con_min", [pricing(2)], "import", "Kelvin"), kind: "min_deal_size", statement: "Business from RM 1,500 a month, Enterprise from RM 15,000 a month. 12-month minimum term.", values: ["1500", "15000"], offeringIds: [] },
  { ...env("con_agency", [], "manual", "Farhana"), kind: "industry", statement: "No payroll for workers employed through labour-supply agencies. Board policy since 2024: we can't verify those workers' contracts.", values: ["manpower agency", "labour supplier", "outsourcing agency"], offeringIds: [] },
  { ...env("con_onprem", [security(6)], "import", "Ravi"), kind: "scope", statement: "On-premise installation", values: ["on-premise", "on-prem", "self-hosted", "customer data centre"], offeringIds: PRODUCT_LINES, insteadText: "Private deployment: a dedicated environment hosted by Yorvex, from 3,000 employees." },
  { ...env("con_funds", [], "manual", "Kelvin"), kind: "scope", statement: "Paying salaries or holding client funds", values: ["salary disbursement", "pay on behalf", "payroll funding"], offeringIds: ["off_payroll", "off_managed"], insteadText: "Bank files for the customer's own bulk-payment service." },
  { ...env("con_erp", [ps(7)], "import", "Ravi"), kind: "integration", statement: "Direct connectors to on-premise ERPs", values: ["on-premise ERP", "legacy ERP"], offeringIds: ["off_integ"], insteadText: "SFTP file exchange, or a custom connector quoted in man-days." },
  { ...env("con_hardware", [], "manual", "Ravi"), kind: "scope", statement: "Hardware other than attendance terminals", values: ["laptops", "phones", "network"], offeringIds: ["off_terminals"] },
  { ...env("con_ip", [ps(8)], "import", "Ravi"), kind: "other", statement: "Custom modules belong to Yorvex and may be released to other customers.", values: [], offeringIds: ["off_custom"] },
];

const partners: Partner[] = [
  {
    ...env("ptn_sentuh", [ps(10)], "import", "Ravi"),
    name: "Sentuh Devices",
    relationship: "supplier",
    covers: ["Attendance terminals", "Installation", "Hardware warranty"],
    arrangement: "We buy and resell. They install and repair.",
    buyPrice: "RM 1,850 per standard terminal, RM 3,050 per outdoor terminal",
    technology: [],
    contacts: [{ name: "Wong Mei Kuan", role: "Channel manager", email: "meikuan@sentuh.example" }],
    region: "Malaysia",
  },
  {
    ...env("ptn_isyarat", [], "manual", "Kelvin"),
    name: "Isyarat Messaging",
    relationship: "vendor",
    covers: ["SMS for one-time passwords and alerts"],
    arrangement: "Pay per message, billed monthly.",
    buyPrice: "RM 0.05 / SMS",
    technology: [],
    contacts: [{ name: "Danial Hakimi", role: "Account manager", email: "danial@isyarat.example" }],
    region: "Malaysia, Singapore, Indonesia",
  },
  {
    ...env("ptn_tanjung", [], "manual", "Farhana"),
    name: "Tanjung HR Consulting",
    relationship: "partner",
    covers: ["Implementation and payroll advice in Indonesia"],
    arrangement: "They implement at their own rates. We pay them 15% of the first-year subscription on deals they refer.",
    technology: [],
    contacts: [{ name: "Dewi Lestari", role: "Managing partner", email: "dewi@tanjunghr.example" }],
    region: "Indonesia",
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
  note("nt_piece", "off_payroll", 'Piece-rate pay is planned for Q1 2027, not committed. Say "on the roadmap" and never give a date in a proposal.', "Shalini", "2026-10-09T10:30:00+08:00", true),
  note("nt_parallel", "off_ent", "Plan two parallel runs for any company above 2,000 staff. The one-run plan failed twice in 2025.", "Ravi", "2026-09-30T14:10:00+08:00"),
  note("nt_ratios", "off_shifts", "Hospital RFPs always ask about nurse-to-patient ratios. We handle them through skills rules. Say so explicitly.", "Marcus", "2026-09-24T09:45:00+08:00"),
  note("nt_seroja", "off_private", "Lost Seroja Components to a local vendor installing on-premise. Our private deployment came in about 40% higher.", "Farhana", "2026-09-12T17:20:00+08:00"),
  note("nt_claims", "off_leave", "Essentials customers who add claims usually move to Business within a year.", "Putri", "2026-08-28T11:00:00+08:00"),
];

/**
 * The documents the sample's sources cite. The R12 export doesn't carry files,
 * so "Try with sample data" creates these records alongside the import. They
 * have no stored file: the source chips need their names and page counts only.
 */
export const yorvexDocuments: DocumentRecord[] = [
  { id: "doc_deck", name: "Yorvex product deck 2026.pdf", kind: "sales_deck", pages: 32, shareable: true, offeringIds: PRODUCT_LINES },
  { id: "doc_pricing", name: "Pricing and editions 2026.pdf", kind: "rate_card", pages: 6, shareable: true, offeringIds: PRODUCT_LINES },
  { id: "doc_ps", name: "Professional services catalogue 2026.pdf", kind: "brochure", pages: 14, shareable: true, offeringIds: ["off_ent", "off_impl", "off_integ", "off_custom", "off_managed", "off_terminals"] },
  { id: "doc_security", name: "Security and compliance overview.pdf", kind: "brochure", pages: 12, shareable: true, offeringIds: ["off_ent", "off_private"] },
  { id: "doc_stories", name: "Customer stories 2026.pdf", kind: "case_study", pages: 10, shareable: true, offeringIds: ["off_shifts", "off_time", "off_payroll"] },
  { id: "doc_release", name: "Release notes, September to October 2026.pdf", kind: "other", pages: 9, shareable: false, offeringIds: ["off_shifts", "off_time", "off_payroll", "off_hire"] },
  { id: "doc_roadmap", name: "Product roadmap H1 2027.pdf", kind: "other", pages: 7, shareable: false, offeringIds: PRODUCT_LINES },
  { id: "doc_past", name: "Past RFP response, hospital group.pdf", kind: "past_proposal", pages: 46, shareable: false, offeringIds: ["off_shifts", "off_time", "off_payroll", "off_impl"] },
].map((doc) => ({ ...doc, workspaceId: WS, storagePath: "", status: "applied", uploadedBy: "Aina", uploadedAt: "2026-10-12T08:30:00+08:00" }) as DocumentRecord);

export const yorvex: OfferingGraphExport = {
  format: "flowhub.offering-graph",
  version: 1,
  exportedAt: AT,
  workspace: { name: "Yorvex Workforce", currency: "MYR", country: "MY" },
  offerings,
  rateCards,
  feeSchedules,
  proof,
  constraints,
  partners,
  notes,
};
