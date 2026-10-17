/**
 * Trassoq: the products sample seller (PRD Q24, ADR-0012), from
 * docs/product/personas/trassoq.md. Everything here is fictional: the
 * company, its people, the Taviro, Kertala and Trassoq Essentials brands,
 * prices, partners and clients. Never put a real company's catalogue, prices
 * or clients here.
 *
 * Each Taviro model is a sub-offering with its own pricing, so the persona's
 * one computing grid (and its buy-price twin) is split by model. Each model's
 * price row and buy-price row share an ID, so the Pricing tab shows the margin.
 *
 * Device prices say "per unit" where the persona writes a bare "RM 3,299", so
 * code multiplies them by a quantity and never adds one device's price to a
 * one-time total.
 *
 * `npm run sample` validates this against the R12 schema and writes
 * fixtures/sample/trassoq.graph.json.
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
} from "@/lib/schema";

const WS = "sample";
const AT = "2026-10-05T09:00:00+08:00";

const source = (documentId: string) => (page: number, quote?: string): SourceRef => ({ documentId, versionId: "v1", locator: { page }, quote });
const profile = source("doc_profile");
const taviro = source("doc_taviro");
const kertala = source("doc_kertala");
const services = source("doc_services");
const guide = source("doc_guide");
const cases = source("doc_cases");
const zones = source("doc_delivery");
const tender = source("doc_tender");

function env(id: string, sources: SourceRef[] = [], via: "import" | "manual" = "import", by = "Jason") {
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

type Model = {
  id: string;
  name: string;
  group: "Laptops" | "Desktops";
  summary: string;
  bestFor: string;
  leadTime: string;
  page: number;
  /** Spec lines, in the price list's order: [spec, value]. */
  specs: [string, string][];
  /** Sell price by volume band: 1 to 9, 10 to 49, 50 to 199, 200+. */
  prices: [string, string, string, string];
  /** PRIVATE (invariant 2): Taviro's buy price by the same bands. */
  buy: [string, string, string, string];
};

const MODELS: Model[] = [
  {
    id: "classroom",
    name: "Taviro Classroom 14",
    group: "Laptops",
    summary: "A rugged 14-inch laptop with a spill-resistant keyboard, for schools and students.",
    bestFor: "Schools and students",
    leadTime: "2 to 5 working days in the Klang Valley",
    page: 2,
    specs: [
      ["Screen", "14-inch, 1920×1080"],
      ["Processor", "Entry 8-core"],
      ["Memory", "8 GB"],
      ["Storage", "256 GB SSD"],
      ["Graphics", "Integrated"],
      ["Connectivity", "Wi-Fi 6"],
      ["Security", "Security chip"],
      ["Build", "1.5 kg, rugged, spill-resistant keyboard"],
      ["Battery", "10 hours"],
      ["Standard warranty", "1-year carry-in"],
    ],
    prices: ["RM 1,899 per unit", "RM 1,849 per unit", "RM 1,789 per unit", "On quote"],
    buy: ["RM 1,690 per unit", "RM 1,690 per unit", "RM 1,650 per unit", "RM 1,590 per unit"],
  },
  {
    id: "office",
    name: "Taviro Office 14",
    group: "Laptops",
    summary: "A light 14-inch laptop for office staff, with a fingerprint reader.",
    bestFor: "Office staff",
    leadTime: "2 to 5 working days in the Klang Valley",
    page: 2,
    specs: [
      ["Screen", "14-inch, 1920×1200"],
      ["Processor", "Mid-range 10-core"],
      ["Memory", "16 GB"],
      ["Storage", "512 GB SSD"],
      ["Graphics", "Integrated"],
      ["Connectivity", "Wi-Fi 6E"],
      ["Security", "Security chip, fingerprint reader"],
      ["Build", "1.4 kg"],
      ["Battery", "12 hours"],
      ["Standard warranty", "3-year carry-in"],
    ],
    prices: ["RM 3,299 per unit", "RM 3,199 per unit", "RM 3,099 per unit", "On quote"],
    buy: ["RM 2,890 per unit", "RM 2,890 per unit", "RM 2,840 per unit", "RM 2,760 per unit"],
  },
  {
    id: "executive",
    name: "Taviro Executive 14",
    group: "Laptops",
    summary: "A 1.1 kg 14-inch laptop with an OLED screen and 4G, for managers and travelling staff.",
    bestFor: "Managers and travelling staff",
    leadTime: "1 to 2 weeks in the Klang Valley",
    page: 3,
    specs: [
      ["Screen", "14-inch, 2880×1800 OLED"],
      ["Processor", "High-end 12-core"],
      ["Memory", "32 GB"],
      ["Storage", "1 TB SSD"],
      ["Graphics", "Integrated"],
      ["Connectivity", "Wi-Fi 7 and 4G"],
      ["Security", "Security chip, fingerprint, face sign-in"],
      ["Build", "1.1 kg"],
      ["Battery", "14 hours"],
      ["Standard warranty", "3-year on-site, next business day"],
    ],
    prices: ["RM 5,899 per unit", "RM 5,749 per unit", "RM 5,599 per unit", "On quote"],
    buy: ["RM 5,180 per unit", "RM 5,180 per unit", "RM 5,090 per unit", "RM 4,950 per unit"],
  },
  {
    id: "workstation",
    name: "Taviro Workstation 16",
    group: "Laptops",
    summary: "A 16-inch mobile workstation with discrete graphics, certified for major CAD packages.",
    bestFor: "Engineers, designers and labs",
    leadTime: "2 to 3 weeks in the Klang Valley",
    page: 3,
    specs: [
      ["Screen", "16-inch, 2560×1600"],
      ["Processor", "High-end 14-core"],
      ["Memory", "32 GB, up to 64 GB"],
      ["Storage", "1 TB SSD"],
      ["Graphics", "Discrete, 8 GB"],
      ["Connectivity", "Wi-Fi 7"],
      ["Security", "Security chip, fingerprint reader"],
      ["Build", "2.1 kg"],
      ["Battery", "8 hours"],
      ["Standard warranty", "3-year on-site, next business day"],
      ["Certified for", "Major CAD packages"],
    ],
    prices: ["RM 8,499 per unit", "RM 8,299 per unit", "RM 8,099 per unit", "On quote"],
    buy: ["RM 7,520 per unit", "RM 7,520 per unit", "RM 7,410 per unit", "RM 7,200 per unit"],
  },
  {
    id: "mini",
    name: "Taviro Mini Desktop",
    group: "Desktops",
    summary: "A compact desktop that mounts behind a monitor, for labs, counters and call centres.",
    bestFor: "Labs, counters and call centres",
    leadTime: "2 to 5 working days in the Klang Valley",
    page: 4,
    specs: [
      ["Screen", "Monitor sold separately"],
      ["Processor", "Mid-range 10-core"],
      ["Memory", "16 GB"],
      ["Storage", "512 GB SSD"],
      ["Graphics", "Integrated"],
      ["Connectivity", "Wi-Fi 6E and 2.5 Gb Ethernet"],
      ["Security", "Security chip"],
      ["Build", "1.2 kg, mounts behind a monitor"],
      ["Standard warranty", "3-year carry-in"],
    ],
    prices: ["RM 2,699 per unit", "RM 2,629 per unit", "RM 2,549 per unit", "On quote"],
    buy: ["RM 2,330 per unit", "RM 2,330 per unit", "RM 2,290 per unit", "RM 2,220 per unit"],
  },
];

const RANGE = ["off_laptops", ...MODELS.map((model) => `off_${model.id}`)];
const TOP_LEVEL = ["off_laptops", "off_printers", "off_accessories", "off_print", "off_daas", "off_deploy", "off_warranty", "off_disposal", "off_delivery"];

const offerings: Offering[] = [
  {
    ...env("off_laptops", [taviro(2)], "import", "Lina"),
    parentId: null,
    type: "product",
    name: "Business laptops and desktops",
    summary: "Taviro laptops and desktops for schools, offices, managers and engineers, in stock in Shah Alam and delivered across Malaysia.",
    description:
      "Trassoq is an authorised Taviro reseller and service centre. It keeps the five most-sold models in stock, prices them in four volume bands, and builds custom configurations to order. Every device can be imaged, enrolled and tagged before it leaves the warehouse.",
    status: "active",
    owner: "Lina",
    facts: { typicalLength: "In-stock models delivered in 2 to 5 working days in the Klang Valley", bestFor: "Organisations buying 10 to 2,000 devices at a time" },
    features: [
      feature("f_lt_custom", "Custom configurations", "More memory, larger storage or a different keyboard, built to order in 3 to 4 weeks.", [taviro(5)]),
      feature("f_lt_project", "Project pricing", "For 200 or more units, a project price through Taviro's deal registration.", [taviro(6)]),
      feature("f_lt_edu", "Education pricing", "The 50 to 199 band for schools from 20 units.", [taviro(6)]),
    ],
    technology: [],
    partnerIds: ["ptn_taviro"],
  },
  ...MODELS.map(
    (model): Offering => ({
      ...env(`off_${model.id}`, [taviro(model.page)], "import", "Lina"),
      parentId: "off_laptops",
      type: "product",
      name: model.name,
      summary: model.summary,
      description: "",
      status: "active",
      owner: "Lina",
      facts: { typicalLength: `Delivered in ${model.leadTime}`, bestFor: model.bestFor },
      features: model.specs.map(([spec, value], i) => feature(`f_${model.id}_${i + 1}`, spec, value, [taviro(model.page)])),
      technology: [],
      partnerIds: ["ptn_taviro"],
    }),
  ),
  {
    ...env("off_printers", [kertala(2)], "import", "Faizal"),
    parentId: null,
    type: "product",
    name: "Printers and multifunction devices",
    summary: "Kertala printers and multifunction devices, sold outright or placed under a managed print contract.",
    description: "",
    status: "active",
    owner: "Faizal",
    facts: { typicalLength: "In stock, delivered in 3 to 5 working days in the Klang Valley", bestFor: "Offices of 5 to 2,000 staff" },
    features: [
      feature("f_pr_m40", "Kertala M40", "Mono A4 laser, 40 pages a minute, two-sided, networked.", [kertala(3)]),
      feature("f_pr_c35", "Kertala C35", "Colour A4 multifunction: print, copy, scan to email, 35 pages a minute.", [kertala(5)]),
      feature("f_pr_c55", "Kertala C55", "Colour A3 multifunction, 55 pages a minute, optional finisher.", [kertala(7)]),
      feature("f_pr_p90", "Kertala P90", "High-volume mono A3, 90 pages a minute, for print rooms.", [kertala(9)]),
      feature("f_pr_secure", "Secure print release", "Jobs print only when the owner taps a staff card.", [kertala(10)]),
      feature("f_pr_fleet", "Fleet monitoring", "Every device reports page counts and toner levels to Trassoq.", [guide(4)]),
    ],
    technology: [],
    partnerIds: ["ptn_kertala"],
  },
  {
    ...env("off_accessories", [taviro(4)], "import", "Lina"),
    parentId: null,
    type: "product",
    name: "Accessories and peripherals",
    summary: "Taviro monitors and Trassoq Essentials docks, bags and input devices, added to laptop orders.",
    description: "",
    status: "active",
    owner: "Lina",
    facts: {},
    features: [
      feature("f_ac_m24", "Taviro 24-inch monitor", "1920×1080, height-adjustable, USB-C.", [taviro(4)]),
      feature("f_ac_m27", "Taviro 27-inch monitor", "2560×1440, height-adjustable, USB-C with charging.", [taviro(4)]),
      feature("f_ac_dock", "Trassoq Essentials USB-C dock", "Two screens, Ethernet, charging. Trassoq's own brand, 2-year warranty.", [taviro(5)]),
      feature("f_ac_bag", "Trassoq Essentials laptop backpack", "Fits 14 and 16-inch laptops.", [taviro(5)]),
      feature("f_ac_kbm", "Trassoq Essentials keyboard and mouse", "Wireless set.", [taviro(5)]),
      feature("f_ac_privacy", "Privacy filter", "For 14-inch screens.", [taviro(5)]),
    ],
    technology: [],
    partnerIds: ["ptn_taviro"],
  },
  {
    ...env("off_print", [guide(2)], "import", "Faizal"),
    parentId: null,
    type: "service",
    name: "Managed print services",
    summary: "Printers placed in your offices for a monthly fee, with toner, parts and repairs included, and a price per page.",
    description:
      "Faizal's team starts with a 30-day print audit, right-sizes the fleet, places Kertala devices, and bills a monthly rental plus the pages printed. Toner ships automatically before it runs out.",
    status: "active",
    owner: "Faizal",
    facts: { typicalLength: "Contracts of 36 or 60 months", bestFor: "Companies with 5 or more printers across one or more offices" },
    features: [
      feature("f_mp_audit", "Print audit", "30 days of page counts and a right-sizing plan before the quote.", [guide(2)]),
      feature("f_mp_toner", "Automatic toner delivery", "Toner ships when a device reports 15% left.", [guide(4)]),
      feature("f_mp_repair", "On-site repairs", "Response times by plan, parts included.", [guide(5)]),
      feature("f_mp_report", "Monthly usage report", "Pages by device, department and colour.", [guide(6)]),
    ],
    technology: [],
    partnerIds: ["ptn_kertala"],
  },
  {
    ...env("off_daas", [guide(2)]),
    parentId: null,
    type: "package",
    name: "Device-as-a-service",
    summary: "Taviro laptops and desktops for a fixed monthly fee per device, with deployment, warranty, damage cover and end-of-term disposal included.",
    description:
      "The customer pays per device per month for 24, 36 or 48 months. Trassoq deploys the devices, swaps broken ones from a spare pool, and collects and wipes them at the end of the term. The devices are financed by Trassoq's leasing partner, Cendana Leasing, after a credit check.",
    status: "active",
    owner: "Jason",
    facts: { typicalLength: "24 to 48 months", bestFor: "Companies of 25 to 2,000 staff that would rather not buy devices upfront" },
    features: [
      feature("f_ds_fee", "Fixed monthly fee", "One price per device per month for the whole term.", [guide(2)]),
      feature("f_ds_deploy", "Deployment included", "Imaging, enrolment and asset tagging included.", [guide(3)]),
      feature("f_ds_swap", "Swap from a spare pool", "A replacement device within 4 working hours in the Klang Valley.", [guide(3)]),
      feature("f_ds_refresh", "Refresh at the end of the term", "New devices, and the old ones collected and wiped.", [guide(4)]),
    ],
    technology: [],
    partnerIds: ["ptn_cendana", "ptn_payung"],
  },
  {
    ...env("off_deploy", [services(2)]),
    parentId: null,
    type: "service",
    name: "Deployment services",
    summary: "Devices imaged, enrolled, tagged and set up at the customer's desks, with the old ones collected.",
    description: "",
    status: "active",
    owner: "Jason",
    facts: {},
    features: [
      feature("f_dp_image", "Imaging and configuration", "The customer's standard image, drivers and settings loaded in our staging area.", [services(2)]),
      feature("f_dp_enrol", "Device management enrolment", "Devices enrolled in the customer's device management service before shipping.", [services(2)]),
      feature("f_dp_tag", "Asset tagging and register", "Tags and an asset register handed over.", [services(2)]),
      feature("f_dp_onsite", "On-site deployment", "Engineers set up devices at desks and move users' data.", [services(3)]),
      feature("f_dp_staged", "Staged roll-out", "Devices stored and shipped in waves to match the customer's plan.", [services(3)]),
    ],
    technology: [],
    partnerIds: ["ptn_jentayu"],
  },
  {
    ...env("off_warranty", [services(4)], "import", "Lina"),
    parentId: null,
    type: "service",
    name: "Warranty and on-site support",
    summary: "Warranty upgrades, accidental damage cover and a spare pool, repaired by Trassoq's own engineers as a Taviro service centre.",
    description: "",
    status: "active",
    owner: "Lina",
    facts: {},
    features: [
      feature("f_wr_nbd", "Next-business-day on-site upgrade", "An engineer at the desk the next business day, for three years.", [services(4)]),
      feature("f_wr_adc", "Accidental damage cover", "Drops and spills covered for three years, through Payung Assurance.", [services(4)]),
      feature("f_wr_drive", "Keep your drive", "Failed drives stay with the customer.", [services(4)]),
      feature("f_wr_spare", "Spare pool", "Spare devices kept at the customer's site.", [services(5)]),
      feature("f_wr_desk", "User help desk", "Help desk for end users, office hours. Planned for Q2 2027.", [services(5)], "planned"),
    ],
    technology: [],
    partnerIds: ["ptn_taviro", "ptn_payung"],
  },
  {
    ...env("off_disposal", [services(6)]),
    parentId: null,
    type: "service",
    name: "IT asset disposal and buy-back",
    summary: "Old devices collected, wiped with a certificate, bought back where they still have value, and recycled responsibly.",
    description: "",
    status: "active",
    owner: "Jason",
    facts: {},
    features: [
      feature("f_dz_wipe", "Certified data wipe", "A certificate per device, by serial number.", [services(6)]),
      feature("f_dz_shred", "Drive shredding on site", "For customers whose drives may not leave the building.", [services(6)]),
      feature("f_dz_buyback", "Buy-back", "Working devices bought back, priced by model, age and condition.", [services(7)]),
      feature("f_dz_recycle", "E-waste recycling", "Through a licensed recycling facility, with a certificate of recycling.", [services(7)]),
    ],
    technology: [],
    partnerIds: ["ptn_kitar"],
  },
  {
    ...env("off_delivery", [zones(1)], "import", "Ahmad"),
    parentId: null,
    type: "service",
    name: "Delivery and logistics",
    summary: "Delivery to every state, staged roll-outs, and a clear rule for sites without road access.",
    description: "",
    status: "active",
    owner: "Ahmad",
    facts: {},
    features: [
      feature("f_dl_kv", "Klang Valley", "2 to 5 working days for stock items.", [zones(1)]),
      feature("f_dl_pen", "Rest of Peninsular Malaysia", "3 to 7 working days, through the Penang and Johor Bahru branches.", [zones(1)]),
      feature("f_dl_east", "Sabah and Sarawak, main towns", "10 to 15 working days, through the Kuching and Kota Kinabalu branches.", [zones(2)]),
      feature("f_dl_interior", "Interior sites", "Quoted per site, 4 to 6 weeks. Some sites need a boat.", [zones(2)]),
      feature("f_dl_express", "Next-day express", "Klang Valley only.", [zones(3)]),
    ],
    technology: [],
    partnerIds: ["ptn_arus"],
  },
];

const cell = (value: string, sources: SourceRef[], isCurrent?: boolean): PriceCell => ({ value, sources, ...(isCurrent ? { isCurrent } : {}) });
const BANDS = [
  { id: "col_1_9", label: "1 to 9 units", sources: [] },
  { id: "col_10_49", label: "10 to 49 units", sources: [] },
  { id: "col_50_199", label: "50 to 199 units", sources: [] },
  { id: "col_200", label: "200+ units", note: "Project price", sources: [] },
];
const bandCells = (values: string[], sources: SourceRef[]) => Object.fromEntries(BANDS.map((band, i) => [band.id, cell(values[i], sources)]));

const rateCards: RateCard[] = [
  ...MODELS.flatMap((model): RateCard[] => [
    {
      ...env(`rc_${model.id}`, [taviro(2)], "import", "Melissa"),
      offeringId: `off_${model.id}`,
      kind: "pricing",
      name: "Taviro computing, October 2026",
      note: "Price per unit. Valid to 31 October 2026, or 14 days from the quote, whichever is earlier.",
      columns: BANDS,
      rows: [{ id: `row_${model.id}`, label: model.name, groupLabel: model.group, sources: [] }],
      cells: { [`row_${model.id}`]: bandCells(model.prices, [taviro(model.page)]) },
    },
    {
      ...env(`rc_${model.id}_buy`, [], "manual", "Melissa"),
      offeringId: `off_${model.id}`,
      kind: "cost",
      name: "Taviro buy prices, October 2026",
      columns: BANDS.map(({ id, label }) => ({ id, label, sources: [] })),
      rows: [{ id: `row_${model.id}`, label: model.name, sources: [] }],
      cells: { [`row_${model.id}`]: bandCells(model.buy, []) },
    },
  ]),
  {
    ...env("rc_printers", [kertala(11)], "import", "Faizal"),
    offeringId: "off_printers",
    kind: "pricing",
    name: "Kertala printers, October 2026",
    columns: [{ id: "col_buy", label: "Buy outright", sources: [] }],
    rows: [
      { id: "row_m40", label: "Kertala M40, mono A4 laser", sources: [] },
      { id: "row_c35", label: "Kertala C35, colour A4 multifunction", sources: [] },
      { id: "row_c55", label: "Kertala C55, colour A3 multifunction", sources: [] },
      { id: "row_p90", label: "Kertala P90, high-volume mono A3", sources: [] },
      { id: "row_finisher", label: "Finisher for the C55", sources: [] },
    ],
    cells: {
      row_m40: { col_buy: cell("RM 1,190 per unit", [kertala(11)]) },
      row_c35: { col_buy: cell("RM 4,350 per unit", [kertala(11)]) },
      row_c55: { col_buy: cell("RM 16,900 per unit", [kertala(11)]) },
      row_p90: { col_buy: cell("RM 28,500 per unit", [kertala(11)]) },
      row_finisher: { col_buy: cell("RM 3,200 per unit", [kertala(11)]) },
    },
  },
  {
    ...env("rc_accessories", [taviro(4)], "import", "Melissa"),
    offeringId: "off_accessories",
    kind: "pricing",
    name: "Accessories, October 2026",
    columns: [
      { id: "col_1_9", label: "1 to 9 units", sources: [] },
      { id: "col_10", label: "10+ units", sources: [] },
    ],
    rows: [
      { id: "row_m24", label: "Taviro 24-inch monitor", sources: [] },
      { id: "row_m27", label: "Taviro 27-inch monitor", sources: [] },
      { id: "row_dock", label: "Trassoq Essentials USB-C dock", sources: [] },
      { id: "row_bag", label: "Trassoq Essentials laptop backpack", sources: [] },
      { id: "row_kbm", label: "Trassoq Essentials keyboard and mouse", sources: [] },
      { id: "row_privacy", label: "Privacy filter, 14-inch", sources: [] },
    ],
    cells: {
      row_m24: { col_1_9: cell("RM 649 per unit", [taviro(4)]), col_10: cell("RM 599 per unit", [taviro(4)]) },
      row_m27: { col_1_9: cell("RM 1,099 per unit", [taviro(4)]), col_10: cell("RM 1,029 per unit", [taviro(4)]) },
      row_dock: { col_1_9: cell("RM 389 per unit", [taviro(5)]), col_10: cell("RM 349 per unit", [taviro(5)]) },
      row_bag: { col_1_9: cell("RM 129 per unit", [taviro(5)]), col_10: cell("RM 109 per unit", [taviro(5)]) },
      row_kbm: { col_1_9: cell("RM 119 per unit", [taviro(5)]), col_10: cell("RM 99 per unit", [taviro(5)]) },
      row_privacy: { col_1_9: cell("RM 159 per unit", [taviro(5)]), col_10: cell("RM 139 per unit", [taviro(5)]) },
    },
  },
  {
    ...env("rc_accessories_buy", [], "manual", "Melissa"),
    offeringId: "off_accessories",
    kind: "cost",
    name: "Accessories buy prices, October 2026",
    columns: [
      { id: "col_1_9", label: "1 to 9 units", sources: [] },
      { id: "col_10", label: "10+ units", sources: [] },
    ],
    rows: [{ id: "row_dock", label: "Trassoq Essentials USB-C dock", sources: [] }],
    cells: { row_dock: { col_1_9: cell("RM 190 per unit", []), col_10: cell("RM 190 per unit", []) } },
  },
  {
    ...env("rc_print", [guide(8)], "import", "Faizal"),
    offeringId: "off_print",
    kind: "pricing",
    name: "Managed print 2026",
    columns: [
      { id: "col_office", label: "Office", note: "A4 fleet", sources: [] },
      { id: "col_dept", label: "Department", note: "A3 fleet", sources: [] },
      { id: "col_high", label: "High volume", note: "A3, 90 pages a minute", sources: [] },
    ],
    rows: [
      { id: "row_rental", label: "Device rental", sources: [] },
      { id: "row_mono", label: "Mono page", sources: [] },
      { id: "row_colour", label: "Colour page", sources: [] },
      { id: "row_min", label: "Minimum monthly billing", sources: [] },
      { id: "row_toner", label: "Toner and parts", sources: [] },
      { id: "row_response", label: "On-site response", sources: [] },
      { id: "row_term", label: "Contract term", sources: [] },
    ],
    cells: {
      row_rental: { col_office: cell("RM 159 / month", [guide(8)]), col_dept: cell("RM 590 / month", [guide(8)]), col_high: cell("RM 1,450 / month", [guide(8)]) },
      row_mono: { col_office: cell("RM 0.035 / page", [guide(8)]), col_dept: cell("RM 0.03 / page", [guide(8)]), col_high: cell("RM 0.022 / page", [guide(8)]) },
      row_colour: { col_office: cell("RM 0.28 / page", [guide(8)]), col_dept: cell("RM 0.24 / page", [guide(8)]) },
      row_min: { col_office: cell("RM 800 / month", [guide(8)]), col_dept: cell("RM 2,500 / month", [guide(8)]), col_high: cell("RM 4,000 / month", [guide(8)]) },
      row_toner: { col_office: cell("Included", [guide(8)]), col_dept: cell("Included", [guide(8)]), col_high: cell("Included", [guide(8)]) },
      row_response: { col_office: cell("Next business day", [guide(8)]), col_dept: cell("Within 8 business hours", [guide(8)]), col_high: cell("Within 4 business hours", [guide(8)]) },
      // Never a bare number: "36" would parse as RM 36 (ADR-0012 D3).
      row_term: { col_office: cell("36 months", [guide(8)]), col_dept: cell("36 or 60 months", [guide(8)]), col_high: cell("60 months", [guide(8)]) },
    },
  },
  {
    ...env("rc_print_cost", [], "manual", "Faizal"),
    offeringId: "off_print",
    kind: "cost",
    name: "Managed print cost 2026",
    columns: [
      { id: "col_office", label: "Office", sources: [] },
      { id: "col_dept", label: "Department", sources: [] },
      { id: "col_high", label: "High volume", sources: [] },
    ],
    rows: [
      { id: "row_rental", label: "Device rental (Kertala lease)", sources: [] },
      { id: "row_mono", label: "Mono page", sources: [] },
      { id: "row_colour", label: "Colour page", sources: [] },
    ],
    cells: {
      row_rental: { col_office: cell("RM 98 / month", []), col_dept: cell("RM 380 / month", []) },
      row_mono: { col_dept: cell("RM 0.012 / page", []) },
      row_colour: { col_dept: cell("RM 0.10 / page", []) },
    },
  },
  {
    ...env("rc_daas", [guide(9)]),
    offeringId: "off_daas",
    kind: "pricing",
    name: "Device-as-a-service 2026",
    columns: [
      { id: "col_24", label: "24 months", sources: [] },
      { id: "col_36", label: "36 months", note: "Most chosen", sources: [] },
      { id: "col_48", label: "48 months", note: "Desktops only", sources: [] },
    ],
    rows: [
      { id: "row_classroom", label: "Taviro Classroom 14", groupLabel: "Per device", sources: [] },
      { id: "row_office", label: "Taviro Office 14", groupLabel: "Per device", sources: [] },
      { id: "row_executive", label: "Taviro Executive 14", groupLabel: "Per device", sources: [] },
      { id: "row_workstation", label: "Taviro Workstation 16", groupLabel: "Per device", sources: [] },
      { id: "row_mini", label: "Taviro Mini Desktop with 24-inch monitor", groupLabel: "Per device", sources: [] },
      { id: "row_imaging", label: "Imaging, enrolment and tagging", groupLabel: "Included", sources: [] },
      { id: "row_warranty", label: "3-year on-site warranty", groupLabel: "Included", sources: [] },
      { id: "row_damage", label: "Accidental damage cover", groupLabel: "Included", sources: [] },
      { id: "row_wipe", label: "End-of-term collection and certified wipe", groupLabel: "Included", sources: [] },
    ],
    cells: {
      row_classroom: { col_24: cell("RM 99 / device / month", [guide(9)]), col_36: cell("RM 72 / device / month", [guide(9)], true) },
      row_office: { col_24: cell("RM 165 / device / month", [guide(9)]), col_36: cell("RM 119 / device / month", [guide(9)], true) },
      row_executive: { col_24: cell("RM 289 / device / month", [guide(9)]), col_36: cell("RM 205 / device / month", [guide(9)], true) },
      row_workstation: { col_24: cell("RM 410 / device / month", [guide(9)]), col_36: cell("RM 295 / device / month", [guide(9)], true) },
      row_mini: { col_24: cell("RM 159 / device / month", [guide(9)]), col_36: cell("RM 115 / device / month", [guide(9)], true), col_48: cell("RM 92 / device / month", [guide(9)]) },
      row_imaging: { col_24: cell("Included", [guide(9)]), col_36: cell("Included", [guide(9)], true), col_48: cell("Included", [guide(9)]) },
      row_warranty: { col_24: cell("Included", [guide(9)]), col_36: cell("Included", [guide(9)], true), col_48: cell("Included", [guide(9)]) },
      row_damage: { col_24: cell("Add-on", [guide(9)]), col_36: cell("Included", [guide(9)], true), col_48: cell("Included", [guide(9)]) },
      row_wipe: { col_24: cell("Included", [guide(9)]), col_36: cell("Included", [guide(9)], true), col_48: cell("Included", [guide(9)]) },
    },
  },
];

const feeSchedules: FeeSchedule[] = [
  {
    ...env("fs_deploy", [services(2)]),
    offeringId: "off_deploy",
    name: "Deployment",
    section: "other",
    lines: [
      { id: "ln_image", label: "Imaging and configuration", basis: "per_unit", price: "RM 85 / device", cost: "RM 32", sources: [services(2)] },
      { id: "ln_enrol", label: "Device management enrolment", basis: "per_unit", price: "RM 35 / device", cost: "RM 12", sources: [services(2)] },
      { id: "ln_tag", label: "Asset tagging and register", basis: "per_unit", price: "RM 8 / device", cost: "RM 3", sources: [services(2)] },
      { id: "ln_onsite_kv", label: "On-site deployment, Klang Valley", basis: "per_unit", price: "RM 65 / device, min RM 1,500", cost: "RM 28", sources: [services(3)] },
      { id: "ln_onsite_out", label: "On-site deployment, outside the Klang Valley", basis: "per_unit", price: "RM 95 / device, min RM 2,500", cost: "RM 45", sources: [services(3)] },
      { id: "ln_transfer", label: "User data transfer from the old device", basis: "per_unit", price: "RM 120 / device", cost: "RM 50", sources: [services(3)] },
      { id: "ln_collect", label: "Old device collection", basis: "per_unit", price: "RM 25 / device", cost: "RM 10", sources: [services(3)] },
    ],
  },
  {
    ...env("fs_days", [services(3)]),
    offeringId: "off_deploy",
    name: "Man-day rates",
    section: "man_days",
    lines: [
      { id: "ln_field", label: "Field engineer", basis: "daily", price: "RM 900", cost: "RM 380", sources: [services(3)] },
      { id: "ln_senior", label: "Senior engineer", basis: "daily", price: "RM 1,400", cost: "RM 600", sources: [services(3)] },
      { id: "ln_pm", label: "Project manager", basis: "daily", price: "RM 1,800", cost: "RM 820", sources: [services(3)] },
      { id: "ln_survey", label: "Site survey", basis: "per_unit", price: "RM 1,200 per site", cost: "RM 500", sources: [services(3)] },
    ],
  },
  {
    ...env("fs_warranty", [services(4)], "import", "Lina"),
    offeringId: "off_warranty",
    name: "Warranty and support",
    section: "other",
    lines: [
      { id: "ln_nbd", label: "3-year next-business-day on-site upgrade, laptops", basis: "per_unit", price: "RM 349 per device", cost: "RM 210", paidTo: "Taviro", sources: [services(4)] },
      { id: "ln_ext5", label: "5-year extended warranty, desktops", basis: "per_unit", price: "RM 420 per device", cost: "RM 260", paidTo: "Taviro", sources: [services(4)] },
      { id: "ln_adc", label: "Accidental damage cover, 3 years", basis: "per_unit", price: "RM 289 per device", cost: "RM 165", paidTo: "Payung Assurance", sources: [services(4)] },
      { id: "ln_kyd", label: "Keep your drive", basis: "per_unit", price: "RM 120 per device", cost: "RM 70", paidTo: "Taviro", sources: [services(4)] },
      { id: "ln_spare", label: "Spare pool management", basis: "monthly", price: "RM 450 / month", cost: "RM 180", sources: [services(5)] },
    ],
  },
  {
    ...env("fs_disposal", [services(6)]),
    offeringId: "off_disposal",
    name: "Disposal and buy-back",
    section: "other",
    lines: [
      { id: "ln_wipe", label: "Certified data wipe", basis: "per_unit", price: "RM 30 / device", cost: "RM 11", sources: [services(6)] },
      { id: "ln_shred", label: "Drive shredding on site", basis: "per_unit", price: "RM 15 / drive", cost: "RM 7", sources: [services(6)] },
      { id: "ln_ewaste", label: "E-waste collection and recycling", basis: "per_unit", price: "RM 1.20 / kg, min RM 300", cost: "RM 0.55 / kg", paidTo: "Kitar Sentosa Recovery", sources: [services(7)] },
      { id: "ln_buyback", label: "Buy-back of working devices", basis: "other", price: "On quote", sources: [services(7)] },
      { id: "ln_cert", label: "Certificate of destruction", basis: "other", price: "Included", sources: [services(7)] },
    ],
  },
  {
    ...env("fs_delivery", [zones(1)], "import", "Ahmad"),
    offeringId: "off_delivery",
    name: "Delivery",
    section: "other",
    lines: [
      { id: "ln_kv_free", label: "Klang Valley, orders above RM 5,000", basis: "per_unit", price: "Waived", sources: [zones(1)] },
      { id: "ln_kv", label: "Klang Valley, smaller orders", basis: "per_unit", price: "RM 80 per drop", cost: "RM 35", sources: [zones(1)] },
      { id: "ln_pen", label: "Rest of Peninsular Malaysia", basis: "per_unit", price: "RM 180 per drop", cost: "RM 95", sources: [zones(1)] },
      { id: "ln_east", label: "Sabah and Sarawak, main towns", basis: "per_unit", price: "RM 480 per drop", cost: "RM 310", paidTo: "Arus Freight", sources: [zones(2)] },
      { id: "ln_interior", label: "Sabah and Sarawak, interior sites", basis: "other", price: "On quote", paidTo: "Arus Freight", sources: [zones(2)] },
      { id: "ln_express", label: "Next-day express, Klang Valley", basis: "per_unit", price: "RM 250 per drop", cost: "RM 120", sources: [zones(3)] },
      { id: "ln_storage", label: "Staging and storage after 4 weeks", basis: "per_unit", price: "RM 3 / device / week", cost: "RM 1", sources: [zones(3)] },
    ],
  },
];

const proof: Proof[] = [
  { ...env("prf_sarawak", [cases(2)]), kind: "case_study", title: "1,850 laptops imaged and delivered to 62 schools in Sarawak in five weeks.", body: "Staged through the Kuching branch, with interior sites delivered by river.", isPublic: true, offeringIds: ["off_laptops", "off_deploy", "off_delivery"] },
  { ...env("prf_lab", [cases(4)]), kind: "case_study", title: "A university swapped 1,200 lab PCs over one semester break.", body: "Old PCs wiped with certificates and 40% bought back.", isPublic: true, offeringIds: ["off_mini", "off_deploy", "off_disposal"] },
  { ...env("prf_daas", [cases(6)]), kind: "case_study", title: "A 300-staff engineering firm moved to device-as-a-service with no upfront cost.", body: "36-month term, with Workstation 16s for its design team.", isPublic: true, offeringIds: ["off_daas"] },
  { ...env("prf_print", [cases(8)]), kind: "metric", title: "Print spend down 27% in the first year for a 600-staff insurer.", body: "After a print audit cut the fleet from 74 devices to 41.", isPublic: true, offeringIds: ["off_print"] },
  { ...env("prf_nbd", [profile(9)]), kind: "metric", title: "97.8% of on-site warranty calls fixed by the next business day in 2025.", body: "Across 6,400 calls.", isPublic: true, offeringIds: ["off_warranty"] },
  { ...env("prf_20yr", [profile(2)]), kind: "metric", title: "20 years in business, 2,100 active accounts, five branches.", body: "As of October 2026.", isPublic: true, offeringIds: TOP_LEVEL },
  { ...env("prf_bank", [tender(88)]), kind: "case_study", title: "4,000 devices wiped with certificates for a bank's refresh.", body: "The client asked not to be named.", clientName: "Withheld", isPublic: false, offeringIds: ["off_disposal"] },
  { ...env("prf_hospital", [tender(91)]), kind: "testimonial", title: "“Every one of the 420 PCs arrived before the deadline.”", body: "A procurement officer at a state hospital. Government clients can't endorse suppliers, so it is for internal use only.", isPublic: false, offeringIds: ["off_mini", "off_delivery"] },
];

const constraints: Constraint[] = [
  { ...env("con_region", [profile(2)], "import", "Lina"), kind: "region", statement: "Malaysia only. No export or cross-border delivery.", values: ["MY"], offeringIds: [] },
  { ...env("con_min", [], "manual", "Lina"), kind: "min_deal_size", statement: "RM 1,000 minimum order.", values: ["1000"], offeringIds: [] },
  { ...env("con_validity", [taviro(2)], "import", "Melissa"), kind: "other", statement: "Hardware prices are valid for 14 days from the quote, or to the end of the month, whichever is earlier.", values: ["14 days"], offeringIds: [], insteadText: "For 200+ units, Taviro's deal registration can hold a project price for up to 60 days." },
  { ...env("con_marketplace", [], "manual", "Vincent"), kind: "industry", statement: "No sales to online marketplace sellers or exporters. Taviro's reseller agreement forbids it.", values: ["marketplace seller", "parallel export", "grey market"], offeringIds: [] },
  { ...env("con_daas_min", [guide(2)]), kind: "min_deal_size", statement: "Device-as-a-service from 25 devices, for organisations trading at least two years, after Cendana Leasing's credit check.", values: ["25"], offeringIds: ["off_daas"], insteadText: "Outright purchase with a warranty upgrade." },
  { ...env("con_print_min", [guide(2)], "import", "Faizal"), kind: "min_deal_size", statement: "Managed print from 5 devices or RM 800 a month.", values: ["5", "800"], offeringIds: ["off_print"], insteadText: "Printers bought outright." },
  { ...env("con_interior", [zones(2)], "import", "Ahmad"), kind: "scope", statement: "Fixed delivery dates to interior sites in Sabah and Sarawak", values: ["interior", "river", "boat access", "no road access", "longhouse"], offeringIds: ["off_delivery"], insteadText: "Quoted per site, with 4 to 6 weeks' lead time, staged through the nearest branch." },
  { ...env("con_network", [services(3)]), kind: "scope", statement: "Network cabling and Wi-Fi installation", values: ["network", "cabling", "Wi-Fi", "access points"], offeringIds: ["off_deploy"], insteadText: "Partner Jentayu Networks quotes the customer directly.", partnerId: "ptn_jentayu" },
  { ...env("con_software", [], "manual", "Lina"), kind: "scope", statement: "Software licences and application support", values: ["licences", "software", "application support"], offeringIds: ["off_laptops"], insteadText: "Customers buy licences from their software provider." },
  { ...env("con_wide", [], "manual", "Faizal"), kind: "scope", statement: "Wide-format and production printing presses", values: ["wide-format", "plotter", "production press"], offeringIds: ["off_printers"] },
];

const partners: Partner[] = [
  {
    ...env("ptn_taviro", [taviro(1)], "import", "Melissa"),
    name: "Taviro",
    relationship: "supplier",
    covers: ["Laptops, desktops and monitors", "Warranty upgrades"],
    arrangement: "Authorised reseller and service centre. A monthly price list linked to the US dollar. Deal registration for 200+ units.",
    buyPrice: "The buy-price card, with deal registration a further 3% to 6% off",
    technology: [],
    contacts: [{ name: "Kenneth Soo", role: "Channel manager", email: "kenneth@taviro.example" }],
    region: "Malaysia",
  },
  {
    ...env("ptn_kertala", [kertala(2)], "import", "Faizal"),
    name: "Kertala",
    relationship: "supplier",
    covers: ["Printers and multifunction devices", "Toner and parts"],
    arrangement: "Authorised dealer and service partner. Device lease for managed print at a fixed monthly rate.",
    buyPrice: "Device lease from RM 98 / month (A4) and RM 380 / month (A3)",
    technology: [],
    contacts: [{ name: "Nurul Izzati", role: "Partner manager", email: "izzati@kertala.example" }],
    region: "Malaysia",
  },
  {
    ...env("ptn_cendana", [], "manual", "Jason"),
    name: "Cendana Leasing",
    relationship: "partner",
    covers: ["Financing for device-as-a-service"],
    arrangement: "Cendana buys the devices from Trassoq and leases them to the customer. Trassoq is paid in full on delivery. A credit check comes first.",
    buyPrice: "Funding rate 6.8% a year",
    technology: [],
    contacts: [{ name: "Harith Zainal", role: "Relationship manager", email: "harith@cendana.example" }],
    region: "Malaysia",
  },
  {
    ...env("ptn_payung", [], "manual", "Lina"),
    name: "Payung Assurance",
    relationship: "vendor",
    covers: ["Accidental damage cover"],
    arrangement: "Trassoq sells the cover. Payung pays the claims.",
    buyPrice: "RM 165 per device for 3 years",
    technology: [],
    contacts: [{ name: "Siti Mariam", role: "Bancassurance lead", email: "mariam@payung.example" }],
    region: "Malaysia",
  },
  {
    ...env("ptn_kitar", [], "manual", "Jason"),
    name: "Kitar Sentosa Recovery",
    relationship: "vendor",
    covers: ["Licensed e-waste recycling", "Certificates of recycling"],
    arrangement: "Collected from Trassoq's warehouse every two weeks.",
    buyPrice: "RM 0.55 / kg",
    technology: [],
    contacts: [{ name: "Raj Kumar", role: "Operations", email: "raj@kitarsentosa.example" }],
    region: "Peninsular Malaysia",
  },
  {
    ...env("ptn_arus", [], "manual", "Ahmad"),
    name: "Arus Freight",
    relationship: "vendor",
    covers: ["Freight to Sabah and Sarawak, including interior sites"],
    arrangement: "Per drop, booked a week ahead.",
    buyPrice: "RM 310 per drop to main towns",
    technology: [],
    contacts: [{ name: "Agnes Ting", role: "East Malaysia desk", email: "agnes@arus.example" }],
    region: "Sabah, Sarawak",
  },
  {
    ...env("ptn_jentayu", [], "manual", "Jason"),
    name: "Jentayu Networks",
    relationship: "partner",
    covers: ["Network cabling and Wi-Fi installation"],
    arrangement: "Referral. They quote the customer directly.",
    technology: [],
    contacts: [{ name: "Aiman Rosli", role: "Project lead", email: "aiman@jentayu.example" }],
    region: "Peninsular Malaysia",
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
  note("nt_quarter", "off_laptops", "Taviro moves prices at quarter end when the ringgit weakens. Never re-send a quote older than 14 days. Re-run pricing.", "Melissa", "2026-10-03T09:15:00+08:00", true),
  note("nt_kapit", "off_delivery", "Kota Kinabalu to interior schools: allow three extra weeks. Two sites near Kapit need a boat.", "Ahmad", "2026-09-26T16:40:00+08:00"),
  note("nt_hospital", "off_laptops", "Lost the state hospital PC tender in September on delivery schedule, not price. The winner promised 21 days. We said 35.", "Kavitha", "2026-09-22T11:30:00+08:00"),
  note("nt_colour", "off_print", "Customers underestimate colour volume by about 40%. Always run the 30-day print audit before quoting.", "Faizal", "2026-09-15T10:05:00+08:00"),
  note("nt_36", "off_daas", "The 36-month term wins most deals. Offer 24 months only when the finance director wants a short commitment.", "Jason", "2026-09-08T15:50:00+08:00"),
  note("nt_kyd", "off_warranty", "Universities ask for keep-your-drive in every tender now. Price it in by default.", "Lina", "2026-08-30T09:20:00+08:00"),
];

/**
 * The documents the sample's sources cite. The R12 export doesn't carry files,
 * so "Try with sample data" creates these records alongside the import. They
 * have no stored file: the source chips need their names and page counts only.
 */
export const trassoqDocuments: DocumentRecord[] = [
  { id: "doc_profile", name: "Company profile and references 2026.pdf", kind: "sales_deck", pages: 24, shareable: true, offeringIds: TOP_LEVEL },
  { id: "doc_taviro", name: "Taviro sell price list, October 2026.pdf", kind: "rate_card", pages: 6, shareable: true, offeringIds: [...RANGE, "off_accessories"] },
  { id: "doc_kertala", name: "Kertala range brochure 2026.pdf", kind: "brochure", pages: 12, shareable: true, offeringIds: ["off_printers"] },
  { id: "doc_services", name: "Services price list 2026.pdf", kind: "rate_card", pages: 8, shareable: true, offeringIds: ["off_deploy", "off_warranty", "off_disposal"] },
  { id: "doc_guide", name: "Managed print and device-as-a-service guide.pdf", kind: "brochure", pages: 10, shareable: true, offeringIds: ["off_print", "off_daas"] },
  { id: "doc_cases", name: "Case studies 2026.pdf", kind: "case_study", pages: 10, shareable: true, offeringIds: ["off_laptops", "off_deploy", "off_print", "off_daas"] },
  { id: "doc_delivery", name: "Delivery zones and lead times.pdf", kind: "other", pages: 3, shareable: false, offeringIds: ["off_delivery"] },
  { id: "doc_tender", name: "Past tender response, state education laptops 2025.pdf", kind: "past_proposal", pages: 140, shareable: false, offeringIds: ["off_laptops", "off_deploy", "off_delivery"] },
].map((doc) => ({ ...doc, workspaceId: WS, storagePath: "", status: "applied", uploadedBy: "Jason", uploadedAt: "2026-10-05T08:30:00+08:00" }) as DocumentRecord);

export const trassoq: OfferingGraphExport = {
  format: "flowhub.offering-graph",
  version: 1,
  exportedAt: AT,
  workspace: { name: "Trassoq Hardware", currency: "MYR", country: "MY" },
  offerings,
  rateCards,
  feeSchedules,
  proof,
  constraints,
  partners,
  notes,
};
