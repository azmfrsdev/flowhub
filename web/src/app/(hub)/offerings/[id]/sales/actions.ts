"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import type { FormResult } from "@/components/flowhub/edit-dialog";
import { AuditEvent, DocumentKind, Proof } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { softDeleteBatch } from "@/server/graph/delete";
import { GoneError, createEntity, editEntity, editError } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

/** ADR-0009 D3: the public flag on a result is edited by hand. Only public results can be cited (invariant 5). */
export async function setProofPublic(proofId: string, isPublic: boolean): Promise<void> {
  const context = await requireRole("editor");
  [proofId, isPublic] = parseArgs([ArgId, z.boolean()], [proofId, isPublic]);
  await editEntity(context, "proof", proofId, null, (current) => {
    const proof = Proof.parse(current);
    if (proof.isPublic === isPublic) return null;
    return { patch: { isPublic }, summary: `Marked "${proof.title}" as ${isPublic ? "public: proposals may cite it" : "not public: proposals can't cite it"}.` };
  });
  refresh();
}

const ProofInput = z.object({
  kind: z.enum(["case_study", "metric", "logo", "testimonial"]),
  title: z.string().trim().min(1, "Say what the result is.").max(200),
  body: z.string().trim().max(1000),
  clientName: z.string().trim().max(120),
  isPublic: z.boolean(),
});

function proofInput(formData: FormData) {
  return ProofInput.safeParse({
    kind: formData.get("kind"),
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    clientName: formData.get("clientName") ?? "",
    isPublic: formData.get("isPublic") === "on",
  });
}

/** FR-OFR-7: a result you can cite, added by hand to this offering. */
export async function addProof(offeringId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
  const input = proofInput(formData);
  if (!input.success) return { error: input.error.issues[0]?.message };
  const offering = await db().doc(`workspaces/${context.workspace.id}/offerings/${offeringId}`).get();
  if (!offering.exists || offering.get("deletedAt")) return { error: "This offering no longer exists." };
  const { clientName, ...rest } = input.data;
  await createEntity(context, "proof", { ...rest, ...(clientName ? { clientName } : {}), offeringIds: [offeringId] }, `Added a result to ${offering.get("name")}: ${rest.title}`);
  refresh();
  return { ok: Date.now() };
}

/** FR-OFR-7: a result's wording, client and whether proposals may cite it (invariant 5). */
export async function updateProof(proofId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const context = await requireRole("editor");
  [proofId] = parseArgs([ArgId], [proofId]);
  const input = proofInput(formData);
  if (!input.success) return { error: input.error.issues[0]?.message };
  try {
    await editEntity(context, "proof", proofId, null, (current) => {
      const proof = Proof.parse(current);
      const { kind, title, body, clientName, isPublic } = input.data;
      if (proof.kind === kind && proof.title === title && proof.body === body && (proof.clientName ?? "") === clientName && proof.isPublic === isPublic) return null;
      return { patch: { kind, title, body, clientName: clientName || FieldValue.delete(), isPublic }, summary: `Edited the result "${title}"${proof.isPublic !== isPublic ? `, now ${isPublic ? "public" : "not public"}` : ""}.` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

export async function deleteProof(proofId: string): Promise<FormResult> {
  const context = await requireRole("editor");
  [proofId] = parseArgs([ArgId], [proofId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/proof/${proofId}`).get();
  if (!snap.exists || snap.get("deletedAt")) return { error: new GoneError().message };
  await softDeleteBatch(context, `Result: ${snap.get("title")}`, [{ collection: "proof", id: proofId }], `Deleted the result "${snap.get("title")}".`);
  refresh();
  return { ok: Date.now() };
}

const DocumentInput = z.object({ kind: DocumentKind, shareable: z.boolean() });

/** FR-ING-2: a file's kind, which FlowHub suggests and a person can change, and whether clients may see it. */
export async function updateDocument(documentId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const context = await requireRole("editor");
  [documentId] = parseArgs([ArgId], [documentId]);
  const input = DocumentInput.safeParse({ kind: formData.get("kind"), shareable: formData.get("shareable") === "on" });
  if (!input.success) return { error: "Choose what kind of file this is." };
  const ref = db().doc(`workspaces/${context.workspace.id}/documents/${documentId}`);
  const now = new Date().toISOString();
  const error = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("deletedAt")) return new GoneError().message;
    if (snap.get("kind") === input.data.kind && Boolean(snap.get("shareable")) === input.data.shareable) return null;
    tx.update(ref, input.data);
    tx.set(
      db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "update", entity: "document", entityId: documentId, summary: `Updated ${snap.get("name")}: ${input.data.shareable ? "OK to share with clients" : "internal only"}.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
    return null;
  });
  if (error) return { error };
  refresh();
  return { ok: Date.now() };
}

/** A file leaves the hub but stays in the recycle bin. Facts read from it keep their source chip. */
export async function deleteDocument(documentId: string): Promise<FormResult> {
  const context = await requireRole("editor");
  [documentId] = parseArgs([ArgId], [documentId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/documents/${documentId}`).get();
  if (!snap.exists || snap.get("deletedAt")) return { error: new GoneError().message };
  await softDeleteBatch(context, `File: ${snap.get("name")}`, [{ collection: "documents", id: documentId }], `Deleted the file ${snap.get("name")}.`);
  refresh();
  return { ok: Date.now() };
}
