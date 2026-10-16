import "server-only";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { type Opportunity, type Run, type RunEvent, type StageKey, Workspace } from "@/lib/schema";
import { ModelOutputError, newUsage } from "@/server/ai/generate";
import type { RunIds } from "@/server/deal-room/runs";
import { bucket, db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";

/**
 * Runs one stage (ADR-0010 D1, invariant 8). Gets IDs only, reads everything
 * from Firestore, writes progress events and the result back, then ends. A
 * second call for the same run finds it no longer running and does nothing.
 */

export class PipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

export class RunContext {
  private seq = 0;
  readonly usage = newUsage();

  constructor(
    readonly ids: RunIds,
    readonly run: Run,
    readonly opportunity: Opportunity,
    readonly workspace: Workspace,
  ) {}

  get runRef() {
    return db().doc(`workspaces/${this.ids.workspaceId}/opportunities/${this.ids.opportunityId}/runs/${this.ids.runId}`);
  }

  /** One progress event. The document ID is the zero-padded sequence, so a retried write can't duplicate it (ADR-0005 D3). */
  async event(actor: "ai" | "calc", step: string, kind: RunEvent["kind"], message: string, detail?: Record<string, unknown>) {
    const seq = this.seq++;
    const at = new Date().toISOString();
    const event: RunEvent = { seq, at, actor: { kind: actor, step }, kind, message, ...(detail ? { detail } : {}) };
    await Promise.all([this.runRef.collection("events").doc(String(seq).padStart(6, "0")).set(JSON.parse(JSON.stringify(event))), this.runRef.update({ lastEventAt: at })]);
  }

  /** Announces a step, runs it, and returns its result. */
  async step<T>(actor: "ai" | "calc", step: string, message: string, fn: () => Promise<T>): Promise<T> {
    await this.event(actor, step, "step", message);
    return fn();
  }

  /** The workspace's confirmed offering graph (invariant 6). The eval runs pipelines with an in-memory graph instead. */
  graph(): Promise<WorkspaceGraph> {
    return getGraphFor(this.ids.workspaceId);
  }

  /** A stored file, such as one attached at intake. */
  async readFile(storagePath: string): Promise<Buffer> {
    const [bytes] = await bucket().file(storagePath).download();
    return bytes;
  }

  /** The approved working copy of an earlier stage: the only upstream content a stage may read (invariant 11). */
  async upstream<T>(stage: StageKey): Promise<T> {
    const runId = this.run.inputs.upstreamRunIds[stage];
    if (!runId) throw new PipelineError("missing_input", `The ${stage} stage hasn't been approved.`, false);
    const snap = await db().doc(`workspaces/${this.ids.workspaceId}/opportunities/${this.ids.opportunityId}/runs/${runId}`).get();
    if (snap.get("state") !== "approved") throw new PipelineError("missing_input", `The ${stage} stage hasn't been approved.`, false);
    return snap.get("working") as T;
  }
}

type Pipeline = (context: RunContext) => Promise<unknown>;

async function pipelineFor(stage: StageKey): Promise<Pipeline> {
  switch (stage) {
    case "intake":
      return (await import("./intake")).intakePipeline;
    case "research":
      return (await import("./research")).researchPipeline;
    case "fit":
      return (await import("./fit")).fitPipeline;
    case "write":
      return (await import("./write")).writePipeline;
  }
}

export async function runStage(ids: RunIds): Promise<void> {
  const base = db().doc(`workspaces/${ids.workspaceId}`);
  const oppRef = base.collection("opportunities").doc(ids.opportunityId);
  const runRef = oppRef.collection("runs").doc(ids.runId);
  const [runSnap, oppSnap, wsSnap] = await Promise.all([runRef.get(), oppRef.get(), base.get()]);
  const run = runSnap.data() as Run | undefined;
  if (!run || run.state !== "running" || !oppSnap.exists || !wsSnap.exists) return;

  const context = new RunContext(ids, run, oppSnap.data() as Opportunity, Workspace.parse({ ...wsSnap.data(), id: wsSnap.id }));
  const started = Date.now();
  const metrics = () => ({ ms: Date.now() - started, inputTokens: context.usage.inputTokens, outputTokens: context.usage.outputTokens, groundedQueries: context.usage.groundedQueries });

  try {
    const pipeline = await pipelineFor(run.stage);
    const output = JSON.parse(JSON.stringify(await pipeline(context)));
    const now = new Date().toISOString();
    await context.event("calc", "done", "done", "Ready for you to review.");
    await db().runTransaction(async (tx) => {
      const current = (await tx.get(runRef)).data() as Run | undefined;
      if (current?.state !== "running") return;
      tx.update(runRef, { output, working: output, state: "waiting", endedAt: now, metrics: metrics(), rev: current.rev + 1 });
      tx.update(oppRef, { [`stages.${run.stage}`]: { state: "waiting", currentRunId: ids.runId, updatedAt: now }, updatedAt: now });
    });
  } catch (err) {
    const known = err instanceof PipelineError ? err : err instanceof ModelOutputError ? new PipelineError("bad_output", "Gemini's answer didn't have the expected shape. Retry the stage.") : null;
    const failure = known ?? new PipelineError("model_error", "Something went wrong while the agents were working. Retry the stage in a moment.");
    console.error(`Run ${ids.runId} (${run.stage}) failed:`, err);
    const now = new Date().toISOString();
    await context.event("calc", "error", "error", failure.message).catch(() => undefined);
    await runRef.update({ state: "failed", endedAt: now, error: { code: failure.code, message: failure.message, retryable: failure.retryable }, metrics: metrics(), rev: run.rev + 1 });
    await oppRef.update({ [`stages.${run.stage}`]: { state: "failed", currentRunId: ids.runId, updatedAt: now }, updatedAt: now });
  }
}
