import "server-only";
import { malaysiaDay } from "@/lib/offerings/view";
import { AuditEvent, Offering, Opportunity } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { getHubContext } from "./access";
import { CAPS } from "./caps";

/**
 * Hub reads. Each one resolves the caller's workspace itself, so no caller
 * can pass another workspace's ID (invariant 7, workspace isolation).
 */

/** Today's date in Malaysia, the key of `usage/{yyyy-mm-dd}` (FR-CAP-1). */
export const usageDay = malaysiaDay;

export async function getNavCounts() {
  const { workspace } = await getHubContext();
  const base = db().collection("workspaces").doc(workspace.id);
  const [offerings, opportunities] = await Promise.all([
    base.collection("offerings").where("parentId", "==", null).where("deletedAt", "==", null).count().get(),
    base.collection("opportunities").count().get(),
  ]);
  return { offerings: offerings.data().count, opportunities: opportunities.data().count };
}

export async function getUsageToday() {
  const { workspace } = await getHubContext();
  const snap = await db().doc(`workspaces/${workspace.id}/usage/${usageDay()}`).get();
  const stageRuns = Number(snap.get("stageRuns") ?? 0);
  return {
    stageRuns,
    cap: CAPS.stageRuns,
    researchRuns: Number(snap.get("researchRuns") ?? 0),
    researchCap: CAPS.researchRuns,
    askRuns: Number(snap.get("askRuns") ?? 0),
    askCap: CAPS.askRuns,
    uploads: Number(snap.get("uploads") ?? 0),
    uploadsCap: CAPS.uploads,
  };
}

/** Live offerings' names, for the Ask or tell panel's scope and labels. */
export async function getOfferingNames(): Promise<{ id: string; name: string }[]> {
  const { workspace } = await getHubContext();
  const snap = await db().collection(`workspaces/${workspace.id}/offerings`).where("deletedAt", "==", null).select("name").get();
  return snap.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name") ?? "") })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Top-level, live offerings, in name order (the Home card and the Offerings list). */
export async function getTopLevelOfferings(): Promise<Offering[]> {
  const { workspace } = await getHubContext();
  const snap = await db()
    .collection(`workspaces/${workspace.id}/offerings`)
    .where("parentId", "==", null)
    .where("deletedAt", "==", null)
    .get();
  return snap.docs.map((doc) => Offering.parse(doc.data())).sort((a, b) => a.name.localeCompare(b.name));
}

/** FR-OFR-3: recent changes to an offering and the records on its tabs, newest first. */
export async function getChangesFor(entityIds: string[], limit = 5): Promise<AuditEvent[]> {
  const { workspace } = await getHubContext();
  const ids = new Set(entityIds);
  const snap = await db().collection(`workspaces/${workspace.id}/auditEvents`).orderBy("at", "desc").limit(200).get();
  return snap.docs
    .map((doc) => AuditEvent.parse(doc.data()))
    .filter((event) => ids.has(event.entityId))
    .slice(0, limit);
}

export async function getRecentActivity(limit = 8): Promise<AuditEvent[]> {
  const { workspace } = await getHubContext();
  const snap = await db().collection(`workspaces/${workspace.id}/auditEvents`).orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((doc) => AuditEvent.parse(doc.data()));
}

/** FR-OG-13: recent deals that involve an offering or one of its sub-offerings, newest first. */
export async function getDealsFor(offeringIds: string[], limit = 5): Promise<Opportunity[]> {
  const { workspace } = await getHubContext();
  if (offeringIds.length === 0) return [];
  const snap = await db().collection(`workspaces/${workspace.id}/opportunities`).where("interestedOfferingIds", "array-contains-any", offeringIds.slice(0, 30)).get();
  return snap.docs
    .flatMap((doc) => {
      const parsed = Opportunity.safeParse(doc.data());
      return parsed.success && !parsed.data.deletedAt ? [parsed.data] : [];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
