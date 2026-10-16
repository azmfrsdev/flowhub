"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { z } from "zod";
import { Feature, Offering } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { GoneError, createEntity, editEntity, editError, softDeleteEntity } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

export type ScopeFormState = { error?: string; ok?: number };

const FeatureInput = z.object({
  name: z.string().trim().min(1, "Name the feature.").max(120),
  description: z.string().trim().max(500, "Keep it to a sentence or two."),
});

/** ADR-0009 D3: features are edited by hand. Appends to What's included. */
export async function addFeature(offeringId: string, _previous: ScopeFormState, formData: FormData): Promise<ScopeFormState> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
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
  [offeringId, featureId] = parseArgs([ArgId, ArgId], [offeringId, featureId]);
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
  [offeringId] = parseArgs([ArgId], [offeringId]);
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
  [constraintId] = parseArgs([ArgId], [constraintId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/constraints/${constraintId}`).get();
  if (!snap.exists || (snap.get("offeringIds") as string[] | undefined)?.length === 0) return;
  await softDeleteEntity(context, "constraints", constraintId, `Removed the exclusion: ${snap.get("statement")}.`);
  refresh();
}

const FeatureEdit = FeatureInput.extend({ status: z.enum(["active", "planned"]) });

/** ADR-0009 D3 as amended 2026-10-16: a feature's name, description and whether it's available or only planned. */
export async function updateFeature(offeringId: string, featureId: string, _previous: ScopeFormState, formData: FormData): Promise<ScopeFormState> {
  const context = await requireRole("editor");
  [offeringId, featureId] = parseArgs([ArgId, ArgId], [offeringId, featureId]);
  const input = FeatureEdit.safeParse({ name: formData.get("name") ?? "", description: formData.get("description") ?? "", status: formData.get("status") });
  if (!input.success) return { error: input.error.issues[0]?.message };
  try {
    await editEntity(context, "offerings", offeringId, null, (current) => {
      const offering = Offering.parse(current);
      const feature = offering.features.find((item) => item.id === featureId && item.status !== "retired");
      if (!feature) throw new GoneError();
      if (feature.name === input.data.name && feature.description === input.data.description && feature.status === input.data.status) return null;
      const features = offering.features.map((item) => (item.id === featureId ? { ...item, ...input.data } : item));
      return { patch: { features: JSON.parse(JSON.stringify(features)) }, summary: `Edited ${input.data.name} in the scope of ${offering.name}.` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

/** FR-OFR-4: an exclusion's wording and what's offered instead. */
export async function updateExclusion(constraintId: string, _previous: ScopeFormState, formData: FormData): Promise<ScopeFormState> {
  const context = await requireRole("editor");
  [constraintId] = parseArgs([ArgId], [constraintId]);
  const input = ExclusionInput.safeParse({ statement: formData.get("statement") ?? "", insteadText: formData.get("insteadText") ?? "", partnerId: formData.get("partnerId") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message };
  if (input.data.partnerId) {
    const partner = await db().doc(`workspaces/${context.workspace.id}/partners/${input.data.partnerId}`).get();
    if (!partner.exists || partner.get("deletedAt")) return { error: "That partner no longer exists." };
  }
  try {
    await editEntity(context, "constraints", constraintId, null, (current) => {
      if (!(current.offeringIds as string[] | undefined)?.length) throw new GoneError();
      const { statement, insteadText, partnerId } = input.data;
      if (current.statement === statement && (current.insteadText ?? "") === insteadText && (current.partnerId ?? "") === partnerId) return null;
      return { patch: { statement, insteadText: insteadText || FieldValue.delete(), partnerId: partnerId || FieldValue.delete() }, summary: `Edited the exclusion: ${statement}.` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}
