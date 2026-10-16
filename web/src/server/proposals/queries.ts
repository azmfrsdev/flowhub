import "server-only";
import { cache } from "react";
import { DocumentRecord, type Opportunity, Proposal, type StageKey } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { getHubContext } from "@/server/workspace/access";

/** Proposals waiting for a person (FR-ASK-5), newest first. A workspace has a handful at a time. */
export const getPendingProposals = cache(async (): Promise<Proposal[]> => {
  const { workspace } = await getHubContext();
  const snap = await db().collection(`workspaces/${workspace.id}/proposals`).where("status", "==", "proposed").get();
  return snap.docs
    .flatMap((doc) => {
      const parsed = Proposal.safeParse(doc.data());
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

const GATE: Record<StageKey, string> = { intake: "Gate A: confirm the prospect", research: "Gate B: approve the brief", fit: "Gate C: approve the fit", write: "Gate D: finalise" };

export type WaitingGate = { opportunityId: string; prospect: string; gate: string; at: string };

/** Deal rooms stopped at a gate (FR-DR), for Waiting for you on Home. */
export const getWaitingGates = cache(async (): Promise<WaitingGate[]> => {
  const { workspace } = await getHubContext();
  const snap = await db().collection(`workspaces/${workspace.id}/opportunities`).where("deletedAt", "==", null).get();
  return snap.docs
    .map((doc) => doc.data() as Opportunity)
    .flatMap((opp) => {
      const stage = (["write", "fit", "research", "intake"] as const).find((key) => opp.stages[key].state === "waiting");
      return stage ? [{ opportunityId: opp.id, prospect: opp.prospect?.name ?? "New opportunity", gate: GATE[stage], at: opp.stages[stage].updatedAt }] : [];
    })
    .sort((a, b) => b.at.localeCompare(a.at));
});

/** FR-ING-3: files still being read, or that couldn't be read, for Waiting for you on Home. */
export const getDocumentsInProgress = cache(async (): Promise<DocumentRecord[]> => {
  const { workspace } = await getHubContext();
  const snap = await db().collection(`workspaces/${workspace.id}/documents`).where("status", "in", ["uploaded", "reading", "failed"]).get();
  return snap.docs
    .flatMap((doc) => {
      const parsed = DocumentRecord.safeParse(doc.data());
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
});
