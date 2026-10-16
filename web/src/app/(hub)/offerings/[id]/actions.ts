"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormResult } from "@/components/flowhub/edit-dialog";
import { Offering } from "@/lib/schema";
import { offeringDeleteSet } from "@/lib/offerings/view";
import { softDeleteBatch } from "@/server/graph/delete";
import { getGraphFor } from "@/server/graph/load";
import { GoneError, editEntity, editError } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

const OfferingInput = z.object({
  name: z.string().trim().min(1, "Name the offering.").max(120),
  type: z.enum(["service", "package", "product"]),
  status: z.enum(["active", "pilot", "retired"]),
  owner: z.string().trim().max(80),
  summary: z.string().trim().max(300, "Keep the summary to a sentence or two."),
  description: z.string().trim().max(2000),
  typicalLength: z.string().trim().max(80),
  bestFor: z.string().trim().max(200),
});

/** ADR-0009 D3 as amended 2026-10-16: an offering's details are edited by hand. */
export async function updateOffering(offeringId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
  const input = OfferingInput.safeParse(Object.fromEntries(["name", "type", "status", "owner", "summary", "description", "typicalLength", "bestFor"].map((key) => [key, String(formData.get(key) ?? "")])));
  if (!input.success) return { error: input.error.issues[0]?.message };
  const { name, type, status, owner, summary, description, typicalLength, bestFor } = input.data;
  try {
    await editEntity(context, "offerings", offeringId, null, (current) => {
      const offering = Offering.parse(current);
      const facts = { ...(typicalLength ? { typicalLength } : {}), ...(bestFor ? { bestFor } : {}) };
      const same =
        offering.name === name && offering.type === type && offering.status === status && (offering.owner ?? "") === owner && offering.summary === summary && offering.description === description && (offering.facts.typicalLength ?? "") === typicalLength && (offering.facts.bestFor ?? "") === bestFor;
      if (same) return null;
      return { patch: { name, type, status, owner: owner || FieldValue.delete(), summary, description, facts }, summary: `Updated the details of ${name}.` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

/**
 * R10: deleting an offering deletes its sub-offerings and their pricing,
 * exclusions, notes and the results that belong only to them, as one batch.
 * Restoring it from the recycle bin brings them all back. Partners and files
 * shared with other offerings stay.
 */
export async function deleteOffering(offeringId: string): Promise<FormResult> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
  const graph = await getGraphFor(context.workspace.id);
  const offering = graph.offerings.find((item) => item.id === offeringId);
  if (!offering) return { error: new GoneError().message };
  const items = offeringDeleteSet(graph, offeringId);
  const children = items.filter((item) => item.collection === "offerings").length - 1;
  try {
    await softDeleteBatch(context, `Offering: ${offering.name}`, items, `Deleted ${offering.name}${children ? ` and ${children} sub-${children === 1 ? "offering" : "offerings"}` : ""}, with its pricing, exclusions and notes.`);
  } catch (err) {
    if (err instanceof GoneError) return { error: err.message };
    throw err;
  }
  redirect("/offerings");
}
