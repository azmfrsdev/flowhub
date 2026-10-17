import "server-only";
import { z } from "zod";
import { followUpEvidence } from "@/lib/deal-room/follow-up";
import { PRACTICE_CAP, approvedPrices, askEvidence, checkPracticeAmounts, checkPrepDraft, prepNumbers, prepProbes, sampleAnswers } from "@/lib/deal-room/prep";
import { AuditEvent, type BriefOutput, type FitOutput, type Opportunity, PitchPrep, PracticeAttempt, type Run, type WriteOutput } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";

export class PrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrepError";
  }
}

const Draft = z.object({
  opener: z.object({ text: z.string(), refs: z.array(z.string()) }),
  points: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })).max(5),
  likely: z.array(z.object({ question: z.string(), why: z.string(), answer: z.string(), refs: z.array(z.string()), watch: z.string() })).max(10),
  ask: z.array(z.object({ question: z.string(), why: z.string(), ref: z.string() })).max(8),
});

const Feedback = z.object({
  mark: z.number().int(),
  landed: z.array(z.string()).max(5),
  add: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })).max(5),
  tip: z.string(),
});

async function charge(ws: string) {
  try {
    await chargeAiRun(ws);
  } catch (err) {
    if (err instanceof UsageError) throw new PrepError(err.message);
    throw err;
  }
}

/** The proposal behind the prep, with the same preconditions as the deck (FR-DECK-1). Reads only the caller's workspace (invariant 7). */
async function load(context: HubContext, opportunityId: string, writeRunId: string) {
  const ws = context.workspace.id;
  const oppRef = db().doc(`workspaces/${ws}/opportunities/${opportunityId}`);
  const [oppSnap, runSnap] = await Promise.all([oppRef.get(), oppRef.collection("runs").doc(writeRunId).get()]);
  const opp = oppSnap.data() as Opportunity | undefined;
  const run = runSnap.data() as Run | undefined;
  if (!opp || opp.deletedAt || !run || run.stage !== "write" || !run.working) throw new PrepError("This proposal is no longer available. Reload the page.");
  if (opp.stages.write.currentRunId !== writeRunId || !["waiting", "approved"].includes(opp.stages.write.state)) throw new PrepError("This draft is out of date. Write the proposal again first.");
  const working = run.working as WriteOutput;
  if (working.claims.some((claim) => claim.support === "neither" && !claim.decision)) throw new PrepError("Decide on every flagged claim first. The prep restates only what the proposal stands behind.");
  const fit = (await oppRef.collection("runs").doc(run.inputs.upstreamRunIds.fit ?? "-").get()).get("working") as FitOutput | undefined;
  if (!fit) throw new PrepError("The fit map behind this proposal is missing. Re-run writing.");
  return { oppRef, opp, run, working, fit };
}

/**
 * Pitch prep (PRD 7.24, ADR-0016 D3). Pro writes the opener, the points to
 * land, likely questions with answers and questions to ask, from the
 * proposal's live claims and the research; code checks every item and builds
 * the numbers and probes from the deal. One AI run against the daily cap.
 */
export async function writePitchPrep(context: HubContext, opportunityId: string, writeRunId: string): Promise<PitchPrep> {
  const ws = context.workspace.id;
  const { oppRef, opp, run, working, fit } = await load(context, opportunityId, writeRunId);
  const [graph, brief] = await Promise.all([
    getGraphFor(ws),
    run.inputs.upstreamRunIds.research ? oppRef.collection("runs").doc(run.inputs.upstreamRunIds.research).get().then((snap) => (snap.get("working") as BriefOutput | undefined) ?? null) : Promise.resolve(null),
  ]);
  const evidence = followUpEvidence(working);
  if (evidence.size === 0) throw new PrepError("The proposal has no claims the prep could restate.");
  await charge(ws);

  const prospect = opp.prospect?.name ?? "the prospect";
  const sectionOf = new Map(working.blocks.map((block) => [block.id, block.section]));
  const byClaim = new Map(working.claims.map((claim) => [claim.id, claim]));
  const claims = [...evidence.entries()].map(([ref, claim]) => `${ref} [${sectionOf.get(byClaim.get(claim.id)?.blockId ?? "") ?? "proposal"}]: ${claim.text}`);
  const askRefs = askEvidence(brief, fit);
  const probes = prepProbes(fit, graph);
  const draft = await generateJson({
    tier: "pro",
    system: prompt("prep-writer", { presenter: context.user.name, seller: context.workspace.name, prospect, tone: run.inputs.options?.tone ?? working.tone }),
    prompt: [
      `<claims>\n${claims.join("\n")}\n</claims>`,
      `<research>\n${[...askRefs.entries()].map(([ref, entry]) => `${ref}: ${entry.text}`).join("\n") || "(nothing recorded)"}\n</research>`,
      `<gaps>\n${probes.map((probe) => `- ${probe.need} (${probe.kind === "outside" ? "outside what we offer" : "partly met"})`).join("\n") || "(none)"}\n</gaps>`,
    ].join("\n\n"),
    schema: Draft,
  });

  // Invariant 5: a result marked not public never reaches the presenter's script, by title or by client name.
  const nonPublic = graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);
  const checked = checkPrepDraft(draft, evidence, askRefs, nonPublic);
  const now = new Date().toISOString();
  const prep = PitchPrep.parse({ writeRunId, rev: run.rev, ...checked, numbers: prepNumbers(fit), probes, createdAt: now, createdBy: context.user.name });

  const batch = db().batch();
  batch.set(oppRef.collection("preps").doc(writeRunId), JSON.parse(JSON.stringify(prep)));
  batch.set(
    db().collection(`workspaces/${ws}/auditEvents`).doc(),
    AuditEvent.parse({ action: "generate", entity: "pitch-prep", entityId: writeRunId, summary: `FlowHub wrote the pitch prep for ${prospect}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return prep;
}

/**
 * FR-PREP-4: feedback on one practice answer. Flash marks it against the
 * claims; code then checks every amount in the answer against the approved
 * prices, and a wrong one caps the mark. One AI run against the daily cap.
 */
export async function practiseAnswer(context: HubContext, opportunityId: string, writeRunId: string, questionId: string, answer: string): Promise<PracticeAttempt> {
  const ws = context.workspace.id;
  const { oppRef, opp, working, fit } = await load(context, opportunityId, writeRunId);
  const prep = (await oppRef.collection("preps").doc(writeRunId).get()).data() as PitchPrep | undefined;
  const question = prep?.likely.find((item) => item.id === questionId);
  if (!prep || !question) throw new PrepError("This question is no longer in the prep. Reload the page.");
  await charge(ws);

  const evidence = followUpEvidence(working);
  const outside = fit.cannotMeet.map((item) => fit.gaps.find((gap) => gap.id === item.gapId)?.text).filter(Boolean);
  const feedback = await generateJson({
    tier: "flash",
    system: prompt("prep-coach", { presenter: context.user.name, seller: context.workspace.name, prospect: opp.prospect?.name ?? "the prospect" }),
    prompt: [
      `<question>\n${question.question}\n</question>`,
      `<suggested>\n${question.answer}\n</suggested>`,
      `<claims>\n${[...evidence.entries()].map(([ref, claim]) => `${ref}: ${claim.text}`).join("\n")}\n</claims>`,
      `<outside>\n${outside.map((need) => `- ${need}`).join("\n") || "(nothing recorded)"}\n</outside>`,
      `<answer>\n${answer}\n</answer>`,
    ].join("\n\n"),
    schema: Feedback,
  });

  const amountFlags = checkPracticeAmounts(answer, approvedPrices(fit));
  // A demo sample sent as it was is labelled as one; code rebuilds the samples rather than trusting the browser.
  const samples = sampleAnswers(prep, question);
  const sample = answer.trim() === samples.strong.trim() ? "strong" : answer.trim() === samples.weak.trim() ? "weak" : null;
  const modelMark = Math.max(0, Math.min(10, Math.round(feedback.mark)));
  const ref = oppRef.collection("preps").doc(writeRunId).collection("attempts").doc();
  const now = new Date().toISOString();
  const attempt = PracticeAttempt.parse({
    id: ref.id,
    questionId,
    question: question.question,
    answer,
    sample,
    mark: amountFlags.length ? Math.min(modelMark, PRACTICE_CAP) : modelMark,
    modelMark,
    landed: feedback.landed.map((text) => text.trim()).filter(Boolean).slice(0, 3),
    add: feedback.add
      .filter((item) => item.text.trim())
      .slice(0, 3)
      .map((item) => ({ text: item.text.trim(), claimIds: [...new Set(item.refs.map((key) => evidence.get(key.trim())?.id).filter((id): id is string => Boolean(id)))] })),
    tip: feedback.tip.trim(),
    amountFlags,
    createdAt: now,
    by: context.user.name,
  });
  await ref.set(JSON.parse(JSON.stringify(attempt)));
  return attempt;
}
