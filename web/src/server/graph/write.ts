import "server-only";
import type { DocumentData } from "firebase-admin/firestore";
import { AuditEvent, type Provenance, type SourceRef } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import type { HubContext } from "@/server/workspace/access";

export class ConflictError extends Error {
  constructor() {
    super("Someone changed this since you opened it. Reload to see their version, then make your change again.");
    this.name = "ConflictError";
  }
}

export class GoneError extends Error {
  constructor() {
    super("This no longer exists. It may have been deleted.");
    this.name = "GoneError";
  }
}

export type GraphCollection = "offerings" | "rateCards" | "feeSchedules" | "proof" | "constraints" | "partners";

/**
 * The one way a hand edit changes a graph entity (ADR-0009 D3, invariant 10).
 * In a transaction: re-reads the entity, refuses a stale revision (conflict
 * detection, FR-OFR-5), applies the change, bumps `rev`, stamps who and when,
 * and writes the audit event. `change` returns null when nothing changed.
 */
export async function editEntity(
  context: HubContext,
  collection: GraphCollection,
  id: string,
  expectedRev: number | null,
  change: (current: DocumentData) => { patch: DocumentData; summary: string } | null,
): Promise<{ rev: number; changed: boolean }> {
  const ref = db().doc(`workspaces/${context.workspace.id}/${collection}/${id}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data();
    if (!current || current.deletedAt) throw new GoneError();
    if (expectedRev !== null && current.rev !== expectedRev) throw new ConflictError();
    const result = change(current);
    if (!result) return { rev: current.rev as number, changed: false };

    const now = new Date().toISOString();
    const rev = (current.rev as number) + 1;
    tx.update(ref, { ...result.patch, rev, updatedAt: now, updatedBy: context.user.name });
    tx.set(
      db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "update", entity: collection, entityId: id, summary: result.summary, by: context.user.uid, byName: context.user.name, at: now }),
    );
    return { rev, changed: true };
  });
}

/**
 * Creates a graph entity, with the envelope filled in and an audit event. By
 * hand unless `origin` says it came from an applied proposal (ADR-0009 D4).
 */
export async function createEntity(
  context: HubContext,
  collection: GraphCollection,
  fields: DocumentData,
  summary: string,
  origin?: { provenance: Provenance; sources: SourceRef[] },
): Promise<string> {
  const base = db().collection("workspaces").doc(context.workspace.id);
  const ref = base.collection(collection).doc();
  const now = new Date().toISOString();
  const batch = db().batch();
  batch.set(
    ref,
    JSON.parse(
      JSON.stringify({
        ...fields,
        id: ref.id,
        workspaceId: context.workspace.id,
        rev: 1,
        provenance: origin?.provenance ?? { via: "manual", confirmedBy: context.user.name, confirmedAt: now },
        sources: origin?.sources ?? [],
        restricted: false,
        deletedAt: null,
        deleteBatchId: null,
        createdAt: now,
        updatedAt: now,
        updatedBy: context.user.name,
      }),
    ),
  );
  batch.set(base.collection("auditEvents").doc(), AuditEvent.parse({ action: "create", entity: collection, entityId: ref.id, summary, by: context.user.uid, byName: context.user.name, at: now }));
  await batch.commit();
  return ref.id;
}

/** Soft delete (CLAUDE.md conventions): the entity stays, marked deleted, and the recycle bin can restore it. */
export async function softDeleteEntity(context: HubContext, collection: GraphCollection, id: string, summary: string): Promise<void> {
  const { softDeleteBatch } = await import("./delete");
  await softDeleteBatch(context, summary.replace(/\.$/, ""), [{ collection, id }], summary);
}

/** What a client form gets back from an edit. */
export type EditResult = { ok: true; rev: number } | { ok: false; error: string; conflict?: boolean };

export function editError(err: unknown): EditResult {
  if (err instanceof ConflictError) return { ok: false, error: err.message, conflict: true };
  if (err instanceof GoneError) return { ok: false, error: err.message };
  throw err;
}
