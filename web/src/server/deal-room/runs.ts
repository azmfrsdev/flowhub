import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { AuditEvent, type Opportunity, type Run, type StageKey } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { dispatchJob } from "@/server/jobs/dispatch";
import type { HubContext } from "@/server/workspace/access";
import { CAPS } from "@/server/workspace/caps";
import { malaysiaDay } from "@/lib/offerings/view";

/**
 * Stage runs (ADR-0005 D5, D6; ADR-0006 D6; ADR-0010 D2). Starting a stage is
 * one transaction on the opportunity; the pipeline then gets IDs only.
 */

export const STAGES: StageKey[] = ["intake", "research", "fit", "write"];
/** ADR-0005 D5: no progress event for this long means a run has stalled. */
const STALL_MS = 3 * 60 * 1000;
const STATUS_ON_START: Partial<Record<StageKey, Opportunity["status"]>> = { research: "researching", fit: "proposing", write: "proposing" };

export class StageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageError";
  }
}

export type RunIds = { workspaceId: string; opportunityId: string; runId: string };

/**
 * Starts a stage: checks nothing is running, the previous stage is approved,
 * the kill switch and the daily caps; creates the run; marks later stages
 * stale; counts usage; audits. All in one transaction, so two clicks can't
 * start two runs or slip past a cap.
 */
export async function startStage(context: HubContext, opportunityId: string, stage: StageKey, options?: Run["inputs"]["options"]): Promise<RunIds> {
  const firestore = db();
  const ws = context.workspace.id;
  const oppRef = firestore.doc(`workspaces/${ws}/opportunities/${opportunityId}`);
  const usageRef = firestore.doc(`workspaces/${ws}/usage/${malaysiaDay()}`);
  const flagsRef = firestore.doc("system/flags");
  const runRef = oppRef.collection("runs").doc();
  const now = new Date().toISOString();

  await firestore.runTransaction(async (tx) => {
    const [oppSnap, usageSnap, flagsSnap] = await Promise.all([tx.get(oppRef), tx.get(usageRef), tx.get(flagsRef)]);
    const opp = oppSnap.data() as Opportunity | undefined;
    if (!opp || opp.deletedAt) throw new StageError("This opportunity no longer exists.");
    if (flagsSnap.exists && flagsSnap.get("agentsEnabled") === false) throw new StageError("The agents are paused for now. Try again later.");

    // ADR-0005 D5: a run with no event for 3 minutes is stalled. Retrying marks it failed (timeout) first.
    const runningKeys = STAGES.filter((key) => opp.stages[key].state === "running");
    const runningSnaps = await Promise.all(runningKeys.map((key) => tx.get(oppRef.collection("runs").doc(opp.stages[key].currentRunId!))));
    const stalled: { key: StageKey; ref: DocumentReference; stillRunning: boolean }[] = [];
    for (const [i, snap] of runningSnaps.entries()) {
      const lastEventAt = snap.get("lastEventAt") as string | undefined;
      const stillRunning = snap.exists && snap.get("state") === "running";
      const isStalled = !stillRunning || !lastEventAt || Date.now() - new Date(lastEventAt).getTime() > STALL_MS;
      if (!isStalled) throw new StageError("A stage is already running. Wait for it to finish.");
      stalled.push({ key: runningKeys[i], ref: snap.ref, stillRunning });
    }
    const index = STAGES.indexOf(stage);
    const upstream = STAGES.slice(0, index);
    if (upstream.some((key) => opp.stages[key].state !== "approved")) throw new StageError("Approve the earlier stage first.");
    if (stalled.some((item) => item.key !== stage)) throw new StageError("Another stage stalled. Retry that one first.");
    if (stage === "intake" && !opp.inputs.length) throw new StageError("Add what came in before starting.");

    const stageRuns = Number(usageSnap.get("stageRuns") ?? 0);
    const researchRuns = Number(usageSnap.get("researchRuns") ?? 0);
    if (stageRuns >= CAPS.stageRuns) throw new StageError(`Today's limit of ${CAPS.stageRuns} AI runs is used up. It resets at midnight, Malaysia time.`);
    if (stage === "research" && researchRuns >= CAPS.researchRuns) throw new StageError(`Today's limit of ${CAPS.researchRuns} research runs is used up. It resets at midnight, Malaysia time.`);

    const previous = opp.stages[stage].currentRunId ? await tx.get(oppRef.collection("runs").doc(opp.stages[stage].currentRunId!)) : null;
    const run: Run = {
      id: runRef.id,
      stage,
      attempt: (Number(previous?.get("attempt") ?? 0) || 0) + 1,
      state: "running",
      inputs: {
        upstreamRunIds: Object.fromEntries(upstream.map((key) => [key, opp.stages[key].currentRunId!])),
        ...(options ? { options } : {}),
      },
      output: null,
      working: null,
      approvedAt: null,
      approvedBy: null,
      startedAt: now,
      startedBy: context.user.name,
      lastEventAt: now,
      endedAt: null,
      error: null,
      metrics: null,
      rev: 0,
      schemaVersion: 1,
    };
    for (const item of stalled.filter((entry) => entry.stillRunning)) {
      tx.update(item.ref, { state: "failed", endedAt: now, error: { code: "timeout", message: "No progress for 3 minutes, so this run was stopped.", retryable: true } });
    }
    tx.set(runRef, JSON.parse(JSON.stringify(run)));

    const stages: Record<string, unknown> = { [`stages.${stage}`]: { state: "running", currentRunId: runRef.id, updatedAt: now } };
    for (const later of STAGES.slice(index + 1)) {
      if (["waiting", "approved"].includes(opp.stages[later].state)) stages[`stages.${later}`] = { ...opp.stages[later], state: "stale", updatedAt: now };
    }
    tx.update(oppRef, { ...stages, ...(STATUS_ON_START[stage] && ["new", "researching"].includes(opp.status) ? { status: STATUS_ON_START[stage] } : {}), updatedAt: now, rev: opp.rev + 1 });
    tx.set(usageRef, { stageRuns: stageRuns + 1, researchRuns: researchRuns + (stage === "research" ? 1 : 0) }, { merge: true });
    tx.set(
      firestore.collection(`workspaces/${ws}/auditEvents`).doc(),
      AuditEvent.parse({ action: "generate", entity: "run", entityId: runRef.id, summary: `Started ${stage} for ${opp.prospect?.name ?? "a new opportunity"}.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
  });

  const ids = { workspaceId: ws, opportunityId, runId: runRef.id };
  try {
    await dispatchRun(ids);
  } catch (err) {
    // A run that never reached the queue must not sit at "running": fail it now, so Retry works.
    console.error(`Couldn't queue run ${runRef.id}:`, err);
    const failedAt = new Date().toISOString();
    await runRef.update({ state: "failed", endedAt: failedAt, error: { code: "dispatch_failed", message: "The agents couldn't be started. Retry in a moment.", retryable: true } });
    await oppRef.update({ [`stages.${stage}`]: { state: "failed", currentRunId: runRef.id, updatedAt: failedAt }, updatedAt: failedAt });
    throw new StageError("The agents couldn't be started. Retry in a moment.");
  }
  return ids;
}

function dispatchRun(ids: RunIds) {
  return dispatchJob({ kind: "stage", ...ids });
}

/** Gate approval (ADR-0005 D2): the working copy is locked as it stands. */
export async function approveGate(context: HubContext, opportunityId: string, stage: StageKey, runId: string, runRev: number, summary: string): Promise<void> {
  const firestore = db();
  const oppRef = firestore.doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
  const runRef = oppRef.collection("runs").doc(runId);
  const now = new Date().toISOString();
  await firestore.runTransaction(async (tx) => {
    const [oppSnap, runSnap] = await Promise.all([tx.get(oppRef), tx.get(runRef)]);
    const opp = oppSnap.data() as Opportunity | undefined;
    const run = runSnap.data() as Run | undefined;
    if (!opp || !run || opp.stages[stage].currentRunId !== runId) throw new StageError("This run is no longer current. Reload the page.");
    if (run.state !== "waiting") throw new StageError("This stage isn't waiting for approval.");
    if (run.rev !== runRev) throw new StageError("Someone changed this since you opened it. Reload to see their version.");
    tx.update(runRef, { state: "approved", approvedAt: now, approvedBy: context.user.name, rev: run.rev + 1 });
    tx.update(oppRef, { [`stages.${stage}`]: { state: "approved", currentRunId: runId, updatedAt: now }, updatedAt: now, rev: opp.rev + 1 });
    tx.set(
      firestore.collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "update", entity: "gate", entityId: runId, summary, by: context.user.uid, byName: context.user.name, at: now }),
    );
  });
}

/** An edit to a waiting run's working copy, conditional on its revision (ADR-0005 D2). The output is never touched. */
export async function editWorking<T>(context: HubContext, opportunityId: string, runId: string, runRev: number, change: (working: T) => T): Promise<number> {
  const runRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}/runs/${runId}`);
  return db().runTransaction(async (tx) => {
    const run = (await tx.get(runRef)).data() as Run | undefined;
    if (!run) throw new StageError("This run no longer exists.");
    if (run.state !== "waiting") throw new StageError("This stage is locked: it was approved or is running again.");
    if (run.rev !== runRev) throw new StageError("Someone changed this since you opened it. Reload to see their version.");
    tx.update(runRef, { working: JSON.parse(JSON.stringify(change(run.working as T))), rev: run.rev + 1 });
    return run.rev + 1;
  });
}
