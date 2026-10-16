import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { malaysiaDay } from "@/lib/offerings/view";
import { AuditEvent, DocumentRecord } from "@/lib/schema";
import { bucket, db } from "@/server/firebase/admin";
import { dispatchJob } from "@/server/jobs/dispatch";
import type { HubContext } from "@/server/workspace/access";
import { CAPS } from "@/server/workspace/caps";
import { PAUSED_MESSAGE, agentsPaused } from "@/server/workspace/flags";

/**
 * Uploading a file for Ask or tell or a Sales material tab (PRD FR-ING-1 as
 * changed in 7.0: PDF only). The server stores it, records it as Uploaded, and
 * queues the read; the browser never writes to Firestore or Storage itself
 * (invariant 10).
 */

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const STALLED_MS = 5 * 60 * 1000;

export async function uploadDocument(context: HubContext, file: File, input: { scopeOfferingId?: string; message?: string }): Promise<string> {
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Files can be up to 20 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new UploadError("FlowHub reads PDF files for now. Save it as a PDF and try again.");
  const name = file.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "Untitled.pdf";

  const ws = context.workspace.id;
  const base = db().collection("workspaces").doc(ws);
  const ref = base.collection("documents").doc();
  const usageRef = base.collection("usage").doc(malaysiaDay());
  const flagsRef = db().doc("system/flags");
  const scopeRef = input.scopeOfferingId ? base.collection("offerings").doc(input.scopeOfferingId) : null;
  const now = new Date().toISOString();
  const record = DocumentRecord.parse({
    id: ref.id,
    workspaceId: ws,
    name,
    kind: "other",
    offeringIds: input.scopeOfferingId ? [input.scopeOfferingId] : [],
    shareable: false,
    storagePath: `workspaces/${ws}/documents/${ref.id}.pdf`,
    status: "uploaded",
    ...(input.message ? { message: input.message } : {}),
    uploadedBy: context.user.name,
    uploadedAt: now,
  });

  // FR-CAP-1 and FR-CAP-2: the upload cap and the kill switch, in the same transaction that records the file.
  await db().runTransaction(async (tx) => {
    const [usage, flags, scope] = await Promise.all([tx.get(usageRef), tx.get(flagsRef), scopeRef ? tx.get(scopeRef) : null]);
    if (flags.exists && flags.get("agentsEnabled") === false) throw new UploadError("The agents are paused for now. Try again later.");
    const used = Number(usage.get("uploads") ?? 0);
    if (used >= CAPS.uploads) throw new UploadError(`Today's limit of ${CAPS.uploads} uploads is used up. It resets at midnight, Malaysia time.`);
    if (scope && (!scope.exists || scope.get("deletedAt"))) throw new UploadError("That offering no longer exists.");
    tx.set(usageRef, { uploads: used + 1 }, { merge: true });
    tx.set(ref, JSON.parse(JSON.stringify(record)));
    tx.set(
      base.collection("auditEvents").doc(),
      AuditEvent.parse({ action: "create", entity: "document", entityId: ref.id, summary: `Uploaded ${name}.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
  });

  try {
    await bucket().file(record.storagePath).save(bytes, { contentType: "application/pdf", resumable: false });
    await dispatchJob({ kind: "ingest", workspaceId: ws, documentId: ref.id });
  } catch (err) {
    console.error(`Upload of document ${ref.id} didn't finish:`, err);
    await ref.update({ status: "failed", error: "The upload didn't finish. Try again." });
    throw new UploadError("The upload didn't finish. Try again in a moment.");
  }
  return ref.id;
}

/** FR-ING-3: a failed read, or one with no progress for 5 minutes, can be retried. It doesn't count as another upload. */
export async function retryDocument(context: HubContext, documentId: string): Promise<void> {
  if (await agentsPaused()) throw new UploadError(PAUSED_MESSAGE);
  const ref = db().doc(`workspaces/${context.workspace.id}/documents/${documentId}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new UploadError("That file no longer exists.");
    const status = snap.get("status") as DocumentRecord["status"];
    const since = Date.now() - new Date((snap.get("readingAt") as string | undefined) ?? (snap.get("uploadedAt") as string)).getTime();
    const stalled = (status === "reading" || status === "uploaded") && since > STALLED_MS;
    if (status !== "failed" && !stalled) throw new UploadError("FlowHub is still reading this file.");
    tx.update(ref, { status: "uploaded", error: FieldValue.delete() });
  });
  await dispatchJob({ kind: "ingest", workspaceId: context.workspace.id, documentId });
}
