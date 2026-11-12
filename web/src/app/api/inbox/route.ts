import { z } from "zod";
import { gmailLabel } from "@/lib/inbox/triage";
import { InboxEmail, InboxItem, Workspace } from "@/lib/schema";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { hashInboxKey, keyFromHeader } from "@/server/inbox/keys";
import { InboxError, triageEmail } from "@/server/pipelines/inbox";

/**
 * The Gmail script's door into FlowHub (PRD 7.27, ADR-0020 D2). The first
 * write path without a signed-in person: the caller proves itself with a
 * workspace key, sent as `Authorization: Bearer fhk_…`. FlowHub looks up the
 * key's SHA-256 in `inboxKeys/{hash}`, and the key alone decides the
 * workspace (invariant 7). FlowHub never holds a Google token (invariant 12).
 *
 * Actions:
 * - `ping`: the script says it is running, and in which mailbox.
 * - `triage`: one new email. Returns the verdict for the Gmail label and panel.
 * - `status`: the verdict for an email already read, for the Gmail panel.
 */

export const maxDuration = 120;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ping"), mailbox: z.string().email().max(320).optional() }),
  z.object({ action: z.literal("triage"), mailbox: z.string().email().max(320).optional(), email: InboxEmail }),
  z.object({ action: z.literal("status"), messageId: InboxEmail.shape.messageId }),
]);

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** What the script shows: the verdict, a one-line summary, the label to apply and links back to FlowHub. No body, no prices. */
async function view(workspaceId: string, item: InboxItem, origin: string) {
  let stage: string | null = null;
  if (item.opportunityId) {
    const opp = await db().doc(`workspaces/${workspaceId}/opportunities/${item.opportunityId}`).get();
    const intake = opp.get("stages.intake.state") as string | undefined;
    stage = opp.get("deletedAt") ? "removed" : (intake ?? null);
  }
  return {
    id: item.id,
    verdict: item.verdict,
    status: item.status,
    score: item.verdict === "not_a_lead" ? null : item.score,
    summary: item.summary,
    company: item.company.name,
    offerings: item.matches.map((match) => match.label),
    label: gmailLabel(item),
    url: `${origin}/inbox/${item.id}`,
    dealUrl: item.opportunityId ? `${origin}/opportunities/${item.opportunityId}` : null,
    intake: stage,
  };
}

export async function POST(request: Request): Promise<Response> {
  const hash = hashInboxKey(keyFromHeader(request.headers.get("authorization")) ?? "");
  if (!hash) return json({ error: "A FlowHub workspace key is needed." }, 401);
  const keySnap = await db().doc(`inboxKeys/${hash}`).get();
  const workspaceId = keySnap.get("workspaceId") as string | undefined;
  if (!keySnap.exists || !workspaceId) return json({ error: "That key isn't valid. Make a new one in FlowHub, Settings › Inbox." }, 401);

  const wsRef = db().doc(`workspaces/${workspaceId}`);
  const wsSnap = await wsRef.get();
  const parsedWorkspace = Workspace.safeParse({ ...wsSnap.data(), id: wsSnap.id });
  // A replaced key's hash is deleted, but check the workspace still names it, in case a delete was missed.
  if (!wsSnap.exists || !parsedWorkspace.success || parsedWorkspace.data.deletedAt || parsedWorkspace.data.inbox?.keyHash !== hash) return json({ error: "That key isn't valid. Make a new one in FlowHub, Settings › Inbox." }, 401);
  const workspace = parsedWorkspace.data;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "The request didn't have the expected shape.", issues: body.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  const origin = process.env.APP_BASE_URL ?? new URL(request.url).origin;
  const now = new Date().toISOString();

  if (body.data.action !== "status") {
    const mailbox = body.data.mailbox?.toLowerCase();
    await wsRef.update({ "inbox.lastSeenAt": now, ...(mailbox ? { "inbox.mailbox": mailbox } : {}) });
    if (mailbox && workspace.inbox) workspace.inbox.mailbox = mailbox;
  }

  switch (body.data.action) {
    case "ping":
      return json({ ok: true, workspace: workspace.name, autoIntake: workspace.inbox?.autoIntake ?? true });
    case "status": {
      const snap = await wsRef.collection("inbox").doc(`gm_${body.data.messageId}`).get();
      const item = snap.exists ? InboxItem.safeParse(snap.data()) : null;
      return json(item?.success ? { found: true, item: await view(workspace.id, item.data, origin) } : { found: false });
    }
    case "triage": {
      try {
        const result = await triageEmail(workspace, body.data.email);
        if (result.kind === "skipped") return json({ skipped: result.reason });
        return json({ fresh: result.fresh, item: await view(workspace.id, result.item, origin) });
      } catch (err) {
        if (err instanceof InboxError) return json({ error: err.message }, err.status);
        if (err instanceof ModelBusyError) return json({ error: err.message }, 503);
        if (err instanceof ModelOutputError) return json({ error: "Gemini's answer didn't have the expected shape. The script will try again." }, 502);
        console.error("Inbox triage failed:", err);
        return json({ error: "FlowHub couldn't read this email. The script will try again." }, 500);
      }
    }
  }
}
