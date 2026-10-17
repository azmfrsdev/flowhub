import "server-only";
import { malaysiaDay } from "@/lib/offerings/view";
import { db } from "@/server/firebase/admin";
import { capReached, globalUsagePath } from "./caps";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * FR-CAP-1 to FR-CAP-3: one AI run outside the deal-room stages (a notes
 * summary, a follow-up email, a deck, the pitch prep, a meeting plan, the news
 * scout), counted against the workspace's day and the ceiling across all
 * workspaces before the model is called. The kill switch stops it.
 */
export async function chargeAiRun(workspaceId: string): Promise<void> {
  const day = malaysiaDay();
  const usageRef = db().doc(`workspaces/${workspaceId}/usage/${day}`);
  const globalRef = db().doc(globalUsagePath(day));
  await db().runTransaction(async (tx) => {
    const [usage, flags, global] = await Promise.all([tx.get(usageRef), tx.get(db().doc("system/flags")), tx.get(globalRef)]);
    if (flags.exists && flags.get("agentsEnabled") === false) throw new UsageError("The agents are paused for now. Try again later.");
    const used = Number(usage.get("stageRuns") ?? 0);
    const globalUsed = Number(global.get("stageRuns") ?? 0);
    const capped = capReached({ stageRuns: used, researchRuns: 0 }, { stageRuns: globalUsed, researchRuns: 0 }, false);
    if (capped) throw new UsageError(capped);
    tx.set(usageRef, { stageRuns: used + 1 }, { merge: true });
    tx.set(globalRef, { stageRuns: globalUsed + 1 }, { merge: true });
  });
}
