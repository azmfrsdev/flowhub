import { OAuth2Client } from "google-auth-library";
import { parseJob, runJob } from "@/server/jobs/dispatch";

/**
 * The internal route Cloud Tasks calls to run a job: a deal-room stage, or
 * reading an uploaded file (ADR-0006 D6, ADR-0010 D2).
 * It accepts only an OIDC token signed by Google for the Cloud Tasks service
 * account, with this service as the audience. The browser never calls it
 * (invariant 9). The body carries IDs only.
 */
const verifier = new OAuth2Client();

export const maxDuration = 900;

export async function POST(request: Request): Promise<Response> {
  const invoker = process.env.TASKS_INVOKER_SA;
  const audience = process.env.APP_BASE_URL;
  if (!invoker || !audience) return new Response("Not configured", { status: 404 });

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    if (payload?.email !== invoker || payload.email_verified !== true) return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const job = parseJob(await request.json().catch(() => null));
  if (!job) return new Response("Bad request", { status: 400 });

  // A failure is recorded on the run or the file itself, and the person
  // retries from there, so Cloud Tasks gets a 200 either way: no silent second spend.
  await runJob(job);
  return new Response("OK", { status: 200 });
}
