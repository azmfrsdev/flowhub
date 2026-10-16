import "server-only";
import { z } from "zod";
import { checkFollowUp, followUpEvidence } from "@/lib/deal-room/follow-up";
import { AuditEvent, FollowUp, type Opportunity, type Run, type WriteOutput } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";

export class FollowUpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowUpError";
  }
}

const Draft = z.object({
  subject: z.string().max(200),
  paragraphs: z
    .array(z.object({ sentences: z.array(z.object({ text: z.string().max(600), kind: z.enum(["courtesy", "claim"]), refs: z.array(z.string()) })).max(8) }))
    .max(5),
});

/**
 * C3: a follow-up email after the proposal, in the run's tone, ready to copy.
 * Flash writes it from the proposal's live claims only; code checks every
 * sentence (lib/deal-room/follow-up). One AI run against the daily cap.
 * FlowHub never sends it.
 */
export async function draftFollowUp(context: HubContext, opportunityId: string, writeRunId: string): Promise<FollowUp> {
  const ws = context.workspace.id;
  const oppRef = db().doc(`workspaces/${ws}/opportunities/${opportunityId}`);
  const [oppSnap, runSnap, graph] = await Promise.all([oppRef.get(), oppRef.collection("runs").doc(writeRunId).get(), getGraphFor(ws)]);
  const opp = oppSnap.data() as Opportunity | undefined;
  const run = runSnap.data() as Run | undefined;
  if (!opp || opp.deletedAt || !run || run.stage !== "write" || !run.working) throw new FollowUpError("This proposal is no longer available. Reload the page.");
  if (opp.stages.write.currentRunId !== writeRunId || !["waiting", "approved"].includes(opp.stages.write.state)) throw new FollowUpError("This draft is out of date. Write the proposal again first.");
  const working = run.working as WriteOutput;
  if (working.claims.some((claim) => claim.support === "neither" && !claim.decision)) throw new FollowUpError("Decide on every flagged claim first. The email restates only what the proposal stands behind.");
  const evidence = followUpEvidence(working);
  if (evidence.size === 0) throw new FollowUpError("The proposal has no claims the email could restate.");

  try {
    await chargeAiRun(ws);
  } catch (err) {
    if (err instanceof UsageError) throw new FollowUpError(err.message);
    throw err;
  }

  const prospect = opp.prospect?.name ?? "the prospect";
  const tone = run.inputs.options?.tone ?? working.tone;
  const draft = await generateJson({
    tier: "flash",
    system: prompt("follow-up-email", { sender: context.user.name, seller: context.workspace.name, prospect, tone }),
    prompt: [
      `<recipient>\n${opp.contact ? `${opp.contact.name}${opp.contact.role ? `, ${opp.contact.role}` : ""}` : "The team (no contact name given)"}\n</recipient>`,
      `<meeting>\n${opp.nextMeeting ?? "(none booked)"}\n</meeting>`,
      `<claims>\n${[...evidence.entries()].map(([ref, claim]) => `${ref}: ${claim.text}`).join("\n")}\n</claims>`,
    ].join("\n\n"),
    schema: Draft,
  });

  // Invariant 5: a result marked not public never reaches a client, by title or by client name.
  const nonPublic = graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);
  const checked = checkFollowUp(draft, evidence, nonPublic, `Following up: our proposal for ${prospect}`);
  const now = new Date().toISOString();
  const followUp = FollowUp.parse({ writeRunId, ...checked, tone, createdAt: now, createdBy: context.user.name });

  const batch = db().batch();
  batch.set(oppRef.collection("followUps").doc(writeRunId), JSON.parse(JSON.stringify(followUp)));
  batch.set(
    db().collection(`workspaces/${ws}/auditEvents`).doc(),
    AuditEvent.parse({ action: "generate", entity: "follow-up", entityId: writeRunId, summary: `FlowHub drafted a follow-up email to ${prospect}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return followUp;
}
