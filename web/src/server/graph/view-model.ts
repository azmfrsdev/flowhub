import "server-only";
import { layoutGraph } from "@/lib/offerings/graph-layout";
import { type PlacedGraph, buildGraphModel } from "@/lib/offerings/graph-model";
import { type FitOutput, Opportunity } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { getHubContext } from "@/server/workspace/access";
import { getWorkspaceGraph } from "./read";

/**
 * The graph view's data (PRD FR-OG-12, ADR-0018): the caller's own workspace
 * only (invariant 7), projected without cost (D1), laid out on the server
 * (D2), with the current fit map of every deal that has one (D3).
 */
export async function getGraphView(): Promise<PlacedGraph> {
  const [{ workspace }, graph] = await Promise.all([getHubContext(), getWorkspaceGraph()]);
  const opps = db().collection(`workspaces/${workspace.id}/opportunities`);
  const snap = await opps.where("deletedAt", "==", null).get();
  const deals = snap.docs.flatMap((doc) => {
    const parsed = Opportunity.safeParse(doc.data());
    return parsed.success ? [parsed.data] : [];
  });
  // The fit map a person approved, or the one waiting at Gate C: the run's working copy (ADR-0005 D2).
  const withFit = deals.filter((deal) => deal.stages.fit.currentRunId && ["waiting", "approved"].includes(deal.stages.fit.state));
  const fits = new Map<string, FitOutput>();
  await Promise.all(
    withFit.map(async (deal) => {
      const run = await opps.doc(deal.id).collection("runs").doc(deal.stages.fit.currentRunId!).get();
      const working = run.get("working") as FitOutput | undefined;
      if (working?.gaps) fits.set(deal.id, working);
    }),
  );
  const model = buildGraphModel(graph, deals, fits);
  const positions = Object.fromEntries(layoutGraph(model.nodes, model.edges));
  return { ...model, positions };
}
