"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { renderDraftHtml } from "@/lib/deal-room/draft";
import { computeScore, copyPriceLines } from "@/lib/deal-room/fit";
import { SOFT_CHECKS, removeSentence } from "@/lib/deal-room/review";
import { AuditEvent, type BriefOutput, ClientDeck, EmailFiles, type FitOutput, type FollowUp, type IntakeOutput, type Run, StageKey, type WriteOutput } from "@/lib/schema";
import { DriveError, createDeckSlides, createProposalDoc, saveDeckAsPowerPoint, saveDocAsWord } from "@/server/deal-room/docs";
import { sellerLogo } from "@/server/deck/logos";
import { renderDeck } from "@/server/deck/render";
import { StageError, approveGate, editWorking, reopenStage, startStage } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { softDeleteBatch } from "@/server/graph/delete";
import { ModelOutputError } from "@/server/ai/generate";
import { DeckError, writeClientDeck } from "@/server/pipelines/deck";
import { FollowUpError, draftFollowUp } from "@/server/pipelines/follow-up";
import template from "@/server/templates/sme.json";
import { OUTCOME_REASONS } from "./shared";
import { requireRole } from "@/server/workspace/access";
import { ArgId, ArgRev, parseArgs } from "@/server/workspace/args";

export type GateResult = { error?: string; ok?: number; url?: string };

const STAGE_KEYS = ["intake", "research", "fit", "write"] as const;

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

const Strength = z.enum(["strong", "partial", "weak"]);
const Priority = z.enum(["high", "medium", "low"]);

/** Gate C (FR-FIT-7): a person changes how strongly an offering meets a need. The score is recalculated in code. */
export async function setMappingStrength(opportunityId: string, runId: string, rev: number, gapId: string, offeringId: string, strength: "strong" | "partial" | "weak"): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, gapId, offeringId, strength] = parseArgs([ArgId, ArgId, ArgRev, ArgId, ArgId, Strength], [opportunityId, runId, rev, gapId, offeringId, strength]);
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) =>
      rescore({ ...working, mappings: working.mappings.map((mapping) => (mapping.gapId === gapId && mapping.target.id === offeringId ? { ...mapping, strength } : mapping)) }),
    );
  });
}

/** Gate C (FR-FIT-7): a person's customisation note on a mapping. The Writer treats it as the seller's own statement. */
export async function setCustomisation(opportunityId: string, runId: string, rev: number, gapId: string, offeringId: string, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, gapId, offeringId] = parseArgs([ArgId, ArgId, ArgRev, ArgId, ArgId], [opportunityId, runId, rev, gapId, offeringId]);
  const text = z.string().trim().max(300, "Keep a customisation to 300 characters.").safeParse(formData.get("customisation") ?? "");
  if (!text.success) return { error: text.error.issues[0]?.message };
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) => ({
      ...working,
      mappings: working.mappings.map((mapping) => {
        if (mapping.gapId !== gapId || mapping.target.id !== offeringId) return mapping;
        const rest = { ...mapping };
        delete rest.customisation;
        delete rest.customisedBy;
        return text.data ? { ...rest, customisation: text.data, customisedBy: context.user.name } : rest;
      }),
    }));
  });
}

/** Gate C (FR-FIT-7): map a need to another of your offerings. Only a live offering in this workspace can be chosen. */
export async function addMapping(opportunityId: string, runId: string, rev: number, gapId: string, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, gapId] = parseArgs([ArgId, ArgId, ArgRev, ArgId], [opportunityId, runId, rev, gapId]);
  const input = z.object({ offeringId: ArgId, strength: Strength }).safeParse({ offeringId: formData.get("offeringId"), strength: formData.get("strength") });
  if (!input.success) return { error: "Choose an offering and how well it fits." };
  const graph = await getGraphFor(context.workspace.id);
  const offering = graph.offerings.find((item) => item.id === input.data.offeringId && item.status !== "retired");
  if (!offering) return { error: "That offering is no longer in your catalogue." };
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) => {
      if (!working.gaps.some((gap) => gap.id === gapId)) throw new StageError("That need is no longer on the map.");
      if (working.mappings.some((mapping) => mapping.gapId === gapId && mapping.target.id === offering.id)) throw new StageError(`${offering.name} already meets this need.`);
      const mapping: FitOutput["mappings"][number] = { gapId, target: { type: "offering", id: offering.id, rev: offering.rev }, strength: input.data.strength, featureRefs: [], proofRefs: [], mappedBy: context.user.name };
      return rescore({ ...working, mappings: [...working.mappings, mapping] });
    });
  });
}

export async function removeMapping(opportunityId: string, runId: string, rev: number, gapId: string, offeringId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, gapId, offeringId] = parseArgs([ArgId, ArgId, ArgRev, ArgId, ArgId], [opportunityId, runId, rev, gapId, offeringId]);
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) => rescore({ ...working, mappings: working.mappings.filter((mapping) => !(mapping.gapId === gapId && mapping.target.id === offeringId)) }));
  });
}

/** Gate C (FR-FIT-7): a need the person adds, optionally mapped to an offering. It is marked as theirs. */
export async function addGap(opportunityId: string, runId: string, rev: number, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev] = parseArgs([ArgId, ArgId, ArgRev], [opportunityId, runId, rev]);
  const input = z
    .object({ text: z.string().trim().min(1, "Describe the need.").max(300, "Keep a need to 300 characters."), priority: Priority, offeringId: z.union([z.literal(""), ArgId]), strength: Strength })
    .safeParse({ text: formData.get("text") ?? "", priority: formData.get("priority"), offeringId: formData.get("offeringId") ?? "", strength: formData.get("strength") ?? "partial" });
  if (!input.success) return { error: input.error.issues[0]?.message };
  const graph = input.data.offeringId ? await getGraphFor(context.workspace.id) : null;
  const offering = graph?.offerings.find((item) => item.id === input.data.offeringId && item.status !== "retired");
  if (input.data.offeringId && !offering) return { error: "That offering is no longer in your catalogue." };
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) => {
      const next = Math.max(0, ...working.gaps.map((gap) => Number(gap.id.replace(/^g/, "")) || 0)) + 1;
      const gap: FitOutput["gaps"][number] = { id: `g${next}`, text: input.data.text, priority: input.data.priority, origin: { kind: "person", ref: context.user.name } };
      const mapping: FitOutput["mappings"] = offering ? [{ gapId: gap.id, target: { type: "offering", id: offering.id, rev: offering.rev }, strength: input.data.strength, featureRefs: [], proofRefs: [], mappedBy: context.user.name }] : [];
      return rescore({ ...working, gaps: [...working.gaps, gap], mappings: [...working.mappings, ...mapping] });
    });
  });
}

/**
 * Gate C (FR-FIT-7): choose a different tier for a price line. Code copies the
 * new cell's price from the pricing card as it stands (invariant 1); a cost
 * card can never be chosen.
 */
export async function changePriceTier(opportunityId: string, runId: string, rev: number, lineId: string, colId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, runId, rev, lineId, colId] = parseArgs([ArgId, ArgId, ArgRev, ArgId, ArgId], [opportunityId, runId, rev, lineId, colId]);
  const graph = await getGraphFor(context.workspace.id);
  return guard(async () => {
    await editWorking<FitOutput>(context, opportunityId, runId, rev, (working) => {
      const line = working.pricing.lines.find((item) => item.id === lineId);
      if (!line || line.ref.kind !== "cell") throw new StageError("That line has no tiers to choose from.");
      const { cardId } = line.ref;
      const card = graph.rateCards.find((item) => item.id === cardId && item.kind === "pricing");
      if (!card) throw new StageError("That pricing grid is no longer in your catalogue.");
      const { lines } = copyPriceLines(graph, [{ ref: { ...line.ref, colId, rev: card.rev }, ...(line.quantity ? { quantity: line.quantity } : {}) }], context.workspace.currency);
      if (!lines[0]) throw new StageError("That tier has no price for this line.");
      return { ...working, pricing: { lines: working.pricing.lines.map((item) => (item.id === lineId ? { ...lines[0], id: lineId } : item)) } };
    });
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
      if (decision === "accept_as_seller" && claim.hardCheck && !SOFT_CHECKS.has(claim.hardCheck)) {
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
  if (oppSnap.get("stages.write.currentRunId") !== runId || oppSnap.get("stages.write.state") !== "waiting") return { error: "This draft is out of date. Re-run writing." };
  if (run.rev !== rev) return { error: "Someone changed this since you opened it. Reload to see their version." };
  const working = run.working as WriteOutput;
  if (working.claims.some((claim) => claim.support === "neither" && !claim.decision)) return { error: "Decide on every flagged claim first." };
  // Invariant 4, belt and braces: a hard block (cost, private result, typed price) only ever leaves by removal.
  if (working.claims.some((claim) => claim.hardCheck && !SOFT_CHECKS.has(claim.hardCheck) && claim.decision !== "remove")) return { error: "Remove every blocked claim first." };

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

/** FR-DR-4: reopen an approved gate to change it again, without calling a model. Later stages become out of date. */
export async function reopenGate(opportunityId: string, stage: StageKey): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, stage] = parseArgs([ArgId, StageKey], [opportunityId, stage]);
  return guard(async () => {
    await reopenStage(context, opportunityId, stage);
  });
}

/**
 * FR-OPP-2: a person moves the deal along by hand, for example to "sent" once
 * the proposal has gone out. Moving to "sent" is always a person's step.
 * Won, lost and no decision go through recordOutcome instead.
 */
export async function setOpportunityStatus(opportunityId: string, status: "new" | "researching" | "proposing" | "sent"): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, status] = parseArgs([ArgId, z.enum(["new", "researching", "proposing", "sent"])], [opportunityId, status]);
  return guard(async () => {
    const oppRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
    const now = new Date().toISOString();
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(oppRef);
      if (!snap.exists || snap.get("deletedAt")) throw new StageError("This opportunity no longer exists.");
      tx.update(oppRef, { status, outcome: null, updatedAt: now, rev: Number(snap.get("rev") ?? 0) + 1 });
      tx.set(
        db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
        AuditEvent.parse({ action: status === "sent" ? "send" : "update", entity: "opportunity", entityId: opportunityId, summary: `Marked ${snap.get("prospect.name") ?? "an opportunity"} as ${status}.`, by: context.user.uid, byName: context.user.name, at: now }),
      );
    });
  });
}

const OutcomeInput = z.object({
  result: z.enum(["won", "lost", "no_decision"]),
  reason: z.enum(OUTCOME_REASONS),
  note: z.string().trim().max(500, "Keep the note to 500 characters."),
  value: z.string().trim().max(80, "Keep the value short, like RM 48,000."),
});

/** FR-OUT-1: how the deal ended, with a reason from a short list and an optional note. It shows on each mapped offering (FR-OUT-2). */
export async function recordOutcome(opportunityId: string, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId] = parseArgs([ArgId], [opportunityId]);
  const input = OutcomeInput.safeParse({ result: formData.get("result"), reason: formData.get("reason"), note: formData.get("note") ?? "", value: formData.get("value") ?? "" });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Choose how it ended and why." };
  const { result, reason, note, value } = input.data;
  return guard(async () => {
    const oppRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
    const now = new Date().toISOString();
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(oppRef);
      if (!snap.exists || snap.get("deletedAt")) throw new StageError("This opportunity no longer exists.");
      const outcome = { result, reason, ...(note ? { note } : {}), at: now, by: context.user.name };
      tx.update(oppRef, { status: result, outcome, ...(value ? { value } : {}), updatedAt: now, rev: Number(snap.get("rev") ?? 0) + 1 });
      tx.set(
        db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
        AuditEvent.parse({
          action: "update",
          entity: "opportunity",
          entityId: opportunityId,
          summary: `Recorded ${snap.get("prospect.name") ?? "an opportunity"} as ${result.replace("_", " ")}: ${reason.toLowerCase()}.`,
          by: context.user.uid,
          byName: context.user.name,
          at: now,
        }),
      );
    });
  });
}

/** C3: drafts the follow-up email after the proposal, to copy. One AI run; FlowHub never sends it. */
export async function draftFollowUpEmail(opportunityId: string, writeRunId: string): Promise<GateResult & { followUp?: FollowUp }> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  try {
    const followUp = await draftFollowUp(context, opportunityId, writeRunId);
    return { ok: Date.now(), followUp: JSON.parse(JSON.stringify(followUp)) as FollowUp };
  } catch (err) {
    if (err instanceof FollowUpError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: "Gemini's answer didn't have the expected shape. Try again." };
    throw err;
  }
}

/**
 * FR-SEND-5, ADR-0016 D1: Word and PowerPoint copies for the Gmail draft,
 * saved in the person's FlowHub folder in Drive. Gmail's compose window
 * can't carry attachments, so the draft links these files instead. Reused
 * while the Doc and the deck are unchanged. The `drive.file` token is used
 * for these calls only and never stored or logged (invariant 12).
 */
export async function prepareEmailFiles(opportunityId: string, writeRunId: string, accessToken: string, want: { word: boolean; powerpoint: boolean }): Promise<{ error?: string; files?: { word?: string; powerpoint?: string } }> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId, want] = parseArgs([ArgId, ArgId, z.object({ word: z.boolean(), powerpoint: z.boolean() })], [opportunityId, writeRunId, want]);
  const token = z.string().min(20).max(4096).safeParse(accessToken);
  if (!token.success) return { error: "Google didn't return a Drive permission. Try again." };

  const oppRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
  const filesRef = oppRef.collection("emailFiles").doc(writeRunId);
  const [oppSnap, runSnap, deckSnap, filesSnap, userSnap] = await Promise.all([oppRef.get(), oppRef.collection("runs").doc(writeRunId).get(), oppRef.collection("decks").doc(writeRunId).get(), filesRef.get(), db().doc(`users/${context.user.uid}`).get()]);
  const run = runSnap.data() as Run | undefined;
  if (!oppSnap.exists || oppSnap.get("deletedAt") || !run || run.stage !== "write") return { error: "This proposal is no longer available. Reload the page." };
  const doc = (run.working as WriteOutput | undefined)?.doc;
  const deck = deckSnap.exists ? ClientDeck.safeParse(deckSnap.data()) : null;
  if (want.word && !doc) return { error: "Create the proposal in Google Docs first. The Word file is made from it." };
  if (want.powerpoint && !deck?.success) return { error: "Write the client deck first." };

  const prospect = (oppSnap.get("prospect")?.name as string | undefined) ?? "the prospect";
  const saved = EmailFiles.parse(filesSnap.data() ?? {});
  const deckKey = deck?.success ? `${deck.data.createdAt}|${deck.data.photos.title?.url ?? ""}|${deck.data.photos.proof?.url ?? ""}` : "";
  let folderId = (userSnap.get("driveFolderId") as string | undefined) ?? null;
  const now = new Date().toISOString();
  const next: EmailFiles = { ...saved };
  try {
    if (want.word && doc && saved.word?.docId !== doc.id) {
      const file = await saveDocAsWord(token.data, doc.id, `Proposal for ${prospect} - ${context.workspace.name}.docx`, folderId);
      folderId = file.folderId;
      next.word = { id: file.id, url: file.url, docId: doc.id, createdAt: now };
    }
    if (want.powerpoint && deck?.success && saved.powerpoint?.deckKey !== deckKey) {
      const pptx = await renderDeck(deck.data, sellerLogo(context.workspace.sample));
      const file = await saveDeckAsPowerPoint(token.data, `Deck for ${prospect} - ${context.workspace.name}.pptx`, pptx, folderId);
      folderId = file.folderId;
      next.powerpoint = { id: file.id, url: file.url, deckKey, createdAt: now };
    }
  } catch (err) {
    if (err instanceof DriveError) return { error: err.message };
    throw err;
  }

  if (next.word !== saved.word || next.powerpoint !== saved.powerpoint) {
    const batch = db().batch();
    batch.set(filesRef, JSON.parse(JSON.stringify(next)));
    if (folderId) batch.set(db().doc(`users/${context.user.uid}`), { driveFolderId: folderId, driveGrantedAt: now }, { merge: true });
    batch.set(
      db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
      AuditEvent.parse({ action: "generate", entity: "email-files", entityId: writeRunId, summary: `Saved ${[next.word !== saved.word ? "a Word copy of the proposal" : null, next.powerpoint !== saved.powerpoint ? "the deck as PowerPoint" : null].filter(Boolean).join(" and ")} for ${prospect} in Google Drive.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
    await batch.commit();
  }
  return { files: { ...(want.word && next.word ? { word: next.word.url } : {}), ...(want.powerpoint && next.powerpoint ? { powerpoint: next.powerpoint.url } : {}) } };
}

/** PRD 7.22: writes the client deck from the approved proposal. One AI run. */
export async function writeDeck(opportunityId: string, writeRunId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  try {
    await writeClientDeck(context, opportunityId, writeRunId);
  } catch (err) {
    if (err instanceof DeckError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: "Gemini's answer didn't have the expected shape. Try again." };
    throw err;
  }
  return { ok: Date.now() };
}

/**
 * FR-DECK-6, ADR-0015 D3: renders the deck and converts it into Google Slides
 * in the caller's own Drive. The `drive.file` token is used for this call only
 * and is never stored or logged (invariant 12).
 */
export async function openDeckInSlides(opportunityId: string, writeRunId: string, accessToken: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  const token = z.string().min(20).max(4096).safeParse(accessToken);
  if (!token.success) return { error: "Google didn't return a Drive permission. Try again." };
  const deckRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}/decks/${writeRunId}`);
  const [deckSnap, userSnap] = await Promise.all([deckRef.get(), db().doc(`users/${context.user.uid}`).get()]);
  const deck = ClientDeck.safeParse(deckSnap.data());
  if (!deck.success) return { error: "Write the deck first." };
  let slides: { id: string; url: string; folderId: string };
  try {
    slides = await createDeckSlides(token.data, `Deck for ${deck.data.title.prospect} · ${deck.data.title.seller}`, await renderDeck(deck.data, sellerLogo(context.workspace.sample)), (userSnap.get("driveFolderId") as string | undefined) ?? null);
  } catch (err) {
    if (err instanceof DriveError) return { error: err.message };
    throw err;
  }
  const now = new Date().toISOString();
  await deckRef.update({ slides: { id: slides.id, url: slides.url, createdAt: now } });
  await db().doc(`users/${context.user.uid}`).set({ driveFolderId: slides.folderId, driveGrantedAt: now }, { merge: true });
  await db()
    .collection(`workspaces/${context.workspace.id}/auditEvents`)
    .add(AuditEvent.parse({ action: "generate", entity: "slides", entityId: slides.id, summary: `Created the client deck for ${deck.data.title.prospect} in Google Slides: ${slides.url}`, by: context.user.uid, byName: context.user.name, at: now }));
  return { ok: Date.now(), url: slides.url };
}

/** FR-DECK-5: the person can take the photos out of a deck; the slides then lay out without them. */
export async function removeDeckPhotos(opportunityId: string, writeRunId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  const deckRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}/decks/${writeRunId}`);
  if (!(await deckRef.get()).exists) return { error: "Write the deck first." };
  await deckRef.update({ photos: { title: null, proof: null } });
  return { ok: Date.now() };
}

const OpportunityEdit = z.object({
  contactName: z.string().trim().max(120),
  contactRole: z.string().trim().max(120),
  contactEmail: z.union([z.literal(""), z.email("Enter an email address like name@company.com.")]),
  nextMeeting: z.string().trim().max(120),
  value: z.string().trim().max(80),
  interestedOfferingIds: z.array(ArgId).max(30),
});

/** FR-OPP-1: an opportunity's basics, edited by hand. The prospect itself is corrected at Gate A. */
export async function updateOpportunity(opportunityId: string, _previous: GateResult, formData: FormData): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId] = parseArgs([ArgId], [opportunityId]);
  const input = OpportunityEdit.safeParse({
    contactName: formData.get("contactName") ?? "",
    contactRole: formData.get("contactRole") ?? "",
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    nextMeeting: formData.get("nextMeeting") ?? "",
    value: formData.get("value") ?? "",
    interestedOfferingIds: formData.getAll("interestedOfferingIds").map(String),
  });
  if (!input.success) return { error: input.error.issues[0]?.message };
  const { contactName, contactRole, contactEmail, nextMeeting, value, interestedOfferingIds } = input.data;
  const graph = await getGraphFor(context.workspace.id);
  const live = new Set(graph.offerings.map((offering) => offering.id));
  return guard(async () => {
    const oppRef = db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`);
    const now = new Date().toISOString();
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(oppRef);
      if (!snap.exists || snap.get("deletedAt")) throw new StageError("This opportunity no longer exists.");
      tx.update(oppRef, {
        contact: contactName ? { name: contactName, ...(contactRole ? { role: contactRole } : {}), ...(contactEmail ? { email: contactEmail } : {}) } : FieldValue.delete(),
        nextMeeting: nextMeeting || FieldValue.delete(),
        value: value || null,
        interestedOfferingIds: interestedOfferingIds.filter((id) => live.has(id)),
        updatedAt: now,
        rev: Number(snap.get("rev") ?? 0) + 1,
      });
      tx.set(
        db().collection(`workspaces/${context.workspace.id}/auditEvents`).doc(),
        AuditEvent.parse({ action: "update", entity: "opportunity", entityId: opportunityId, summary: `Edited the details of ${snap.get("prospect.name") ?? "an opportunity"}.`, by: context.user.uid, byName: context.user.name, at: now }),
      );
    });
  });
}

/** FR-OPP-5: an opportunity is deleted softly, with its deal room, and the recycle bin can bring it back. */
export async function deleteOpportunity(opportunityId: string): Promise<GateResult> {
  const context = await requireRole("editor");
  [opportunityId] = parseArgs([ArgId], [opportunityId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/opportunities/${opportunityId}`).get();
  if (!snap.exists || snap.get("deletedAt")) return { error: "This opportunity no longer exists." };
  if (STAGE_KEYS.some((key) => snap.get(`stages.${key}.state`) === "running")) return { error: "The agents are working on this deal. Wait for them to finish." };
  const name = (snap.get("prospect.name") as string | undefined) ?? "New opportunity";
  await softDeleteBatch(context, `Opportunity: ${name}`, [{ collection: "opportunities", id: opportunityId }], `Deleted the opportunity ${name}.`);
  redirect("/opportunities");
}
