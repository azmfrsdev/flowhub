import "server-only";
import { cache } from "react";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { getHubContext } from "@/server/workspace/access";
import { getGraphFor } from "./load";

/** The signed-in caller's whole offering graph, read once per request (invariant 7: their own workspace only). */
export const getWorkspaceGraph = cache(async (): Promise<WorkspaceGraph> => {
  const { workspace } = await getHubContext();
  return getGraphFor(workspace.id);
});
