"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AuditEvent, Note } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { ModelOutputError } from "@/server/ai/generate";
import { softDeleteBatch } from "@/server/graph/delete";
import { SummaryError, summariseNotes } from "@/server/pipelines/notes";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

export type NoteFormState = { error?: string; ok?: number };

const NoteText = z.string().trim().min(1, "Write something first.").max(4000, "Keep a note under 4,000 characters.");

/** FR-OFR-8: add a note to an offering. Editors and owners only (ADR-0008). */
export async function addNote(offeringId: string, _previous: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const { workspace, user } = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
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
  [noteId, pinned] = parseArgs([ArgId, z.boolean()], [noteId, pinned]);
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

export type SummaryState = { error?: string; ok?: number };

/** FR-OFR-8: the AI summary, written only from this offering's notes. One AI run, on request. */
export async function writeNotesSummary(offeringId: string): Promise<SummaryState> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
  try {
    await summariseNotes(context, offeringId);
  } catch (err) {
    if (err instanceof SummaryError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: "Gemini's answer didn't have the expected shape. Try again." };
    throw err;
  }
  refresh();
  return { ok: Date.now() };
}

/** FR-OFR-8: a note's text, corrected by hand. The summary shows as out of date until it's written again. */
export async function updateNote(noteId: string, _previous: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const { workspace, user } = await requireRole("editor");
  [noteId] = parseArgs([ArgId], [noteId]);
  const text = NoteText.safeParse(formData.get("text"));
  if (!text.success) return { error: text.error.issues[0]?.message };
  const ref = db().doc(`workspaces/${workspace.id}/notes/${noteId}`);
  const now = new Date().toISOString();
  const error = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("deletedAt")) return "This note no longer exists.";
    if (snap.get("text") === text.data) return null;
    // `at` moves to now, so the notes summary knows it was written before this change.
    tx.update(ref, { text: text.data, at: now, editedBy: user.name });
    tx.set(
      db().collection(`workspaces/${workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "update", entity: "note", entityId: noteId, summary: "Edited a note.", by: user.uid, byName: user.name, at: now }),
    );
    return null;
  });
  if (error) return { error };
  refresh();
  return { ok: Date.now() };
}

export async function deleteNote(noteId: string): Promise<NoteFormState> {
  const context = await requireRole("editor");
  [noteId] = parseArgs([ArgId], [noteId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/notes/${noteId}`).get();
  if (!snap.exists || snap.get("deletedAt")) return { error: "This note no longer exists." };
  const text = String(snap.get("text") ?? "");
  await softDeleteBatch(context, `Note: ${text.length > 60 ? `${text.slice(0, 57)}…` : text}`, [{ collection: "notes", id: noteId }], "Deleted a note.");
  refresh();
  return { ok: Date.now() };
}
