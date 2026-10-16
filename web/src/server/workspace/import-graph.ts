import { OfferingGraphExport } from "@/lib/schema";

/** Export keys and the workspace sub-collections they are stored in (ADR-0001, ADR-0009 D1). */
export const GRAPH_COLLECTIONS = ["offerings", "rateCards", "feeSchedules", "proof", "constraints", "partners", "notes"] as const;

export type GraphDoc = { path: string; data: Record<string, unknown> };

/**
 * R12 import: validates an offering-graph export and maps every entity to its
 * document under `workspaces/{ws}`, re-homed to that workspace. Pure, so the
 * mapping is tested without a database. Cost fields are stored as they are:
 * they stay in the seller's own workspace and are filtered out before any
 * model sees them (invariant 2).
 */
export function graphToDocs(graph: unknown, workspaceId: string): GraphDoc[] {
  const parsed = OfferingGraphExport.parse(graph);
  const docs: GraphDoc[] = [];
  for (const collection of GRAPH_COLLECTIONS) {
    for (const entity of parsed[collection]) {
      // A JSON round trip drops undefined values, which Firestore rejects.
      const data = JSON.parse(JSON.stringify({ ...entity, workspaceId })) as Record<string, unknown>;
      docs.push({ path: `workspaces/${workspaceId}/${collection}/${entity.id}`, data });
    }
  }
  return docs;
}

/** What the sample card on the setup screen counts (S2). */
export function graphSummary(graph: OfferingGraphExport) {
  return {
    offerings: graph.offerings.filter((offering) => offering.parentId === null).length,
    proof: graph.proof.length,
    partners: graph.partners.length,
  };
}
