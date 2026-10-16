"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AuditEvent, Note } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { requireRole } from "@/server/workspace/access";

export type NoteFormState = { error?: string; ok?: number };

const NoteText = z.string().trim().min(1, "Write something first.").max(4000, "Keep a note under 4,000 characters.");

/** FR-OFR-8: add a note to an offering. Editors and owners only (ADR-0008). */
export async function addNote(offeringId: string, _previous: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const { workspace, user } = await requireRole("editor");
  const text = NoteText.safeParse(formData.get("text"));
  if (!text.success) return { error: text.error.issues[0]?.message };

  const base = db().collection("workspaces").doc(workspace.id);
  const offering = await base.collection("offerings").doc(offeringId).get();
  if (!offering.exists || offering.get("deletedAt")) return { error: "This offering no longer exists." };

  const now = new Date().toISOString();
  const ref = base.collection("notes").doc();
  const note = Note.parse({
    id: ref.id,
    workspaceId: workspace.id,
    offeringId,
    text: text.data,
    pinned: false,
    by: user.uid,
    byName: user.name,
    at: now,
    provenance: { via: "manual", confirmedBy: user.name, confirmedAt: now },
  });
  const batch = db().batch();
  batch.set(ref, note);
  batch.set(
    base.collection("auditEvents").doc(),
    AuditEvent.parse({ action: "create", entity: "note", entityId: ref.id, summary: `Added a note to ${offering.get("name")}.`, by: user.uid, byName: user.name, at: now }),
  );
  await batch.commit();
  refresh();
  return { ok: Date.now() };
}

/** Pin or unpin a note. */
export async function setNotePinned(noteId: string, pinned: boolean): Promise<void> {
  const { workspace, user } = await requireRole("editor");
  const ref = db().doc(`workspaces/${workspace.id}/notes/${noteId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const now = new Date().toISOString();
  const batch = db().batch();
  batch.update(ref, { pinned });
  batch.set(
    db().collection(`workspaces/${workspace.id}/auditEvents`).doc(),
    AuditEvent.parse({ action: "update", entity: "note", entityId: noteId, summary: pinned ? "Pinned a note." : "Unpinned a note.", by: user.uid, byName: user.name, at: now }),
  );
  await batch.commit();
  refresh();
}
