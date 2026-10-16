"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { z } from "zod";
import { renderDraftHtml } from "@/lib/deal-room/draft";
import { computeScore } from "@/lib/deal-room/fit";
import { removeSentence } from "@/lib/deal-room/review";
import { AuditEvent, type BriefOutput, type FitOutput, type IntakeOutput, type Run, StageKey, type WriteOutput } from "@/lib/schema";
import { DriveError, createProposalDoc } from "@/server/deal-room/docs";
import { StageError, approveGate, editWorking, startStage } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import template from "@/server/templates/sme.json";
import { requireRole } from "@/server/workspace/access";
import { ArgId, ArgRev, parseArgs } from "@/server/workspace/args";

export type GateResult = { error?: string; ok?: number; url?: string };

async function guard(work: () => Promise<void>): Promise<GateResult> {
  try {
    await work();
  } catch (err) {
    if (err instanceof StageError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: Date.now() };
}

const Prospect = z.object({
  name: z.string().trim().min(1, "Enter the company's name.").max(160),
  website: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "")),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), "Use a two-letter country code, like MY."),
  oneLine: z.string().trim().max(300),
});

/** Gate A (FR-INT-4, FR-INT-6): the person confirms or corrects the company, then research starts. */
export async function confirmProspect(opportunityId: string, runId: string, rev: number, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev] = parseArgs([ArgId, ArgId, ArgRev], [opportunityId, runId, rev]);
  const input = Prospect.safeParse(Object.fromEntries(["name", "website", "country", "oneLine"].map((key) => [key, String(formData.get(key) ?? "")])));
  if (!input.success) return { error: input.error.issues[0]?.message };
  const { name, website, country, oneLine } = input.data;
  return guard(async () => {
    let confirmed: IntakeOutput | null = null;
    const newRev = await editWorking<IntakeOutput>(context, opportunityId, runId, rev, (working) => {
      confirmed = { ...working, needsCompany: false, prospect: { name, ...(website ? { website } : {}), ...(country ? { country } : {}), ...(oneLine ? { oneLine } : {}) } };
      return confirmed;
    });
    await approveGate(context, opportunityId, "intake", runId, newRev, `Confirmed ${name} at Gate A.`);
    const intake = confirmed as IntakeOutput | null;
    await db()
      .doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`)
      .update(
        JSON.parse(
          JSON.stringify({
            prospect: intake?.prospect ?? null,
            persona: intake?.persona ?? "sme",
            intakeType: intake?.intakeType ?? "client_email",
            contact: intake?.contacts[0],
            nextMeeting: intake?.meeting,
          }),
        ),
      );
    await startStage(context, opportunityId, "research");
  });
}

/** Gate B (FR-RES-5): remove or restore a claim in the working copy. */
export async function setClaimRemoved(opportunityId: string, runId: string, rev: number, claimId: string, removed: boolean): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, claimId, removed] = parseArgs([ArgId, ArgId, ArgRev, ArgId, z.boolean()], [opportunityId, runId, rev, claimId, removed]);
  return guard(async () => {
    await editWorking<BriefOutput>(context, opportunityId, runId, rev, (working) => ({ ...working, claims: working.claims.map((claim) => (claim.id === claimId ? { ...claim, removed } : claim)) }));
  });
}

/** Gate B: a seller note is the company's own statement, not a sourced claim. */
export async function addSellerNote(opportunityId: string, runId: string, rev: number, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev] = parseArgs([ArgId, ArgId, ArgRev], [opportunityId, runId, rev]);
  const text = z.string().trim().min(1, "Write the note first.").max(1000).safeParse(formData.get("text"));
  if (!text.success) return { error: text.error.issues[0]?.message };
  return guard(async () => {
    await editWorking<BriefOutput>(context, opportunityId, runId, rev, (working) => ({
      ...working,
      sellerNotes: [...working.sellerNotes, { id: `note_${working.sellerNotes.length + 1}`, text: text.data, by: context.user.name, at: new Date().toISOString() }],
    }));
  });
}

export async function approveBrief(opportunityId: string, runId: string, rev: number): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev] = parseArgs([ArgId, ArgId, ArgRev], [opportunityId, runId, rev]);
  return guard(async () => {
    await approveGate(context, opportunityId, "research", runId, rev, "Approved the research brief at Gate B.");
    await startStage(context, opportunityId, "fit");
  });
}

/** Gate C (FR-FIT-7): edits recompute the score in code, so it always matches the map. */
function rescore(working: FitOutput): FitOutput {
  return { ...working, score: computeScore(working, working.score.components.techBonus) };
}

export async function removeGap(opportunityId: string, runId: string, rev: number, gapId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, gapId] = parseArgs([ArgId, ArgId, ArgRev, ArgId], [opportunityId, runId, rev, gapId]);
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) =>
      rescore({
        ...working,
        gaps: working.gaps.filter((gap) => gap.id !== gapId),
        mappings: working.mappings.filter((mapping) => mapping.gapId !== gapId),
        cannotMeet: working.cannotMeet.filter((item) => item.gapId !== gapId),
      }),
    );
  });
}

export async function removePriceLine(opportunityId: string, runId: string, rev: number, lineId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, lineId] = parseArgs([ArgId, ArgId, ArgRev, ArgId], [opportunityId, runId, rev, lineId]);
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) => ({ ...working, pricing: { lines: working.pricing.lines.filter((line) => line.id !== lineId) } }));
  });
}

const WriteOptions = z.object({
  tone: z.enum(["formal", "friendly", "concise"]),
  instructions: z.string().trim().max(500, "Keep instructions to 500 characters."),
});

/**
 * Gate C (FR-FIT-7, FR-WRI-3): approves the fit map if it's still waiting, then
 * starts writing with the chosen tone and instructions. The score copied to
 * the opportunity comes from the approved working copy, never from the browser.
 */
export async function writeProposal(opportunityId: string, runId: string, rev: number, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev] = parseArgs([ArgId, ArgId, ArgRev], [opportunityId, runId, rev]);
  const options = WriteOptions.safeParse({ tone: formData.get("tone"), instructions: formData.get("instructions") ?? "" });
  if (!options.success) return { error: options.error.issues[0]?.message };
  return guard(async () => {
    const oppRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
    const runSnap = await oppRef.collection("runs").doc(runId).get();
    const working = runSnap.get("working") as FitOutput | undefined;
    if (!working) throw new StageError("This run has no fit map.");
    if (runSnap.get("state") === "waiting") {
      await approveGate(context, opportunityId, "fit", runId, rev, `Approved the fit map at Gate C: ${working.score.value}, ${working.score.band}.`);
      const mapped = [...new Set(working.mappings.map((mapping) => mapping.target.id))];
      await oppRef.update({ score: working.score.value, recommendation: working.score.band, ...(mapped.length ? { interestedOfferingIds: FieldValue.arrayUnion(...mapped) } : {}) });
    }
    await startStage(context, opportunityId, "write", { tone: options.data.tone, ...(options.data.instructions ? { instructions: options.data.instructions } : {}) });
  });
}

/**
 * Gate D (FR-WRI-5): a flagged claim is accepted as the seller's own statement
 * or removed from the draft. Hard blocks can only be removed: a cost, a private
 * result, or a price the model typed itself never reaches a client (FR-WRI-8).
 */
export async function decideClaim(opportunityId: string, runId: string, rev: number, claimId: string, decision: "accept_as_seller" | "remove"): Promise<GateResult> {
  const context = await requireRole("editor");
  // The decision is checked at runtime: any other value would slip past the hard-block guard below.
  [opportunityId, runId, rev, claimId, decision] = parseArgs([ArgId, ArgId, ArgRev, ArgId, z.enum(["accept_as_seller", "remove"])], [opportunityId, runId, rev, claimId, decision]);
  return guard(async () => {
    await editWorking<WriteOutput>(context, opportunityId, runId, rev, (working) => {
      const claim = working.claims.find((item) => item.id === claimId);
      if (!claim) throw new StageError("That claim is no longer in the draft.");
      if (decision === "accept_as_seller" && claim.hardCheck && claim.hardCheck !== "unknown_ref") {
        throw new StageError("This can't be kept: remove it. Costs, private results and typed-in prices never go to a client.");
      }
      let blocks = working.blocks;
      if (decision === "remove") {
        const block = working.blocks.find((item) => item.id === claim.blockId);
        const text = block ? removeSentence(block.text, claim.text) : null;
        if (!block || text === null) throw new StageError("FlowHub couldn't find that sentence in the draft to remove it. Re-run writing to start fresh.");
        blocks = working.blocks.map((item) => (item.id === block.id ? { ...item, text } : item));
      }
      return { ...working, blocks, claims: working.claims.map((item) => (item.id === claimId ? { ...item, decision } : item)) };
    });
  });
}

/**
 * Finalise (FR-WRI-6, FR-WRI-7, ADR-0007): creates the proposal as a Google
 * Doc in the caller's own Drive, then locks Gate D. The `drive.file` token is
 * used for this call only and is never stored or logged (invariant 12).
 */
export async function finaliseProposal(opportunityId: string, runId: string, rev: number, accessToken: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev] = parseArgs([ArgId, ArgId, ArgRev], [opportunityId, runId, rev]);
  const token = z.string().min(20).max(4096).safeParse(accessToken);
  if (!token.success) return { error: "Google didn't return a Drive permission. Try again." };

  const oppRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
  const [oppSnap, runSnap] = await Promise.all([oppRef.get(), oppRef.collection("runs").doc(runId).get()]);
  const run = runSnap.data() as Run | undefined;
  if (!oppSnap.exists || !run || run.stage !== "write") return { error: "This draft is no longer available. Reload the page." };
  if (run.state !== "waiting") return { error: "This proposal was already finalised." };
  if (run.rev !== rev) return { error: "Someone changed this since you opened it. Reload to see their version." };
  const working = run.working as WriteOutput;
  if (working.claims.some((claim) => claim.support === "neither" && !claim.decision)) return { error: "Decide on every flagged claim first." };
  // Invariant 4, belt and braces: a hard block (cost, private result, typed price) only ever leaves by removal.
  if (working.claims.some((claim) => claim.hardCheck && claim.hardCheck !== "unknown_ref" && claim.decision !== "remove")) return { error: "Remove every blocked claim first." };

  const [fitSnap, researchSnap, userSnap] = await Promise.all([
    oppRef.collection("runs").doc(run.inputs.upstreamRunIds.fit ?? "-").get(),
    oppRef.collection("runs").doc(run.inputs.upstreamRunIds.research ?? "-").get(),
    db().doc(`users/${context.user.uid}`).get(),
  ]);
  const fit = fitSnap.get("working") as FitOutput | undefined;
  const brief = researchSnap.get("working") as BriefOutput | undefined;
  if (!fit || !brief) return { error: "The fit map or brief behind this draft is missing. Re-run writing." };
  const prospect = (oppSnap.get("prospect")?.name as string | undefined) ?? "the prospect";
  const html = renderDraftHtml(working, {
    prospect,
    seller: context.workspace.name,
    date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date()),
    titles: Object.fromEntries(template.sections.map((section) => [section.key, section.title])),
    lines: fit.pricing.lines,
    brief,
  });

  let doc: { id: string; url: string; folderId: string };
  try {
    doc = await createProposalDoc(token.data, `Proposal for ${prospect} · ${context.workspace.name}`, html, (userSnap.get("driveFolderId") as string | undefined) ?? null);
  } catch (err) {
    if (err instanceof DriveError) return { error: err.message };
    throw err;
  }

  return guard(async () => {
    const now = new Date().toISOString();
    const newRev = await editWorking<WriteOutput>(context, opportunityId, runId, rev, (current) => ({ ...current, doc: { id: doc.id, url: doc.url, publishedAt: now } }));
    await approveGate(context, opportunityId, "write", runId, newRev, `Finalised the proposal for ${prospect} in Google Docs.`);
    await oppRef.update({ latestDoc: { url: doc.url, runId }, ...(["new", "researching"].includes(oppSnap.get("status")) ? { status: "proposing" } : {}) });
    await db().doc(`users/${context.user.uid}`).set({ driveFolderId: doc.folderId, driveGrantedAt: now }, { merge: true });
    await db()
      .collection(`workspaces/${context.workspace.id}/auditEvents`)
      .add(AuditEvent.parse({ action: "generate", entity: "doc", entityId: doc.id, summary: `Created the proposal for ${prospect} in Google Docs: ${doc.url}`, by: context.user.uid, byName: context.user.name, at: now }));
  }).then((result) => (result.error ? result : { ...result, url: doc.url }));
}

export async function retryStage(opportunityId: string, stage: StageKey): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, stage] = parseArgs([ArgId, StageKey], [opportunityId, stage]);
  return guard(async () => {
    await startStage(context, opportunityId, stage);
  });
}
