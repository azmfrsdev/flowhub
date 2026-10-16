import { moneyTokens } from "@/lib/pricing/money";
import type { Note } from "@/lib/schema";

/**
 * FR-OFR-8: the notes summary is written only from an offering's notes, and
 * every line links to the notes it rests on. Code has the last word: a line
 * that cites no real note, or states an amount its notes don't contain, is
 * dropped and counted, never shown.
 */

export const SUMMARY_SECTIONS = ["sells", "loses", "watch"] as const;
export type SummarySection = (typeof SUMMARY_SECTIONS)[number];
export type SummaryLine = { section: SummarySection; text: string; noteIds: string[] };

/** The numbered references the model sees ("n1", "n2" …), so it never handles Firestore IDs. */
export function noteRefs(notes: Pick<Note, "id">[]): Map<string, string> {
  return new Map(notes.map((note, index) => [`n${index + 1}`, note.id]));
}

export function checkSummary(draft: { section: SummarySection; text: string; refs: string[] }[], notes: Pick<Note, "id" | "text">[]): { lines: SummaryLine[]; dropped: number } {
  const refs = noteRefs(notes);
  const byId = new Map(notes.map((note) => [note.id, note]));
  const lines: SummaryLine[] = [];
  for (const item of draft) {
    const noteIds = [...new Set(item.refs.map((ref) => refs.get(ref.trim())).filter((id): id is string => Boolean(id)))];
    if (noteIds.length === 0 || !item.text.trim()) continue;
    // Invariant 1 in spirit: an amount in a line must be written in one of the notes it cites.
    const allowed = new Set(noteIds.flatMap((id) => moneyTokens(byId.get(id)?.text ?? "")));
    if (moneyTokens(item.text).some((token) => !allowed.has(token))) continue;
    lines.push({ section: item.section, text: item.text.trim(), noteIds });
  }
  return { lines, dropped: draft.length - lines.length };
}

/** Whether the summary still reflects the notes: the same notes, none added, removed or edited since. */
export function summaryIsCurrent(summary: { noteIds: string[]; generatedAt: string }, notes: Pick<Note, "id" | "at">[]): boolean {
  const current = new Set(notes.map((note) => note.id));
  return summary.noteIds.length === current.size && summary.noteIds.every((id) => current.has(id)) && notes.every((note) => note.at <= summary.generatedAt);
}
