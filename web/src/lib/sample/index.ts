import { type DocumentRecord, type OfferingGraphExport, type SampleSeller, Workspace } from "@/lib/schema";
import { yorvex, yorvexDocuments } from "./yorvex";
import { olvessa, olvessaDocuments } from "./olvessa";
import { trassoq, trassoqDocuments } from "./trassoq";
import { withSourceQuotes } from "./quotes";

/**
 * The three sample sellers in "Try with sample data" (FR-WS-3, PRD Q24,
 * ADR-0012): one for each kind of thing a company sells. All fictional.
 */
export type Sample = {
  seller: SampleSeller;
  graph: OfferingGraphExport;
  documents: DocumentRecord[];
  initials: string;
  sells: "Services" | "Software" | "Products";
  city: string;
  blurb: string;
};

export const SAMPLES: Record<SampleSeller, Sample> = {
  "olvessa": {
    seller: "olvessa",
    graph: withSourceQuotes(olvessa),
    documents: olvessaDocuments,
    initials: "OV",
    sells: "Services",
    city: "Kuala Lumpur",
    blurb: "A 14-person cloud and data consultancy. Sells cloud migrations, Workspace rollouts, BigQuery analytics and AI agent builds.",
  },
  yorvex: {
    seller: "yorvex",
    graph: withSourceQuotes(yorvex),
    documents: yorvexDocuments,
    initials: "YX",
    sells: "Software",
    city: "Penang",
    blurb: "Workforce software for shift-based teams. Sells rostering, attendance and payroll in three editions, priced per employee per month, plus enterprise projects.",
  },
  "trassoq": {
    seller: "trassoq",
    graph: withSourceQuotes(trassoq),
    documents: trassoqDocuments,
    initials: "TQ",
    sells: "Products",
    city: "Shah Alam",
    blurb: "An IT hardware reseller. Sells laptops and printers by volume band, with device-as-a-service, managed print, deployment and disposal around them.",
  },
};

/** The workspace fields for a sample seller. Every sample writes the SME template (ADR-0012 D3). */
export function sampleWorkspaceFields(seller: SampleSeller) {
  const { workspace } = SAMPLES[seller].graph;
  return {
    name: workspace.name,
    website: null,
    country: Workspace.shape.country.parse(workspace.country),
    currency: Workspace.shape.currency.parse(workspace.currency),
    persona: "sme" as const,
    industries: [],
    sample: seller,
  };
}
