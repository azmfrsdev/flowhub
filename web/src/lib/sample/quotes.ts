import type { OfferingGraphExport, SourceRef } from "@/lib/schema";

/**
 * The sample sellers' documents are fictional, so their pages have no text to
 * quote. Each source on an offering, feature, result or rule quotes what that
 * record says, as the page it cites would. The source drawer (FR-OG-9) then
 * shows a quote for sample data too. Pricing, cost and partner records keep
 * their sources as they are, so no price or cost is restated anywhere.
 */
const MAX_QUOTE = 300;

function quoted(sources: SourceRef[], text: string): SourceRef[] {
  const quote = text.replace(/\s+/g, " ").trim().slice(0, MAX_QUOTE);
  return sources.map((source) => (source.quote || !source.documentId || !quote ? source : { ...source, quote }));
}

export function withSourceQuotes(graph: OfferingGraphExport): OfferingGraphExport {
  return {
    ...graph,
    offerings: graph.offerings.map((offering) => ({
      ...offering,
      sources: quoted(offering.sources, `${offering.name}. ${offering.summary}`),
      features: offering.features.map((feature) => ({ ...feature, sources: quoted(feature.sources, `${feature.name}: ${feature.description}`) })),
    })),
    proof: graph.proof.map((item) => ({ ...item, sources: quoted(item.sources, item.title) })),
    constraints: graph.constraints.map((rule) => ({ ...rule, sources: quoted(rule.sources, rule.statement) })),
  };
}
