"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SAMPLES, sampleWorkspaceFields } from "@/lib/sample";
import { Constraint, SampleSeller } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { createEntity, softDeleteEntity } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { WorkspaceExistsError, createWorkspace } from "@/server/workspace/create";
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
  const snap = await db().doc(`workspaces/${context.workspace.id}/constraints/${constraintId}`).get();
  if (!snap.exists || ((snap.get("offeringIds") as string[] | undefined)?.length ?? 0) > 0) return;
  await softDeleteEntity(context, "constraints", constraintId, `Removed the selling rule: ${snap.get("statement")}`);
  refresh();
}

/**
 * FR-WS-4: the Owner swaps their sample workspace for another sample seller's,
 * after confirming in Settings. Only a sample workspace can be replaced, never
 * a company's own; the old one is soft-deleted and today's caps carry over.
 */
export async function switchSample(formData: FormData): Promise<void> {
  const { user, workspace } = await requireRole("owner");
  const seller = SampleSeller.safeParse(formData.get("seller"));
  if (!workspace.sample || !seller.success) throw new ForbiddenError();
  if (seller.data !== workspace.sample) {
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
