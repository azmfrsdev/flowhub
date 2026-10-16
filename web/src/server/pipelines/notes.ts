import "server-only";
import { z } from "zod";
import { checkSummary, noteRefs, SUMMARY_SECTIONS } from "@/lib/offerings/notes-summary";
import { AuditEvent, Note, NoteSummary } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";

export class SummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SummaryError";
  }
}

const Draft = z.object({
  lines: z.array(z.object({ section: z.enum(SUMMARY_SECTIONS), text: z.string().min(1).max(300), refs: z.array(z.string()) })).max(12),
});

/** The newest notes are enough for a summary, and they keep the prompt small. */
const MAX_NOTES = 60;

/**
 * FR-OFR-8: summarises an offering's notes with Flash, then checks every line
 * in code (lib/offerings/notes-summary). One call, counted as an AI run
 * against the daily cap; the kill switch stops it (FR-CAP-1, FR-CAP-2). Reads
 * only the caller's workspace (invariant 7) and writes only the summary.
 */
export async function summariseNotes(context: HubContext, offeringId: string): Promise<NoteSummary> {
  const base = db().collection("workspaces").doc(context.workspace.id);
  const [offering, snap] = await Promise.all([base.collection("offerings").doc(offeringId).get(), base.collection("notes").where("offeringId", "==", offeringId).get()]);
  if (!offering.exists || offering.get("deletedAt")) throw new SummaryError("This offering no longer exists.");
  const notes = snap.docs
    .map((doc) => Note.parse({ ...doc.data(), id: doc.id }))
    .filter((note) => !note.deletedAt)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_NOTES);
  if (notes.length === 0) throw new SummaryError("Add a note first. The summary is written only from this offering's notes.");

  try {
    await chargeAiRun(context.workspace.id);
  } catch (err) {
    if (err instanceof UsageError) throw new SummaryError(err.message);
    throw err;
  }

  const refs = [...noteRefs(notes).keys()];
  const draft = await generateJson({
    tier: "flash",
    system: prompt("notes-summary", { offering: String(offering.get("name")) }),
    prompt: `<notes>\n${notes.map((note, index) => `${refs[index]} (${note.byName}, ${note.at.slice(0, 10)}${note.pinned ? ", pinned" : ""}): ${note.text}`).join("\n")}\n</notes>`,
    schema: Draft,
  });
  const { lines, dropped } = checkSummary(draft.lines, notes);

  const now = new Date().toISOString();
  const summary = NoteSummary.parse({ offeringId, lines, dropped, noteIds: notes.map((note) => note.id), generatedAt: now, requestedBy: context.user.name });
  const batch = db().batch();
  batch.set(base.collection("noteSummaries").doc(offeringId), summary);
  batch.set(
    base.collection("auditEvents").doc(),
    AuditEvent.parse({ action: "generate", entity: "note-summary", entityId: offeringId, summary: `FlowHub summarised ${notes.length} ${notes.length === 1 ? "note" : "notes"} on ${offering.get("name")}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return summary;
}
