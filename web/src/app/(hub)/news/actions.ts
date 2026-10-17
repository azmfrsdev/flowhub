"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EDITION_DAY } from "@/lib/news/scout";
import { AuditEvent, NewsEdition, Opportunity } from "@/lib/schema";
import { ModelBusyError, ModelOutputError, withModelScope } from "@/server/ai/generate";
import { StageError, startStage } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import { ScoutError, printEdition } from "@/server/pipelines/scout";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

/** The page waits on the scan, so Gemini retries stop after 3 minutes and the person sees why. */
const SCAN_DEADLINE_MS = 3 * 60_000;

/**
 * FR-NEWS-2 to FR-NEWS-8: scans the news into today's edition, replacing any
 * earlier scan today. A failure shows under the button, never as an error
 * page. The scan counts once against the daily cap, retries included.
 */
export async function scanToday(): Promise<{ error?: string }> {
  const context = await requireRole("editor");
  try {
    await withModelScope({ deadline: Date.now() + SCAN_DEADLINE_MS }, () => printEdition(context));
  } catch (err) {
    if (err instanceof ScoutError || err instanceof ModelBusyError) return { error: err.message };
    if (err instanceof ModelOutputError) return { error: "Gemini's answer didn't have the expected shape. Try again." };
    console.error("News scan failed:", err);
    return { error: "The scan didn't finish. Try again in a minute." };
  }
  refresh();
  return {};
}

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/**
 * FR-NEWS-7: a person opens a deal from a story. The story and its source
 * links become the intake input, its offerings the deal's interests, and
 * intake starts. A story already opened goes to its deal.
 */
export async function openDeal(day: string, storyId: string): Promise<{ error?: string }> {
  const context = await requireRole("editor");
  [day, storyId] = parseArgs([z.string().regex(EDITION_DAY), ArgId], [day, storyId]);
  const base = db().collection("workspaces").doc(context.workspace.id);
  const editionRef = base.collection("editions").doc(day);
  const ref = base.collection("opportunities").doc();
  const now = new Date().toISOString();

  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(editionRef);
    const parsed = NewsEdition.safeParse(snap.data());
    if (!parsed.success) return { error: "That paper is no longer available." };
    const edition = parsed.data;
    const story = edition.stories.find((item) => item.id === storyId);
    if (!story) return { error: "That story is no longer in this paper." };
    if (story.opportunityId) return { existing: story.opportunityId };
    const offeringSnaps = await Promise.all(story.offeringIds.map((id) => tx.get(base.collection("offerings").doc(id))));
    const interested = offeringSnaps.filter((doc) => doc.exists && !doc.get("deletedAt")).map((doc) => doc.id);

    const lines = story.claims.map((claim) => {
      const sources = claim.sourceIds.flatMap((id) => (edition.sources[id] ? [`${edition.sources[id].domain}: ${edition.sources[id].groundingUri}`] : []));
      return `- ${claim.text}${sources.length ? ` (Sources: ${sources.join("; ")})` : ""}`;
    });
    const text = [
      `A lead from FlowHub's news scout, printed ${dateLabel(edition.printedAt)}.`,
      `Company: ${story.company}${story.country ? ` (${story.country})` : ""}`,
      `Headline: ${story.headline}`,
      "What the news says:",
      ...lines,
      `Why it could be a lead: ${story.why}`,
    ].join("\n");

    const idle = { state: "idle" as const, currentRunId: null, updatedAt: now };
    const opportunity = Opportunity.parse({
      id: ref.id,
      workspaceId: context.workspace.id,
      prospect: null,
      persona: context.workspace.persona,
      intakeType: "news",
      source: `News: ${story.headline}`,
      interestedOfferingIds: interested,
      status: "new",
      inputs: [{ kind: "text", text }],
      stages: { intake: idle, research: idle, fit: idle, write: idle },
      rev: 0,
      createdAt: now,
      createdBy: context.user.name,
      updatedAt: now,
    });
    tx.set(ref, JSON.parse(JSON.stringify(opportunity)));
    tx.update(editionRef, { stories: edition.stories.map((item) => (item.id === storyId ? { ...item, opportunityId: ref.id } : item)) });
    tx.set(base.collection("auditEvents").doc(), AuditEvent.parse({ action: "create", entity: "opportunity", entityId: ref.id, summary: `Opened a deal with ${story.company} from the paper of ${dateLabel(edition.printedAt)}.`, by: context.user.uid, byName: context.user.name, at: now }));
    return { created: ref.id };
  });

  if ("error" in outcome) return { error: outcome.error };
  if ("existing" in outcome) redirect(`/opportunities/${outcome.existing}`);
  try {
    await startStage(context, outcome.created, "intake");
  } catch (err) {
    if (!(err instanceof StageError)) throw err;
    // The deal exists; the deal room shows why intake didn't start and offers Retry.
  }
  redirect(`/opportunities/${outcome.created}`);
}
