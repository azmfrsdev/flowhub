import "server-only";
import { z } from "zod";
import { citedSources, cutClaims } from "@/lib/deal-room/claims";
import { EDITION_DAY, assembleStories, buildBeats } from "@/lib/news/scout";
import { malaysiaDay } from "@/lib/offerings/view";
import { AuditEvent, type Claim, COUNTRIES, NewsEdition, NewsTrigger, Opportunity, type WebSource } from "@/lib/schema";
import { generateGrounded, generateJson } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";

export class ScoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoutError";
  }
}

const Drafts = z.object({
  stories: z
    .array(
      z.object({
        company: z.string().min(1).max(120),
        country: z.string().max(2).optional(),
        headline: z.string().min(1).max(120),
        trigger: NewsTrigger,
        basedOn: z.array(z.string()),
        offeringIds: z.array(z.string()),
        why: z.string().max(300),
      }),
    )
    .max(12),
});

/**
 * News scout (PRD 7.21, ADR-0014). Code builds four beats from the hub; each
 * runs as a Google Search grounded call, in parallel, and is cut into sourced
 * claims (invariant 3). Flash groups the claims into stories; code keeps only
 * stories that rest on claims and name a live offering, leaves out known
 * companies and rule breakers, and scores the rest. One AI run against the
 * daily cap. Reads only the caller's workspace (invariant 7).
 */
export async function printEdition(context: HubContext): Promise<NewsEdition> {
  const base = db().collection("workspaces").doc(context.workspace.id);
  const [graph, opportunitiesSnap, recentSnap] = await Promise.all([
    getGraphFor(context.workspace.id),
    base.collection("opportunities").get(),
    base.collection("editions").orderBy("printedAt", "desc").limit(7).get(),
  ]);
  const offerings = graph.offerings.filter((offering) => !offering.parentId && offering.status !== "retired");
  if (offerings.length === 0) throw new ScoutError("Add an offering first. The scout looks for companies that could need what you sell.");

  const opportunities = opportunitiesSnap.docs.flatMap((doc) => {
    const parsed = Opportunity.safeParse(doc.data());
    return parsed.success && !parsed.data.deletedAt ? [parsed.data] : [];
  });
  // A deal opened from a recent paper has no confirmed company until Gate A, so its story's company counts as known too.
  const live = new Set(opportunities.map((opportunity) => opportunity.id));
  const opened = recentSnap.docs.flatMap((doc) => {
    const parsed = EDITION_DAY.test(doc.id) ? NewsEdition.safeParse(doc.data()) : null;
    return parsed?.success ? parsed.data.stories.filter((story) => story.opportunityId && live.has(story.opportunityId)).map((story) => story.company) : [];
  });
  const knownCompanies = [...opportunities.flatMap((opportunity) => (opportunity.prospect ? [opportunity.prospect.name] : [])), ...opened];
  // FR-NEWS-1: public results and won deals only, never private results.
  const pastClients = [
    ...graph.proof.filter((proof) => proof.isPublic && proof.clientName).map((proof) => proof.clientName!),
    ...opportunities.filter((opportunity) => opportunity.outcome?.result === "won" && opportunity.prospect).map((opportunity) => opportunity.prospect!.name),
  ];
  const rules = graph.constraints.filter((rule) => rule.offeringIds.length === 0);
  const beats = buildBeats({ country: context.workspace.country, offerings: offerings.map(({ id, name, summary }) => ({ id, name, summary })), rules, pastClients });

  try {
    await chargeAiRun(context.workspace.id);
  } catch (err) {
    if (err instanceof UsageError) throw new ScoutError(err.message);
    throw err;
  }

  const now = new Date();
  const day = malaysiaDay(now);
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(now);
  const country = COUNTRIES[context.workspace.country as keyof typeof COUNTRIES] ?? context.workspace.country;
  const avoid = rules.filter((rule) => rule.kind === "industry").flatMap((rule) => rule.values).join(", ") || "none";

  // FR-NEWS-2: the four beats run in parallel; a beat that fails is left out, not fatal.
  const results = await Promise.all(
    beats.map((beat) =>
      generateGrounded({ tier: "flash", system: prompt("news-beat", { seller: context.workspace.name, country, today, focus: beat.focus, avoid }), prompt: `Find this beat's news for ${context.workspace.name}.` }).catch(() => null),
    ),
  );
  if (results.every((result) => result === null)) throw new ScoutError("The news search didn't answer. Try again in a minute.");

  const sourceIndex = new Map<string, WebSource>();
  const searchSuggestions: string[] = [];
  const claims: Claim[] = [];
  let unsourced = 0;
  const beatSummary = beats.map((beat, index) => {
    const result = results[index];
    if (!result) return { key: beat.key, title: beat.title, claims: 0 };
    const metadata = result.metadata;
    if (metadata?.searchEntryPoint?.renderedContent) searchSuggestions.push(metadata.searchEntryPoint.renderedContent);
    const cut = cutClaims("news", { parts: result.parts, supports: metadata?.groundingSupports ?? [], chunks: metadata?.groundingChunks ?? [] }, sourceIndex, metadata?.webSearchQueries ?? [], now.toISOString());
    unsourced += cut.dropped;
    const renamed = cut.claims.map((claim, n) => ({ ...claim, id: `${beat.key}_${n + 1}` }));
    claims.push(...renamed);
    return { key: beat.key, title: beat.title, claims: renamed.length };
  });

  let drafts: z.infer<typeof Drafts>["stories"] = [];
  if (claims.length) {
    const items = claims.map((claim) => `${claim.id}: ${claim.text}`).join("\n");
    const catalogue = offerings.map((offering) => `${offering.id}: ${offering.name}. ${offering.summary}`).join("\n");
    drafts = (
      await generateJson({
        // Grouping is extraction, and the page waits on it: Flash (on 2026-10-17 a Pro editor made an edition take 103 s).
        tier: "flash",
        system: prompt("news-stories", { seller: context.workspace.name }),
        prompt: `<offerings>\n${catalogue}\n</offerings>\n\n<news_items>\n${items}\n</news_items>`,
        schema: Drafts,
      })
    ).stories;
  }

  const { stories, left } = assembleStories({ drafts, claims, sources: sourceIndex, offeringIds: new Set(offerings.map((offering) => offering.id)), knownCompanies, rules, today: now });
  const kept = stories.flatMap((story) => story.claims);
  const edition = NewsEdition.parse({
    id: day,
    printedAt: now.toISOString(),
    printedBy: context.user.name,
    beats: beatSummary,
    stories,
    sources: citedSources(kept, sourceIndex),
    searchSuggestions,
    left: { unsourced, ...left },
  });

  const batch = db().batch();
  // FR-NEWS-8: one edition per day; printing again the same day replaces it, and earlier days stay readable.
  batch.set(base.collection("editions").doc(day), JSON.parse(JSON.stringify(edition)));
  batch.set(
    base.collection("auditEvents").doc(),
    AuditEvent.parse({ action: "generate", entity: "news-edition", entityId: day, summary: `FlowHub scanned the news: ${stories.length} ${stories.length === 1 ? "lead" : "leads"} in today's paper.`, by: context.user.uid, byName: context.user.name, at: now.toISOString() }),
  );
  await batch.commit();
  return edition;
}
