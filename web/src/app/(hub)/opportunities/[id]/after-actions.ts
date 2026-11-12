"use server";

import { z } from "zod";
import { AuditEvent, MeetingExample, type Meeting, type MeetingExample as Example, RehearsalMode, RehearsalMood, RehearsalPush, RehearsalVoice } from "@/lib/schema";
import { MEETING_MINUTES, WORKSPACE_TIME_ZONE, meetingLabel, zonedTime } from "@/lib/calendar";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { InviteError, queueInvite } from "@/server/pipelines/invite";
import { MeetingError, meetingExamples, planMeeting } from "@/server/pipelines/meeting";
import { PrepError, practiseAnswer, writePitchPrep } from "@/server/pipelines/prep";
import { RehearsalError, coachRehearsal, rehearsalTurn, startRehearsal } from "@/server/pipelines/rehearsal";
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

const MeetingTime = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the meeting date."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the start time."),
  minutes: z.number().int().refine((value) => (MEETING_MINUTES as readonly number[]).includes(value), "Choose a duration."),
});

/**
 * FR-CAL-5, ADR-0016 D7: when the person opens the meeting in Google Calendar,
 * the planned time becomes the deal's Next meeting, so the header and step F
 * show it. FlowHub creates no event and stores nothing from Calendar.
 */
export async function recordPlannedMeeting(opportunityId: string, day: string, time: string, minutes: number): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId] = parseArgs([ArgId], [opportunityId]);
  const input = MeetingTime.safeParse({ day, time, minutes });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check the date and time." };
  const label = meetingLabel(zonedTime(input.data.day, input.data.time, WORKSPACE_TIME_ZONE), WORKSPACE_TIME_ZONE);
  const ref = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
  const now = new Date().toISOString();
  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("deletedAt")) return "This opportunity no longer exists.";
    if (snap.get("nextMeeting") === label) return null;
    tx.update(ref, { nextMeeting: label, updatedAt: now, rev: Number(snap.get("rev") ?? 0) + 1 });
    tx.set(
      db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "update", entity: "opportunity", entityId: opportunityId, summary: `Planned the meeting with ${snap.get("prospect.name") ?? "the client"} for ${label}.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
    return null;
  });
  return outcome ? { error: outcome } : { ok: Date.now() };
}

const InviteInput = MeetingTime.extend({
  guests: z.array(z.email("A guest's address isn't an email address.")).min(1, "Add at least one guest.").max(20, "Invite at most 20 guests."),
});

/**
 * FR-CAL-6, ADR-0020 D7: sends the meeting invite through the Gmail script in
 * the sales inbox's own account. FlowHub queues it; the script creates the
 * event with Google Meet within a minute and Calendar emails the guests.
 */
export async function sendMeetingInvite(opportunityId: string, writeRunId: string, day: string, time: string, minutes: number, guests: string[]): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  const input = InviteInput.safeParse({ day, time, minutes, guests });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check the date, time and guests." };
  try {
    await queueInvite(context, { opportunityId, writeRunId, ...input.data });
  } catch (err) {
    if (err instanceof InviteError || err instanceof PrepError) return { error: err.message };
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

const RehearsalOptions = z.object({
  mode: RehearsalMode,
  pushOn: z.array(RehearsalPush).max(3).transform((items) => [...new Set(items)]),
  mood: RehearsalMood,
  voice: RehearsalVoice.default("female"),
  own: z.string().max(2000, "Keep your notes to 2,000 characters.").default(""),
});

function rehearsalError(err: unknown): AfterResult {
  if (err instanceof RehearsalError) return { error: err.message };
  if (err instanceof ModelOutputError) return { error: MODEL_SHAPE };
  if (err instanceof ModelBusyError) return { error: err.message };
  throw err;
}

/** FR-REH-1: sets up a rehearsal from the approved proposal. One AI run. Returns its ID. */
export async function beginRehearsal(opportunityId: string, writeRunId: string, options: unknown): Promise<AfterResult & { id?: string }> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  const input = RehearsalOptions.safeParse(options);
  if (!input.success) return { error: input.error.issues.find((issue) => issue.path[0] === "own")?.message ?? "Choose how to rehearse first." };
  if (input.data.mode === "voice" && !process.env.NEXT_PUBLIC_LIVE_URL) return { error: "Voice isn't set up here. Rehearse by typing." };
  try {
    return { id: await startRehearsal(context, opportunityId, writeRunId, input.data), ok: Date.now() };
  } catch (err) {
    return rehearsalError(err);
  }
}

/** FR-REH-4: one typed turn, and the buyer's answer. */
export async function sayInRehearsal(opportunityId: string, rehearsalId: string, text: string): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId, rehearsalId] = parseArgs([ArgId, ArgId], [opportunityId, rehearsalId]);
  const said = z.string().trim().min(2, "Say something first.").max(1200, "Keep each turn to 1,200 characters.").safeParse(text);
  if (!said.success) return { error: said.error.issues[0]?.message ?? "Say something first." };
  try {
    await rehearsalTurn(context, opportunityId, rehearsalId, said.data);
  } catch (err) {
    return rehearsalError(err);
  }
  return { ok: Date.now() };
}

/** FR-REH-5: ends the rehearsal if needed, and writes the coaching. Part of the rehearsal's AI run. */
export async function coachMyRehearsal(opportunityId: string, rehearsalId: string): Promise<AfterResult> {
  const context = await requireRole("editor");
  [opportunityId, rehearsalId] = parseArgs([ArgId, ArgId], [opportunityId, rehearsalId]);
  try {
    await coachRehearsal(context, opportunityId, rehearsalId);
  } catch (err) {
    return rehearsalError(err);
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
