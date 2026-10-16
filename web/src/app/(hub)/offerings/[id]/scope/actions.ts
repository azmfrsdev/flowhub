"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Feature, Offering } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { createEntity, editEntity, editError, softDeleteEntity } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";

export type ScopeFormState = { error?: string; ok?: number };

const FeatureInput = z.object({
  name: z.string().trim().min(1, "Name the feature.").max(120),
  description: z.string().trim().max(500, "Keep it to a sentence or two."),
});

/** ADR-0009 D3: features are edited by hand. Appends to What's included. */
export async function addFeature(offeringId: string, _previous: ScopeFormState, formData: FormData): Promise<ScopeFormState> {
  const context = await requireRole("editor");
  const input = FeatureInput.safeParse({ name: formData.get("name") ?? "", description: formData.get("description") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message };
  const now = new Date().toISOString();
  try {
    await editEntity(context, "offerings", offeringId, null, (current) => {
      const offering = Offering.parse(current);
      const feature = Feature.parse({
        id: `f_${db().collection("_").doc().id.slice(0, 10)}`,
        name: input.data.name,
        description: input.data.description,
        status: "active",
        sources: [],
        provenance: { via: "manual", confirmedBy: context.user.name, confirmedAt: now },
      });
      return { patch: { features: JSON.parse(JSON.stringify([...offering.features, feature])) }, summary: `Added ${feature.name} to the scope of ${offering.name}.` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

/** Removing a feature retires it: it leaves the Scope tab but stays in the record. */
export async function retireFeature(offeringId: string, featureId: string): Promise<void> {
  const context = await requireRole("editor");
  await editEntity(context, "offerings", offeringId, null, (current) => {
    const offering = Offering.parse(current);
    const feature = offering.features.find((item) => item.id === featureId);
    if (!feature || feature.status === "retired") return null;
    const features = offering.features.map((item) => (item.id === featureId ? { ...item, status: "retired" } : item));
    return { patch: { features: JSON.parse(JSON.stringify(features)) }, summary: `Removed ${feature.name} from the scope of ${offering.name}.` };
  });
  refresh();
}

const ExclusionInput = z.object({
  statement: z.string().trim().min(1, "Say what you don't do.").max(200),
  insteadText: z.string().trim().max(300),
  partnerId: z.string().trim().max(128),
});

/** FR-OFR-4: an exclusion on this offering. The Fit Analyst marks a matching need Cannot meet. */
export async function addExclusion(offeringId: string, _previous: ScopeFormState, formData: FormData): Promise<ScopeFormState> {
  const context = await requireRole("editor");
  const input = ExclusionInput.safeParse({ statement: formData.get("statement") ?? "", insteadText: formData.get("insteadText") ?? "", partnerId: formData.get("partnerId") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message };
  const base = db().collection("workspaces").doc(context.workspace.id);
  const [offering, partner] = await Promise.all([
    base.collection("offerings").doc(offeringId).get(),
    input.data.partnerId ? base.collection("partners").doc(input.data.partnerId).get() : null,
  ]);
  if (!offering.exists || offering.get("deletedAt")) return { error: "This offering no longer exists." };
  if (partner && (!partner.exists || partner.get("deletedAt"))) return { error: "That partner no longer exists." };
  await createEntity(
    context,
    "constraints",
    {
      kind: "scope",
      statement: input.data.statement,
      values: [],
      offeringIds: [offeringId],
      insteadText: input.data.insteadText || undefined,
      partnerId: input.data.partnerId || undefined,
    },
    `Added an exclusion to ${offering.get("name")}: ${input.data.statement}.`,
  );
  refresh();
  return { ok: Date.now() };
}

export async function removeExclusion(constraintId: string): Promise<void> {
  const context = await requireRole("editor");
  const snap = await db().doc(`workspaces/${context.workspace.id}/constraints/${constraintId}`).get();
  if (!snap.exists || (snap.get("offeringIds") as string[] | undefined)?.length === 0) return;
  await softDeleteEntity(context, "constraints", constraintId, `Removed the exclusion: ${snap.get("statement")}.`);
  refresh();
}
