import "server-only";
import { z } from "zod";
import { followUpEvidence } from "@/lib/deal-room/follow-up";
import { approvedPrices, prepProbes } from "@/lib/deal-room/prep";
import { REHEARSAL_LIMITS, buyerKnowledge, buyerOf, checkCoaching, checkTranscriptAmounts, rehearsalOver, transcriptText } from "@/lib/deal-room/rehearsal";
import { AuditEvent, type BriefOutput, Rehearsal, type RehearsalMode, type RehearsalMood, type RehearsalPush, type RehearsalTurn } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";
import { PrepError, loadProposal } from "./prep";

/**
 * Rehearsal (PRD 7.26, ADR-0017). The buyer is played by Gemini from a brief
 * code builds out of the approved proposal (D3). Text mode runs here, one
 * Flash call per buyer turn with the transcript loaded from Firestore (D4);
 * voice runs in the relay (`src/live/`), which shares `buyerInstruction`.
 * Coaching is one Pro call, checked in code (D5). One AI run per rehearsal.
 */

export class RehearsalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RehearsalError";
  }
}

const rehearsalPath = (ws: string, opportunityId: string, rehearsalId: string) => `workspaces/${ws}/opportunities/${opportunityId}/rehearsals/${rehearsalId}`;

async function proposal(ws: string, opportunityId: string, writeRunId: string) {
  try {
    return await loadProposal(ws, opportunityId, writeRunId);
  } catch (err) {
    if (err instanceof PrepError) throw new RehearsalError(err.message);
    throw err;
  }
}

/**
 * The buyer's system instruction, built in code from Firestore (ADR-0017 D3).
 * Never cost, buy prices, partner contacts or private results: the claims are
 * the follow-up evidence (no amounts), the prices are approved sell prices,
 * and the gaps come from prep probes (partner names and alternatives only).
 */
export async function buyerInstruction(ws: string, opportunityId: string, rehearsal: Pick<Rehearsal, "writeRunId" | "buyer" | "pushOn" | "mood">, names: { seller: string; presenter: string }) {
  const { oppRef, opp, run, working, fit } = await proposal(ws, opportunityId, rehearsal.writeRunId);
  const [graph, brief] = await Promise.all([
    getGraphFor(ws),
    run.inputs.upstreamRunIds.research ? oppRef.collection("runs").doc(run.inputs.upstreamRunIds.research).get().then((snap) => (snap.get("working") as BriefOutput | undefined) ?? null) : Promise.resolve(null),
  ]);
  const prospect = opp.prospect?.name ?? "the prospect";
  const knowledge = buyerKnowledge({
    ...names,
    prospect,
    buyer: rehearsal.buyer,
    pushOn: rehearsal.pushOn,
    mood: rehearsal.mood,
    claims: [...followUpEvidence(working).values()].map((claim) => claim.text),
    prices: approvedPrices(fit).texts,
    probes: prepProbes(fit, graph),
    openQuestions: (brief?.questions ?? []).map((question) => question.text).slice(0, 5),
  });
  return { system: prompt("rehearsal-buyer", { ...names, knowledge }), prospect };
}

async function charge(ws: string) {
  try {
    await chargeAiRun(ws);
  } catch (err) {
    if (err instanceof UsageError) throw new RehearsalError(err.message);
    throw err;
  }
}

const BuyerTurn = z.object({ reply: z.string() });

async function buyerReply(system: string, turns: RehearsalTurn[], buyerName: string): Promise<string> {
  const { reply } = await generateJson({
    tier: "flash",
    system,
    prompt: `<transcript>\n${transcriptText(turns, buyerName) || "(The meeting is starting. You speak first.)"}\n</transcript>\n\nWrite your next turn as ${buyerName}, in "reply". Only the words you say.`,
    schema: BuyerTurn,
  });
  return reply.replace(/\s+/g, " ").trim().slice(0, REHEARSAL_LIMITS.turnChars) || "Go on.";
}

/** FR-REH-1: sets up a rehearsal. One AI run. Text mode opens with the buyer's first question; voice waits for the relay. */
export async function startRehearsal(
  context: HubContext,
  opportunityId: string,
  writeRunId: string,
  options: { mode: RehearsalMode; pushOn: RehearsalPush[]; mood: RehearsalMood },
): Promise<string> {
  const ws = context.workspace.id;
  const { oppRef, opp, run } = await proposal(ws, opportunityId, writeRunId);
  const buyer = buyerOf(opp.contact);
  const names = { seller: context.workspace.name, presenter: context.user.name };
  // Build the brief before charging, so a broken proposal costs nothing.
  const { system, prospect } = await buyerInstruction(ws, opportunityId, { writeRunId, buyer, pushOn: options.pushOn, mood: options.mood }, names);
  await charge(ws);

  const ref = oppRef.collection("rehearsals").doc();
  const now = new Date().toISOString();
  const turns: RehearsalTurn[] = options.mode === "text" ? [{ who: "buyer", text: await buyerReply(system, [], buyer.name), at: 0 }] : [];
  const rehearsal = Rehearsal.parse({
    id: ref.id,
    writeRunId,
    rev: run.rev,
    mode: options.mode,
    status: options.mode === "text" ? "live" : "ready",
    buyer,
    pushOn: options.pushOn,
    mood: options.mood,
    turns,
    startedAt: now,
    createdBy: context.user.name,
    createdByUid: context.user.uid,
  });
  const batch = db().batch();
  batch.set(ref, JSON.parse(JSON.stringify(rehearsal)));
  batch.set(
    db().collection(`workspaces/${ws}/auditEvents`).doc(),
    AuditEvent.parse({ action: "generate", entity: "rehearsal", entityId: ref.id, summary: `${context.user.name} started a ${options.mode} rehearsal with ${buyer.name} of ${prospect}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return ref.id;
}

async function own(context: HubContext, opportunityId: string, rehearsalId: string) {
  const ref = db().doc(rehearsalPath(context.workspace.id, opportunityId, rehearsalId));
  const rehearsal = (await ref.get()).data() as Rehearsal | undefined;
  if (!rehearsal) throw new RehearsalError("This rehearsal no longer exists. Reload the page.");
  if (rehearsal.createdByUid !== context.user.uid) throw new RehearsalError("Only the person who started this rehearsal can continue it.");
  return { ref, rehearsal };
}

/** FR-REH-4: one typed turn from the salesperson, and the buyer's answer. Part of the rehearsal's AI run. */
export async function rehearsalTurn(context: HubContext, opportunityId: string, rehearsalId: string, text: string): Promise<void> {
  const { ref, rehearsal } = await own(context, opportunityId, rehearsalId);
  if (rehearsal.mode !== "text" || rehearsal.status !== "live") throw new RehearsalError("This rehearsal has ended.");
  const over = rehearsalOver(rehearsal);
  if (over) {
    await ref.update({ status: "ended", endedAt: new Date().toISOString(), endReason: over });
    throw new RehearsalError(over === "time" ? "The 10 minutes are up. Get your coaching." : "That's the most turns for one rehearsal. Get your coaching.");
  }
  const at = (ms: number) => Math.round((ms - Date.parse(rehearsal.startedAt)) / 1000);
  const turns: RehearsalTurn[] = [...rehearsal.turns, { who: "seller", text: text.slice(0, REHEARSAL_LIMITS.turnChars), at: at(Date.now()) }];
  await ref.update({ turns });
  const { system } = await buyerInstruction(context.workspace.id, opportunityId, rehearsal, { seller: context.workspace.name, presenter: context.user.name });
  const reply = await buyerReply(system, turns, rehearsal.buyer.name);
  const next = [...turns, { who: "buyer" as const, text: reply, at: at(Date.now()) }];
  const ended = rehearsalOver({ ...rehearsal, turns: next });
  await ref.update({ turns: next, ...(ended ? { status: "ended", endedAt: new Date().toISOString(), endReason: ended } : {}) });
}

const CoachOut = z.object({
  mark: z.number(),
  landed: z.array(z.string()).max(5),
  fix: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })).max(5),
  unready: z.array(z.string()).max(5),
  tip: z.string(),
});

/**
 * FR-REH-5: ends the rehearsal if it is still going, then coaches it. Pro
 * marks the transcript; code flags every amount the salesperson said that
 * isn't an approved price, caps the mark, and drops leaking items.
 */
export async function coachRehearsal(context: HubContext, opportunityId: string, rehearsalId: string): Promise<void> {
  const ws = context.workspace.id;
  const { ref, rehearsal } = await own(context, opportunityId, rehearsalId);
  if (rehearsal.status === "coached") return;
  if (rehearsal.status === "ready" || rehearsal.status === "live") {
    await ref.update({ status: "ended", endedAt: new Date().toISOString(), endReason: "person" });
  }
  if (!rehearsal.turns.some((turn) => turn.who === "seller")) throw new RehearsalError("You didn't say anything yet, so there's nothing to coach. Start a new rehearsal.");

  const { opp, working, fit } = await proposal(ws, opportunityId, rehearsal.writeRunId);
  const graph = await getGraphFor(ws);
  const evidence = followUpEvidence(working);
  const outside = prepProbes(fit, graph).map((probe) => `- ${probe.need} (${probe.kind === "outside" ? "can't meet" : "partly met"})`);
  const draft = await generateJson({
    tier: "pro",
    system: prompt("rehearsal-coach", { presenter: rehearsal.createdBy, seller: context.workspace.name, buyer: rehearsal.buyer.name, prospect: opp.prospect?.name ?? "the prospect" }),
    prompt: [
      `<claims>\n${[...evidence.entries()].map(([key, claim]) => `${key}: ${claim.text}`).join("\n") || "(none)"}\n</claims>`,
      `<gaps>\n${outside.join("\n") || "(none)"}\n</gaps>`,
      `<transcript>\n${transcriptText(rehearsal.turns, rehearsal.buyer.name)}\n</transcript>`,
    ].join("\n\n"),
    schema: CoachOut,
  });
  const nonPublic = graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);
  const flags = checkTranscriptAmounts(rehearsal.turns, approvedPrices(fit));
  const coaching = { ...checkCoaching(draft, evidence, nonPublic, flags), createdAt: new Date().toISOString() };
  await ref.update({ status: "coached", coaching: JSON.parse(JSON.stringify(coaching)) });
}
