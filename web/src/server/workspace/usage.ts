import "server-only";
import { malaysiaDay } from "@/lib/offerings/view";
import { db } from "@/server/firebase/admin";
import { CAPS } from "./caps";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * FR-CAP-1, FR-CAP-2: one AI run outside the deal-room stages (a notes summary,
 * a follow-up email), counted against the day's AI runs before the model is
 * called. The kill switch stops it.
 */
export async function chargeAiRun(workspaceId: string): Promise<void> {
  const usageRef = db().doc(`workspaces/${workspaceId}/usage/${malaysiaDay()}`);
  await db().runTransaction(async (tx) => {
    const [usage, flags] = await Promise.all([tx.get(usageRef), tx.get(db().doc("system/flags"))]);
    if (flags.exists && flags.get("agentsEnabled") === false) throw new UsageError("The agents are paused for now. Try again later.");
    const used = Number(usage.get("stageRuns") ?? 0);
    if (used >= CAPS.stageRuns) throw new UsageError(`Today's limit of ${CAPS.stageRuns} AI runs is used up. It resets at midnight, Malaysia time.`);
    tx.set(usageRef, { stageRuns: used + 1 }, { merge: true });
  });
}
