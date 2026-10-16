import "server-only";
import { CloudTasksClient } from "@google-cloud/tasks";
import { after } from "next/server";
import { z } from "zod";

/**
 * Background work that outlives the request (ADR-0006 D6, ADR-0010 D2): a
 * deal-room stage, or reading an uploaded file. Jobs carry IDs only; each run
 * reads its inputs from Firestore and writes its results back (invariant 8).
 */
const ID = z.string().min(1).max(128);
export const Job = z.union([
  z.object({ kind: z.literal("stage"), workspaceId: ID, opportunityId: ID, runId: ID }),
  z.object({ kind: z.literal("ingest"), workspaceId: ID, documentId: ID }),
]);
export type Job = z.infer<typeof Job>;

/** Tasks queued before jobs had a kind carry stage IDs only. */
export function parseJob(body: unknown): Job | null {
  const withKind = body && typeof body === "object" && !("kind" in body) ? { ...body, kind: "stage" } : body;
  const parsed = Job.safeParse(withKind);
  return parsed.success ? parsed.data : null;
}

export async function runJob(job: Job): Promise<void> {
  if (job.kind === "stage") {
    const { runStage } = await import("@/server/pipelines/runner");
    return runStage(job);
  }
  const { runIngest } = await import("@/server/pipelines/ingest");
  return runIngest(job);
}

/**
 * Deployed: a Cloud Tasks task calls the internal route with an OIDC token,
 * so the job survives the browser leaving (FR-DR-3). Locally there is no
 * queue: the job starts in-process once the response is sent.
 */
export async function dispatchJob(job: Job): Promise<void> {
  const { TASKS_INVOKER_SA, APP_BASE_URL, GOOGLE_CLOUD_PROJECT, TASKS_LOCATION, TASKS_QUEUE } = process.env;
  if (!TASKS_INVOKER_SA || !APP_BASE_URL) {
    after(() => runJob(job));
    return;
  }
  const client = new CloudTasksClient();
  await client.createTask({
    parent: client.queuePath(GOOGLE_CLOUD_PROJECT!, TASKS_LOCATION ?? "asia-southeast1", TASKS_QUEUE ?? "run-stage"),
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: `${APP_BASE_URL}/api/internal/run-stage`,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(job)).toString("base64"),
        oidcToken: { serviceAccountEmail: TASKS_INVOKER_SA, audience: APP_BASE_URL },
      },
      dispatchDeadline: { seconds: 900 },
    },
  });
}
