import type { FitOutput, Opportunity, Provenance } from "@/lib/schema";
import { sourceLabel, type WorkspaceGraph } from "./view";

/**
 * The offering graph view (PRD FR-OG-12, ADR-0018 D1): a typed projection of
 * the confirmed graph into nodes and edges. It copies only what the view
 * shows. Never cost fields, cost rate cards, a partner's buy price or
 * contacts (invariant 2): a partner carries only whether a private buy price
 * exists. Pure, so the server builds it and a test checks it.
 */

export type GraphNodeKind = "offering" | "proof" | "rule" | "partner" | "document" | "deal";
export type GraphEdgeKind = "part_of" | "partner" | "result" | "not_included" | "covers" | "source" | "deal";
export type FitStrength = "strong" | "partial" | "weak" | "cannot";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  summary: string;
  /** The record's page in FlowHub, when it has one. */
  href: string | null;
  /** "Sales deck 2026 p.5", one per source. */
  sources: string[];
  /** Who entered it and how it arrived (who-did-what, ADR-0009 D4). */
  provenance: string | null;
  /** Offering: a sub-offering of another. */
  sub?: boolean;
  status?: string;
  /** Result: may it be cited (invariant 5)? */
  isPublic?: boolean;
  /** Partner: partner, vendor or supplier, and whether a private buy price is held. */
  relationship?: string;
  privateBuyPrice?: boolean;
  /** Document: OK to share with clients. */
  shareable?: boolean;
  /** Deal: its status and go/no-go. */
  dealStatus?: Opportunity["status"];
  score?: { value: number; band: string } | null;
};

export type GraphEdge = { from: string; to: string; kind: GraphEdgeKind };

/** ADR-0018 D3: one deal's fit map, as node IDs to light up. */
export type FitLens = {
  opportunityId: string;
  prospect: string;
  score: { value: number; band: string } | null;
  needs: { text: string; priority: string; fit: FitStrength; nodeIds: string[] }[];
};

export type GraphModel = { nodes: GraphNode[]; edges: GraphEdge[]; lenses: FitLens[] };
/** The model with each node's position, as the server sends it to the view (ADR-0018 D2). */
export type PlacedGraph = GraphModel & { positions: Record<string, { x: number; y: number }>; size: { width: number; height: number } };

const id = {
  offering: (key: string) => `off:${key}`,
  proof: (key: string) => `prf:${key}`,
  rule: (key: string) => `rule:${key}`,
  partner: (key: string) => `ptn:${key}`,
  document: (key: string) => `doc:${key}`,
  deal: (key: string) => `deal:${key}`,
};

export function provenanceText(provenance: Provenance | undefined, updatedBy?: string): string | null {
  if (!provenance) return updatedBy ? `Last changed by ${updatedBy}` : null;
  const who = provenance.confirmedBy ?? updatedBy;
  switch (provenance.via) {
    case "document":
      return who ? `Read from a document, applied by ${who}` : "Read from a document";
    case "message":
      return who ? `Told to FlowHub, applied by ${who}` : "Told to FlowHub";
    case "import":
      return who ? `Imported by ${who}` : "Imported";
    default:
      return who ? `Entered by ${who}` : "Entered by hand";
  }
}

const brief = (text: string, max = 180) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

export function buildGraphModel(graph: WorkspaceGraph, deals: Opportunity[], fits: Map<string, FitOutput>): GraphModel {
  const live = <T extends { deletedAt?: string | null }>(items: T[]) => items.filter((item) => !item.deletedAt);
  const documents = new Map(live(graph.documents).map((doc) => [doc.id, doc]));
  const offerings = live(graph.offerings);
  const offeringIds = new Set(offerings.map((offering) => offering.id));
  const partners = live(graph.partners);
  const partnerIds = new Set(partners.map((partner) => partner.id));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edge = (from: string, to: string, kind: GraphEdgeKind) => edges.push({ from, to, kind });
  const labels = (sources: { documentId?: string }[]) => [...new Set(sources.map((source) => sourceLabel(source as never, documents)))];

  for (const offering of offerings) {
    nodes.push({
      id: id.offering(offering.id),
      kind: "offering",
      label: offering.name,
      summary: brief(offering.summary || offering.description),
      href: `/offerings/${offering.id}`,
      sources: labels(offering.sources),
      provenance: provenanceText(offering.provenance, offering.updatedBy),
      sub: offering.parentId !== null,
      status: offering.status,
    });
    if (offering.parentId && offeringIds.has(offering.parentId)) edge(id.offering(offering.id), id.offering(offering.parentId), "part_of");
    for (const partnerId of offering.partnerIds) if (partnerIds.has(partnerId)) edge(id.offering(offering.id), id.partner(partnerId), "partner");
  }

  for (const proof of live(graph.proof)) {
    const linked = proof.offeringIds.filter((key) => offeringIds.has(key));
    if (!linked.length) continue;
    nodes.push({
      id: id.proof(proof.id),
      kind: "proof",
      label: proof.title,
      summary: brief(proof.body),
      href: `/offerings/${linked[0]}/sales`,
      sources: labels(proof.sources),
      provenance: provenanceText(proof.provenance, proof.updatedBy),
      isPublic: proof.isPublic,
    });
    for (const key of linked) edge(id.offering(key), id.proof(proof.id), "result");
  }

  // Scope rules only: a company-wide selling rule links to no offering, and Settings shows it.
  for (const rule of live(graph.constraints)) {
    const linked = rule.offeringIds.filter((key) => offeringIds.has(key));
    if (!linked.length) continue;
    nodes.push({
      id: id.rule(rule.id),
      kind: "rule",
      label: rule.statement,
      summary: rule.insteadText ? `Instead: ${rule.insteadText}` : "Not included. No alternative recorded.",
      href: `/offerings/${linked[0]}/scope`,
      sources: labels(rule.sources),
      provenance: provenanceText(rule.provenance, rule.updatedBy),
    });
    for (const key of linked) edge(id.offering(key), id.rule(rule.id), "not_included");
    if (rule.partnerId && partnerIds.has(rule.partnerId)) edge(id.rule(rule.id), id.partner(rule.partnerId), "covers");
  }

  for (const partner of partners) {
    const usedBy = offerings.find((offering) => offering.partnerIds.includes(partner.id));
    nodes.push({
      id: id.partner(partner.id),
      kind: "partner",
      label: partner.name,
      summary: brief([partner.covers.join("; "), partner.arrangement].filter(Boolean).join(". ")),
      href: usedBy ? `/offerings/${usedBy.id}/partners` : null,
      sources: labels(partner.sources),
      provenance: provenanceText(partner.provenance, partner.updatedBy),
      relationship: partner.relationship,
      // Invariant 2: only whether one exists, never the value.
      privateBuyPrice: Boolean(partner.buyPrice),
    });
  }

  for (const doc of documents.values()) {
    const linked = doc.offeringIds.filter((key) => offeringIds.has(key));
    if (!linked.length) continue;
    nodes.push({
      id: id.document(doc.id),
      kind: "document",
      label: doc.name.replace(/\.pdf$/i, ""),
      summary: `${doc.pages ? `${doc.pages} pages · ` : ""}${doc.shareable ? "OK to share with clients" : "Internal only"}`,
      href: `/offerings/${linked[0]}/sales`,
      sources: [],
      provenance: null,
      shareable: doc.shareable,
    });
    for (const key of linked) edge(id.document(doc.id), id.offering(key), "source");
  }

  const lenses: FitLens[] = [];
  const featureOwner = new Map(offerings.flatMap((offering) => offering.features.map((feature) => [feature.id, offering.id] as const)));
  for (const deal of deals) {
    if (deal.deletedAt) continue;
    const linked = deal.interestedOfferingIds.filter((key) => offeringIds.has(key));
    const fit = fits.get(deal.id);
    const score = fit ? { value: Math.round(fit.score.value), band: fit.score.band } : null;
    if (!linked.length && !fit) continue;
    const prospect = deal.prospect?.name ?? "Unnamed prospect";
    nodes.push({
      id: id.deal(deal.id),
      kind: "deal",
      label: prospect,
      summary: deal.outcome ? `${deal.outcome.result.replace("_", " ")}: ${deal.outcome.reason}` : "",
      href: `/opportunities/${deal.id}`,
      sources: [],
      provenance: null,
      dealStatus: deal.status,
      score,
    });
    for (const key of linked) edge(id.deal(deal.id), id.offering(key), "deal");
    if (!fit) continue;

    // ADR-0018 D3: the fit map as nodes to light up. A feature points at its offering.
    const needs: FitLens["needs"] = fit.gaps.flatMap((gap) => {
      const mapped = fit.mappings
        .filter((mapping) => mapping.gapId === gap.id)
        .map((mapping) => ({ strength: mapping.strength, offering: mapping.target.type === "offering" ? mapping.target.id : mapping.target.type === "feature" ? featureOwner.get(mapping.target.id) : undefined }))
        .filter((item): item is { strength: "strong" | "partial" | "weak"; offering: string } => Boolean(item.offering && offeringIds.has(item.offering)));
      const cannot = fit.cannotMeet.find((item) => item.gapId === gap.id && !item.sellingRule);
      if (cannot) {
        const nodeIds = [id.rule(cannot.constraint.id), ...(cannot.partner && partnerIds.has(cannot.partner.id) ? [id.partner(cannot.partner.id)] : [])];
        return [{ text: gap.text, priority: gap.priority, fit: "cannot" as const, nodeIds }];
      }
      if (!mapped.length) return [];
      const order: FitStrength[] = ["strong", "partial", "weak"];
      const best = order.find((strength) => mapped.some((item) => item.strength === strength)) ?? "weak";
      return [{ text: gap.text, priority: gap.priority, fit: best, nodeIds: [...new Set(mapped.map((item) => id.offering(item.offering)))] }];
    });
    const known = new Set(nodes.map((node) => node.id));
    lenses.push({ opportunityId: deal.id, prospect, score, needs: needs.map((need) => ({ ...need, nodeIds: need.nodeIds.filter((key) => known.has(key)) })) });
  }

  return { nodes, edges, lenses };
}
