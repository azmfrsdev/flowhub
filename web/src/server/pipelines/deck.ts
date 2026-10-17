import "server-only";
import { z } from "zod";
import { checkDeckDraft, clamp, deckFit, deckInvestment, deckProof, leaks, photoQuery } from "@/lib/deal-room/deck";
import { followUpEvidence } from "@/lib/deal-room/follow-up";
import { AuditEvent, ClientDeck, DECK_SLIDES, type DeckPhoto, type FitOutput, type Opportunity, type Run, type WriteOutput } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { type PhotoCandidate, searchPhotos } from "@/server/deck/openverse";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";

export class DeckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckError";
  }
}

const Item = z.object({ text: z.string(), refs: z.array(z.string()) });
const Notes = z.array(z.object({ header: z.string(), bullets: z.array(z.string()) }));
const Draft = z.object({
  heard: z.object({ standfirst: Item, today: z.array(Item), change: z.array(Item), closing: Item }),
  deliver: z.object({ cards: z.array(z.object({ title: z.string(), text: z.string(), refs: z.array(z.string()) })), closing: Item }),
  plan: z.object({ phases: z.array(z.object({ name: z.string(), detail: z.string(), duration: z.string(), refs: z.array(z.string()) })), closing: Item }),
  next: z.object({ headline: z.string(), steps: z.array(Item) }),
  notes: z.object(Object.fromEntries(DECK_SLIDES.map((slide) => [slide, Notes])) as Record<(typeof DECK_SLIDES)[number], typeof Notes>),
  photos: z.object({ title: z.array(z.string()), proof: z.array(z.string()) }),
});

const Choice = z.object({ choice: z.number().int() });

/**
 * FR-DECK-5: Flash reads the candidates' titles and tags and picks the photo
 * that suits a client deck, or none. Code already kept only open licences and
 * unbranded photos; the model judges fit and taste. A failed call means no photo.
 */
async function choosePhoto(candidates: PhotoCandidate[], purpose: string): Promise<DeckPhoto | null> {
  if (candidates.length === 0) return null;
  const list = candidates.map((candidate, index) => `${index}: "${candidate.photo.title}" (tags: ${candidate.tags.join(", ") || "none"})`).join("\n");
  try {
    const { choice } = await generateJson({ tier: "flash", system: prompt("deck-photo", { purpose }), prompt: `<photos>\n${list}\n</photos>`, schema: Choice });
    return candidates[choice]?.photo ?? null;
  } catch {
    return null;
  }
}

/**
 * The client deck (PRD 7.22, ADR-0015). Pro condenses the approved proposal's
 * live claims into four slides and writes the speaker notes; code checks every
 * item (lib/deal-room/deck), builds the fit, investment and proof slides from
 * the deal, and finds photos with an open licence on Openverse. One AI run
 * against the daily cap. Reads only the caller's workspace (invariant 7).
 */
export async function writeClientDeck(context: HubContext, opportunityId: string, writeRunId: string): Promise<ClientDeck> {
  const ws = context.workspace.id;
  const oppRef = db().doc(`workspaces/${ws}/opportunities/${opportunityId}`);
  const [oppSnap, runSnap, graph] = await Promise.all([oppRef.get(), oppRef.collection("runs").doc(writeRunId).get(), getGraphFor(ws)]);
  const opp = oppSnap.data() as Opportunity | undefined;
  const run = runSnap.data() as Run | undefined;
  if (!opp || opp.deletedAt || !run || run.stage !== "write" || !run.working) throw new DeckError("This proposal is no longer available. Reload the page.");
  if (opp.stages.write.currentRunId !== writeRunId || !["waiting", "approved"].includes(opp.stages.write.state)) throw new DeckError("This draft is out of date. Write the proposal again first.");
  const working = run.working as WriteOutput;
  if (working.claims.some((claim) => claim.support === "neither" && !claim.decision)) throw new DeckError("Decide on every flagged claim first. The deck restates only what the proposal stands behind.");
  const fit = (await oppRef.collection("runs").doc(run.inputs.upstreamRunIds.fit ?? "-").get()).get("working") as FitOutput | undefined;
  if (!fit) throw new DeckError("The fit map behind this proposal is missing. Re-run writing.");
  const evidence = followUpEvidence(working);
  if (evidence.size === 0) throw new DeckError("The proposal has no claims the deck could restate.");

  try {
    await chargeAiRun(ws);
  } catch (err) {
    if (err instanceof UsageError) throw new DeckError(err.message);
    throw err;
  }

  const prospect = opp.prospect?.name ?? "the prospect";
  const sectionOf = new Map(working.blocks.map((block) => [block.id, block.section]));
  const byClaim = new Map(working.claims.map((claim) => [claim.id, claim]));
  const claims = [...evidence.entries()].map(([ref, claim]) => `${ref} [${sectionOf.get(byClaim.get(claim.id)?.blockId ?? "") ?? "proposal"}]: ${claim.text}`).join("\n");
  const draft = await generateJson({
    tier: "pro",
    system: prompt("deck-writer", { seller: context.workspace.name, prospect, tone: run.inputs.options?.tone ?? working.tone }),
    prompt: `<claims>\n${claims}\n</claims>`,
    schema: Draft,
  });

  // Invariant 5: a result marked not public never reaches the client, by title or by client name.
  const nonPublic = graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);
  const checked = checkDeckDraft(draft, evidence, nonPublic);
  const names = [prospect, context.workspace.name];
  const queries = (list: string[]) => list.map((query) => photoQuery(query, names)).filter(Boolean);
  const titlePhoto = await choosePhoto(await searchPhotos(queries(draft.photos.title)), `the opening slide of a proposal to ${prospect}`);
  const proofPhoto = await choosePhoto(await searchPhotos(queries(draft.photos.proof), titlePhoto ? [titlePhoto.url] : []), "a slide of past results and case studies");

  const titleBlock = working.blocks.find((block) => block.section === "title")?.text.trim() ?? "";
  const now = new Date().toISOString();
  const deck = ClientDeck.parse({
    writeRunId,
    rev: run.rev,
    title: {
      prospect,
      seller: context.workspace.name,
      headline: titleBlock && !leaks(titleBlock, nonPublic) ? clamp(titleBlock, 110) : `Proposal for ${prospect}`,
      date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date()),
      presenter: context.user.name,
    },
    heard: checked.heard,
    fit: deckFit(fit, graph),
    deliver: checked.deliver,
    plan: checked.plan,
    investment: deckInvestment(fit.pricing.lines),
    proof: deckProof(fit, graph),
    next: { headline: checked.next.headline || "Let's agree the next step", steps: checked.next.steps },
    notes: checked.notes,
    photos: { title: titlePhoto, proof: proofPhoto },
    dropped: checked.dropped,
    createdAt: now,
    createdBy: context.user.name,
    slides: null,
  });

  const batch = db().batch();
  batch.set(oppRef.collection("decks").doc(writeRunId), JSON.parse(JSON.stringify(deck)));
  batch.set(
    db().collection(`workspaces/${ws}/auditEvents`).doc(),
    AuditEvent.parse({ action: "generate", entity: "client-deck", entityId: writeRunId, summary: `FlowHub wrote a client deck for ${prospect}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return deck;
}
