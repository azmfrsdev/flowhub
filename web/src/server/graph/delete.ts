import "server-only";
import { AuditEvent } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import type { HubContext } from "@/server/workspace/access";
import { GoneError, type GraphCollection } from "./write";

/**
 * Soft delete with a recycle bin (CLAUDE.md conventions, FR-TR-1). Everything
 * removed together shares one batch, recorded in `deletions/{batchId}`, so
 * restoring the item brings back what went with it (R10: an offering's
 * sub-offerings, pricing, exclusions and notes).
 */

export type DeletableCollection = GraphCollection | "notes" | "documents" | "opportunities";
export type DeletedItem = { collection: DeletableCollection; id: string };

export type Deletion = {
  id: string;
  /** What the bin shows, such as "Offering: Google Cloud migration". */
  label: string;
  items: DeletedItem[];
  deletedAt: string;
  deletedBy: string;
};

/** Marks every item deleted under one batch. The first item is the one the person chose; it must still exist. */
export async function softDeleteBatch(context: HubContext, label: string, items: DeletedItem[], summary: string): Promise<string> {
  const base = db().collection("workspaces").doc(context.workspace.id);
  const deletionRef = base.collection("deletions").doc();
  const now = new Date().toISOString();
  const unique = items.filter((item, index) => items.findIndex((other) => other.collection === item.collection && other.id === item.id) === index);
  await db().runTransaction(async (tx) => {
    const snaps = await Promise.all(unique.map((item) => tx.get(base.collection(item.collection).doc(item.id))));
    if (!snaps[0]?.exists || snaps[0].get("deletedAt")) throw new GoneError();
    const live = unique.filter((_, index) => snaps[index].exists && !snaps[index].get("deletedAt"));
    live.forEach((item) => {
      const snap = snaps[unique.indexOf(item)];
      tx.update(base.collection(item.collection).doc(item.id), {
        deletedAt: now,
        deleteBatchId: deletionRef.id,
        ...(typeof snap.get("rev") === "number" ? { rev: (snap.get("rev") as number) + 1 } : {}),
        updatedAt: now,
        ...(item.collection === "opportunities" || item.collection === "notes" || item.collection === "documents" ? {} : { updatedBy: context.user.name }),
      });
    });
    const deletion: Deletion = { id: deletionRef.id, label, items: live, deletedAt: now, deletedBy: context.user.name };
    tx.set(deletionRef, deletion);
    tx.set(
      base.collection("auditEvents").doc(),
      AuditEvent.parse({ action: "delete", entity: unique[0].collection, entityId: unique[0].id, summary, by: context.user.uid, byName: context.user.name, at: now }),
    );
  });
  return deletionRef.id;
}

/** Restores a whole batch. An item deleted again later, in another batch, stays where that batch put it. */
export async function restoreBatch(context: HubContext, batchId: string): Promise<Deletion> {
  const base = db().collection("workspaces").doc(context.workspace.id);
  const deletionRef = base.collection("deletions").doc(batchId);
  const now = new Date().toISOString();
  return db().runTransaction(async (tx) => {
    const deletion = (await tx.get(deletionRef)).data() as Deletion | undefined;
    if (!deletion) throw new GoneError();
    const snaps = await Promise.all(deletion.items.map((item) => tx.get(base.collection(item.collection).doc(item.id))));
    deletion.items.forEach((item, index) => {
      const snap = snaps[index];
      if (!snap.exists || snap.get("deleteBatchId") !== batchId) return;
      tx.update(base.collection(item.collection).doc(item.id), {
        deletedAt: null,
        deleteBatchId: null,
        ...(typeof snap.get("rev") === "number" ? { rev: (snap.get("rev") as number) + 1 } : {}),
        updatedAt: now,
      });
    });
    tx.delete(deletionRef);
    tx.set(
      base.collection("auditEvents").doc(),
      AuditEvent.parse({ action: "restore", entity: deletion.items[0]?.collection ?? "deletion", entityId: deletion.items[0]?.id ?? batchId, summary: `Restored ${deletion.label}.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
    return deletion;
  });
}
