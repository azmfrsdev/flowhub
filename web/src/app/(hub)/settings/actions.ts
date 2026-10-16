"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SAMPLES, sampleWorkspaceFields } from "@/lib/sample";
import { AuditEvent, Constraint, SampleSeller, Workspace } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { restoreBatch } from "@/server/graph/delete";
import { GoneError, createEntity, editEntity, editError, softDeleteEntity } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";
import { WorkspaceExistsError, createWorkspace, deleteWorkspaceData } from "@/server/workspace/create";
import { ForbiddenError } from "@/server/workspace/roles";

export type RuleFormState = { error?: string; ok?: number };

const RuleInput = z.object({
  kind: Constraint.shape.kind.exclude(["scope"]),
  statement: z.string().trim().min(1, "Write the rule as you'd say it to a client.").max(200),
  values: z
    .string()
    .trim()
    .max(300)
    .transform((text) => text.split(",").map((value) => value.trim()).filter(Boolean)),
});

/** FR-OFR-9: a company-wide selling rule. It shows on every Scope tab, and the Fit Analyst checks it first. */
export async function addSellingRule(_previous: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const context = await requireRole("editor");
  const input = RuleInput.safeParse({ kind: formData.get("kind"), statement: formData.get("statement") ?? "", values: formData.get("values") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message };
  await createEntity(context, "constraints", { ...input.data, offeringIds: [] }, `Added a selling rule: ${input.data.statement}`);
  refresh();
  return { ok: Date.now() };
}

export async function removeSellingRule(constraintId: string): Promise<void> {
  const context = await requireRole("editor");
  [constraintId] = parseArgs([ArgId], [constraintId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/constraints/${constraintId}`).get();
  if (!snap.exists || ((snap.get("offeringIds") as string[] | undefined)?.length ?? 0) > 0) return;
  await softDeleteEntity(context, "constraints", constraintId, `Removed the selling rule: ${snap.get("statement")}`);
  refresh();
}

/**
 * FR-WS-4: the Owner swaps their sample workspace for another sample seller's,
 * after confirming in Settings. Only a sample workspace can be replaced, never
 * a company's own; the old one is soft-deleted and today's caps carry over.
 *
 * FR-WS-5: choosing the same seller with `reset` restores the sample as it
 * first loaded. The form names the workspace it resets, so a second click
 * can't reset the fresh copy again.
 */
export async function switchSample(formData: FormData): Promise<void> {
  const { user, workspace } = await requireRole("owner");
  const seller = SampleSeller.safeParse(formData.get("seller"));
  const reset = formData.get("reset") === "1";
  if (!workspace.sample || !seller.success) throw new ForbiddenError();
  if (seller.data !== workspace.sample || (reset && formData.get("workspaceId") === workspace.id)) {
    const { graph, documents } = SAMPLES[seller.data];
    try {
      await createWorkspace(user, sampleWorkspaceFields(seller.data), { graph, documents }, { replaces: workspace.id });
    } catch (err) {
      // A second click lands here after the first one switched: nothing left to do.
      if (!(err instanceof WorkspaceExistsError)) throw err;
    }
  }
  redirect("/home");
}

export type DeleteState = { error?: string };

/**
 * The privacy page's promise (FR-WS-7): the Owner deletes the workspace and
 * everything in it, including sample copies it replaced earlier and every
 * uploaded file. This one is a real deletion, not a soft delete, because the
 * person asked for their data to be removed. Docs already in their Drive stay.
 */
export async function deleteWorkspace(_previous: DeleteState, formData: FormData): Promise<DeleteState> {
  const { user, workspace } = await requireRole("owner");
  if (String(formData.get("confirm") ?? "").trim() !== workspace.name) return { error: `Type ${workspace.name} to confirm.` };
  await deleteWorkspaceData(user.uid, workspace.id);
  redirect("/start");
}

/** FR-OFR-9: a selling rule's kind, wording and values. The Fit Analyst checks the new wording from the next run. */
export async function updateSellingRule(constraintId: string, _previous: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const context = await requireRole("editor");
  [constraintId] = parseArgs([ArgId], [constraintId]);
  const input = RuleInput.safeParse({ kind: formData.get("kind"), statement: formData.get("statement") ?? "", values: formData.get("values") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message };
  try {
    await editEntity(context, "constraints", constraintId, null, (current) => {
      if (((current.offeringIds as string[] | undefined)?.length ?? 0) > 0) throw new GoneError();
      const { kind, statement, values } = input.data;
      if (current.kind === kind && current.statement === statement && JSON.stringify(current.values ?? []) === JSON.stringify(values)) return null;
      return { patch: { kind, statement, values }, summary: `Edited the selling rule: ${statement}` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

const WorkspaceEdit = z.object({
  name: z.string().trim().min(1, "Name the company.").max(120),
  website: Workspace.shape.website,
  country: Workspace.shape.country,
  currency: Workspace.shape.currency,
});

/** FR-WS-6: the Owner edits the workspace's details. */
export async function updateWorkspace(_previous: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const { workspace, user } = await requireRole("owner");
  const website = String(formData.get("website") ?? "").trim();
  const input = WorkspaceEdit.safeParse({
    name: formData.get("name") ?? "",
    website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    country: formData.get("country"),
    currency: String(formData.get("currency") ?? "").trim().toUpperCase(),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check the details." };
  const now = new Date().toISOString();
  const ref = db().doc(`workspaces/${workspace.id}`);
  const batch = db().batch();
  batch.update(ref, input.data);
  batch.set(
    ref.collection("auditEvents").doc(),
    AuditEvent.parse({ action: "update", entity: "workspace", entityId: workspace.id, summary: `Updated the workspace details for ${input.data.name}.`, by: user.uid, byName: user.name, at: now }),
  );
  await batch.commit();
  refresh();
  return { ok: Date.now() };
}

/** CLAUDE.md conventions: restoring a deleted item brings back whatever was deleted with it. */
export async function restoreDeleted(batchId: string): Promise<void> {
  const context = await requireRole("editor");
  [batchId] = parseArgs([ArgId], [batchId]);
  try {
    await restoreBatch(context, batchId);
  } catch (err) {
    if (!(err instanceof GoneError)) throw err;
  }
  refresh();
}
