"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AuditEvent, Offering } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { requireRole } from "@/server/workspace/access";

export type NewOfferingState = { fieldErrors?: Partial<Record<"name" | "type" | "summary" | "owner", string>>; values?: Record<string, string> };

const NewOfferingInput = z.object({
  name: z.string().trim().min(1, "Give the offering a name.").max(120),
  type: Offering.shape.type,
  summary: z.string().trim().max(300, "Keep the summary to one or two sentences."),
  owner: z.string().trim().max(80),
});

/** FR-OFR-1: New offering, by hand. Everything else is filled in on its tabs. */
export async function createOffering(_previous: NewOfferingState, formData: FormData): Promise<NewOfferingState> {
  const { workspace, user } = await requireRole("editor");
  const values = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
  const parsed = NewOfferingInput.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: NewOfferingState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as keyof NonNullable<NewOfferingState["fieldErrors"]>] ??= issue.message;
    return { fieldErrors, values };
  }

  const now = new Date().toISOString();
  const base = db().collection("workspaces").doc(workspace.id);
  const ref = base.collection("offerings").doc();
  const offering = Offering.parse({
    id: ref.id,
    workspaceId: workspace.id,
    rev: 1,
    provenance: { via: "manual", confirmedBy: user.name, confirmedAt: now },
    sources: [],
    restricted: false,
    deletedAt: null,
    deleteBatchId: null,
    createdAt: now,
    updatedAt: now,
    updatedBy: user.name,
    parentId: null,
    type: parsed.data.type,
    name: parsed.data.name,
    summary: parsed.data.summary,
    status: "active",
    owner: parsed.data.owner || undefined,
  });
  const batch = db().batch();
  batch.set(ref, JSON.parse(JSON.stringify(offering)));
  batch.set(
    base.collection("auditEvents").doc(),
    AuditEvent.parse({ action: "create", entity: "offering", entityId: ref.id, summary: `Added the offering ${offering.name}.`, by: user.uid, byName: user.name, at: now }),
  );
  await batch.commit();
  redirect(`/offerings/${ref.id}`);
}
