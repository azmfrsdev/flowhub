import "server-only";
import { notFound } from "next/navigation";
import { getHubContext } from "@/server/workspace/access";
import { getWorkspaceGraph } from "./read";

/** One offering with its whole graph, or the 404 page. Scoped to the caller's workspace. */
export async function loadOffering(id: string) {
  const [{ workspace, role }, graph] = await Promise.all([getHubContext(), getWorkspaceGraph()]);
  const offering = graph.offerings.find((item) => item.id === id);
  if (!offering) notFound();
  return {
    workspace,
    role,
    graph,
    offering,
    currency: workspace.currency,
    documents: new Map(graph.documents.map((doc) => [doc.id, doc])),
  };
}
