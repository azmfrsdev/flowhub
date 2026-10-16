import "server-only";
import { db } from "@/server/firebase/admin";

/** FR-CAP-2: the global kill switch, `system/flags.agentsEnabled`. Set it to false when the budget alert fires. */
export const PAUSED_MESSAGE = "The agents are paused for now. Try again later.";

export async function agentsPaused(): Promise<boolean> {
  const flags = await db().doc("system/flags").get();
  return flags.exists && flags.get("agentsEnabled") === false;
}
