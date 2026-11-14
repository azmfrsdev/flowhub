import { z } from "zod";
import { gmailLabel } from "@/lib/inbox/triage";
import { formServices, formTitle } from "@/lib/inbox/form";
import { INVITE_ID, InboxEmail, InboxForm, InboxItem, NOTES_FOLDER, NOTES_MAX_CHARS, Workspace } from "@/lib/schema";
import { getGraphFor } from "@/server/graph/load";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { claimInvites, invitesWaiting, recordInviteResult } from "@/server/inbox/invites";
import { hashInboxKey, keyFromHeader } from "@/server/inbox/keys";
import { NotesError, meetingsWantingNotes, notesWaiting, receiveNotes } from "@/server/inbox/notes";
import { InboxError, type TriageResult, triageEmail, triageForm } from "@/server/pipelines/inbox";

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
 * - `invites`: meeting invites a person sent from FlowHub, for the script to
 *   send from the inbox's own Calendar (FR-CAL-7, ADR-0020 D7). `ping` and
 *   `triage` say how many wait, so the script asks only when there are some.
 * - `invite-result`: the script's report on one invite: sent, with its links, or not.
 * - `notes-wanted`: meetings FlowHub sent the invite for that are over, for
 *   the script to find their notes Doc in Google Drive (FR-NOTES-1, ADR-0021).
 *   `ping` and `triage` say how many, as for invites.
 * - `notes`: one meeting's notes, as plain text, with the Doc's title and link.
 *   Stored once; step F plans from them unless a person pasted notes already.
 * - `form-setup`: the form's title and the live offerings' names, for the
 *   script's `createLeadForm()` to build the website form's checkboxes from
 *   (FR-FORM-2, ADR-0022). Names only: no summary, price or cost.
 * - `form`: one answer to the website form (FR-FORM-4). Read like an email,
 *   with the ticked services mapped to offerings by code. `ping` may also
 *   report the form's and the website's addresses, for Settings › Inbox.
 */

export const maxDuration = 120;

/** A form or website address the script reports: https only, so FlowHub never links or draws a QR code to anything else. */
const HttpsUrl = z
  .string()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Must be an https address.");

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ping"), mailbox: z.string().email().max(320).optional(), formUrl: HttpsUrl.nullish(), siteUrl: HttpsUrl.nullish() }),
  z.object({ action: z.literal("form-setup") }),
  z.object({ action: z.literal("form"), mailbox: z.string().email().max(320).optional(), form: InboxForm }),
  z.object({ action: z.literal("triage"), mailbox: z.string().email().max(320).optional(), email: InboxEmail }),
  z.object({ action: z.literal("status"), messageId: InboxEmail.shape.messageId }),
  z.object({ action: z.literal("invites") }),
  z.object({
    action: z.literal("invite-result"),
    id: z.string().regex(INVITE_ID),
    ok: z.boolean(),
    eventUrl: z.string().max(2000).nullish(),
    meetUrl: z.string().max(2000).nullish(),
    error: z.string().max(2000).nullish(),
  }),
  z.object({ action: z.literal("notes-wanted") }),
  z.object({
    action: z.literal("notes"),
    id: z.string().regex(INVITE_ID),
    docTitle: z.string().max(1000),
    docUrl: z.string().max(2000),
    // The script cuts at 20,000 characters; a little room for line endings it didn't count.
    text: z.string().min(1).max(NOTES_MAX_CHARS + 2000),
    foundIn: z.enum(["calendar", "folder"]),
  }),
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
    const mailbox = "mailbox" in body.data ? body.data.mailbox?.toLowerCase() : undefined;
    // A ping from a script without the form leaves these alone; null clears them.
    const formLinks = body.data.action === "ping" ? { ...(body.data.formUrl !== undefined ? { "inbox.formUrl": body.data.formUrl } : {}), ...(body.data.siteUrl !== undefined ? { "inbox.siteUrl": body.data.siteUrl } : {}) } : {};
    await wsRef.update({ "inbox.lastSeenAt": now, ...(mailbox ? { "inbox.mailbox": mailbox } : {}), ...formLinks });
    if (mailbox && workspace.inbox) workspace.inbox.mailbox = mailbox;
  }

  switch (body.data.action) {
    case "ping":
      return json({ ok: true, workspace: workspace.name, autoIntake: workspace.inbox?.autoIntake ?? true, invites: await invitesWaiting(workspace.id), notes: await notesWaiting(workspace.id) });
    case "invites":
      return json({ invites: await claimInvites(workspace.id) });
    case "invite-result": {
      const { id, ok, eventUrl, meetUrl, error } = body.data;
      const recorded = await recordInviteResult(workspace.id, id, ok ? { ok, eventUrl, meetUrl } : { ok, error: error ?? "" });
      return json({ recorded });
    }
    case "notes-wanted":
      return json({ folder: NOTES_FOLDER, meetings: await meetingsWantingNotes(workspace.id) });
    case "notes": {
      const { id, docTitle, docUrl, text, foundIn } = body.data;
      try {
        const outcome = await receiveNotes(workspace, { inviteId: id, docTitle, docUrl, text, foundIn });
        return json({ status: outcome.status, url: outcome.opportunityId ? `${origin}/opportunities/${outcome.opportunityId}` : null });
      } catch (err) {
        if (err instanceof NotesError) return json({ error: err.message }, err.status);
        console.error("Receiving meeting notes failed:", err);
        return json({ error: "FlowHub couldn't store these notes. The script will try again." }, 500);
      }
    }
    case "status": {
      const snap = await wsRef.collection("inbox").doc(`gm_${body.data.messageId}`).get();
      const item = snap.exists ? InboxItem.safeParse(snap.data()) : null;
      return json(item?.success ? { found: true, item: await view(workspace.id, item.data, origin) } : { found: false });
    }
    case "form-setup": {
      const graph = await getGraphFor(workspace.id);
      return json({ title: formTitle(workspace.name), seller: workspace.name, services: formServices(graph.offerings) });
    }
    case "triage": {
      const { email } = body.data;
      return reply(workspace.id, origin, "email", () => triageEmail(workspace, email));
    }
    case "form": {
      const { form } = body.data;
      return reply(workspace.id, origin, "form answer", () => triageForm(workspace, form));
    }
  }
}

/** Runs one triage and answers the script: the item's view, and how many invites and notes wait. */
async function reply(workspaceId: string, origin: string, what: string, run: () => Promise<TriageResult>): Promise<Response> {
  try {
    const result = await run();
    const [invites, notes] = await Promise.all([invitesWaiting(workspaceId), notesWaiting(workspaceId)]);
    if (result.kind === "skipped") return json({ skipped: result.reason, invites, notes });
    return json({ fresh: result.fresh, item: await view(workspaceId, result.item, origin), invites, notes });
  } catch (err) {
    if (err instanceof InboxError) return json({ error: err.message }, err.status);
    if (err instanceof ModelBusyError) return json({ error: err.message }, 503);
    if (err instanceof ModelOutputError) return json({ error: "Gemini's answer didn't have the expected shape. The script will try again." }, 502);
    console.error("Inbox triage failed:", err);
    return json({ error: `FlowHub couldn't read this ${what}. The script will try again.` }, 500);
  }
}
