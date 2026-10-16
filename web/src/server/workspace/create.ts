import "server-only";
import { AuditEvent, DocumentRecord, Member, Workspace } from "@/lib/schema";
import type { SessionUser } from "@/server/auth/session";
import { malaysiaDay } from "@/lib/offerings/view";
import { sampleHistoryDocs } from "@/lib/sample/history";
import { FieldValue } from "firebase-admin/firestore";
import { bucket, db } from "@/server/firebase/admin";
import { graphToDocs } from "./import-graph";

export class WorkspaceExistsError extends Error {
  constructor() {
    super("You already have a workspace.");
    this.name = "WorkspaceExistsError";
  }
}

type WorkspaceFields = Omit<Workspace, "id" | "createdAt" | "createdBy" | "deletedAt">;

/**
 * Creates a workspace with the user as its Owner (FR-WS-2, FR-WS-3), and
 * optionally imports an offering graph into it (R12). The user's single
 * workspace slot is claimed in a transaction first, so a double click can't
 * create two. Server-only writes (invariant 10).
 *
 * With `replaces` (FR-WS-4), the slot must still hold that workspace. It is
 * soft-deleted, not removed, and today's usage carries over, so switching
 * sample sellers never resets the daily caps (FR-CAP-1).
 */
export async function createWorkspace(
  user: SessionUser,
  fields: WorkspaceFields,
  seed?: { graph: unknown; documents?: DocumentRecord[] },
  { replaces }: { replaces?: string } = {},
): Promise<string> {
  const firestore = db();
  const workspaceRef = firestore.collection("workspaces").doc();
  const now = new Date().toISOString();
  const workspace = Workspace.parse({ ...fields, id: workspaceRef.id, createdAt: now, createdBy: user.uid });
  // Validate the import before claiming anything, so a bad export changes nothing.
  const graphDocs = seed ? graphToDocs(seed.graph, workspaceRef.id) : [];
  for (const doc of seed?.documents ?? []) {
    const record = DocumentRecord.parse({ ...doc, workspaceId: workspaceRef.id });
    graphDocs.push({ path: `workspaces/${workspaceRef.id}/documents/${record.id}`, data: JSON.parse(JSON.stringify(record)) });
  }
  const imported = graphDocs.length;
  // PRD section 10: a sample workspace comes with history (past deals, audit entries, pending proposals).
  if (seed && workspace.sample) graphDocs.push(...sampleHistoryDocs(workspace.sample, workspaceRef.id));

  await firestore.runTransaction(async (tx) => {
    const userRef = firestore.doc(`users/${user.uid}`);
    const current = (await tx.get(userRef)).get("workspaceId") || undefined;
    if (current !== replaces) throw new WorkspaceExistsError();
    if (replaces) {
      const oldRef = firestore.doc(`workspaces/${replaces}`);
      const usage = await tx.get(oldRef.collection("usage").doc(malaysiaDay()));
      if (usage.exists) tx.set(workspaceRef.collection("usage").doc(usage.id), usage.data()!);
      tx.update(oldRef, { deletedAt: now });
      tx.set(
        oldRef.collection("auditEvents").doc(),
        AuditEvent.parse({ action: "delete", entity: "workspace", entityId: replaces, summary: `Replaced by a sample workspace for ${workspace.name}.`, by: user.uid, byName: user.name, at: now }),
      );
    }
    tx.set(workspaceRef, workspace);
    tx.set(
      workspaceRef.collection("members").doc(user.uid),
      Member.parse({ role: "owner", email: user.email, name: user.name, addedBy: user.uid, addedAt: now }),
    );
    tx.set(userRef, { workspaceId: workspaceRef.id });
    tx.set(
      workspaceRef.collection("auditEvents").doc(),
      AuditEvent.parse({
        action: "create",
        entity: "workspace",
        entityId: workspaceRef.id,
        summary: workspace.sample ? `Created a sample workspace for ${workspace.name}.` : `Created the ${workspace.name} workspace.`,
        by: user.uid,
        byName: user.name,
        at: now,
      }),
    );
  });

  for (let i = 0; i < graphDocs.length; i += 400) {
    const batch = firestore.batch();
    for (const doc of graphDocs.slice(i, i + 400)) batch.set(firestore.doc(doc.path), doc.data);
    await batch.commit();
  }
  if (imported > 0) {
    await workspaceRef.collection("auditEvents").add(
      AuditEvent.parse({
        action: "create",
        entity: "offering-graph",
        entityId: workspaceRef.id,
        summary: `Imported ${workspace.name}'s catalogue: ${imported} records.`,
        by: user.uid,
        byName: user.name,
        at: new Date().toISOString(),
      }),
    );
  }
  return workspaceRef.id;
}

/**
 * Deletes a user's workspace for good (FR-WS-7, the privacy page): the user's
 * slot is cleared first, so nothing reads it while it goes, then every
 * workspace they created (including replaced sample copies) and its uploaded
 * files are removed.
 */
export async function deleteWorkspaceData(uid: string, workspaceId: string): Promise<void> {
  const firestore = db();
  const userRef = firestore.doc(`users/${uid}`);
  const claimed = await firestore.runTransaction(async (tx) => {
    // A second click finds the slot already cleared: nothing left to do.
    if ((await tx.get(userRef)).get("workspaceId") !== workspaceId) return false;
    tx.update(userRef, { workspaceId: FieldValue.delete() });
    return true;
  });
  if (!claimed) return;
  const created = await firestore.collection("workspaces").where("createdBy", "==", uid).get();
  const ids = new Set([workspaceId, ...created.docs.map((doc) => doc.id)]);
  for (const id of ids) {
    await bucket().deleteFiles({ prefix: `workspaces/${id}/` });
    await firestore.recursiveDelete(firestore.doc(`workspaces/${id}`));
  }
}
