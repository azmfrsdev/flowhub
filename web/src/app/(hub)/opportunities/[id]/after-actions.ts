"use server";

import { z } from "zod";
import { AuditEvent, MeetingExample, type Meeting, type MeetingExample as Example } from "@/lib/schema";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { MeetingError, meetingExamples, planMeeting } from "@/server/pipelines/meeting";
import { PrepError, practiseAnswer, writePitchPrep } from "@/server/pipelines/prep";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

/**
 * Steps E and F of the deal room (PRD 7.24, 7.25, ADR-0016 D2): server actions
 * like the deck's, with no gate and no queued stage. Every write is checked
 * with Zod and the caller's role, and audited (invariant 10).
 */

export type AfterResult = { error?: string; ok?: number };
const MODEL_SHAPE = "Gemini's answer didn't have the expected shape. Try again.";

const MeetingInput = z.object({
  notes: z.string().trim().min(40, "Paste a few lines of notes, at least a sentence or two.").max(20000, "Keep the notes to 20,000 characters."),
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the meeting date."),
  example: z.union([MeetingExample, z.literal("")]).transform((value) => (value === "" ? null : value)),
});

/** FR-MEET-2 to FR-MEET-5: plans the next steps from pasted notes. One AI run. */
export async function planNextSteps(opportunityId: string, _previous: AfterResult, formData: FormData): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId] = parseArgs([ArgId], [opportunityId]);
  const input = MeetingInput.safeParse({ notes: formData.get("notes") ?? "", heldOn: formData.get("heldOn") ?? "", example: formData.get("example") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check the notes and the date." };
  try {
    await planMeeting(context, opportunityId, input.data);
  } catch (err) {
    if (err instanceof MeetingError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: MODEL_SHAPE };
    if (err instanceof ModelBusyError) return { error: err.message };
    throw err;
  }
  return { ok: Date.now() };
}

/** FR-MEET-1: example notes built by code from this deal. No AI run, nothing stored. */
export async function exampleMeetingNotes(opportunityId: string): Promise<{ examples?: Record<Example, string>; error?: string }> {
  const context = await requireRole("editor");
  [opportunityId] = parseArgs([ArgId], [opportunityId]);
  try {
    return { examples: await meetingExamples(context, opportunityId) };
  } catch (err) {
    if (err instanceof MeetingError) return { error: err.message };
    throw err;
  }
}

/** FR-MEET-4: a person ticks a next step off, or back on. Recorded in the audit trail. */
export async function setMeetingStepDone(opportunityId: string, meetingId: string, stepId: string, done: boolean): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId, meetingId, stepId, done] = parseArgs([ArgId, ArgId, ArgId, z.boolean()], [opportunityId, meetingId, stepId, done]);
  const ref = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}/meetings/${meetingId}`);
  const now = new Date().toISOString();
  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const meeting = snap.data() as Meeting | undefined;
    const step = meeting?.steps.find((item) => item.id === stepId);
    if (!meeting || !step) return "This step no longer exists. Reload the page.";
    const steps = meeting.steps.map((item) => (item.id === stepId ? { ...item, done: done ? { at: now, by: context.user.name } : null } : item));
    tx.update(ref, { steps });
    tx.set(
      db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "update", entity: "meeting", entityId: meetingId, summary: `${done ? "Done" : "Not done yet"}: ${step.title}`, by: context.user.uid, byName: context.user.name, at: now }),
    );
    return null;
  });
  return outcome ? { error: outcome } : { ok: Date.now() };
}

/** FR-PREP-1 to FR-PREP-3: writes the pitch prep from the approved proposal. One AI run. */
export async function writePrep(opportunityId: string, writeRunId: string): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  try {
    await writePitchPrep(context, opportunityId, writeRunId);
  } catch (err) {
    if (err instanceof PrepError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: MODEL_SHAPE };
    if (err instanceof ModelBusyError) return { error: err.message };
    throw err;
  }
  return { ok: Date.now() };
}

/** FR-PREP-4: feedback on one practice answer. One AI run. */
export async function practise(opportunityId: string, writeRunId: string, questionId: string, answer: string): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId, questionId] = parseArgs([ArgId, ArgId, ArgId], [opportunityId, writeRunId, questionId]);
  const text = z.string().trim().min(15, "Type a sentence or two first.").max(3000, "Keep the answer to 3,000 characters.").safeParse(answer);
  if (!text.success) return { error: text.error.issues[0]?.message ?? "Type your answer first." };
  try {
    await practiseAnswer(context, opportunityId, writeRunId, questionId, text.data);
  } catch (err) {
    if (err instanceof PrepError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: MODEL_SHAPE };
    if (err instanceof ModelBusyError) return { error: err.message };
    throw err;
  }
  return { ok: Date.now() };
}
