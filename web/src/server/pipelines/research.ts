import "server-only";
import { z } from "zod";
import { citedSources, cutClaims } from "@/lib/deal-room/claims";
import { type BriefOutput, type Claim, type IntakeOutput, TechCategory, type WebSource } from "@/lib/schema";
import { generateGrounded, generateJson } from "@/server/ai/generate";
import { prompt } from "@/server/prompts";
import type { RunContext } from "./runner";

const SECTIONS = [
  { key: "snapshot", title: "Snapshot", brief: "What the company does, its size (staff, revenue or store count), where it operates, and who its customers are. Four to six sentences.", message: "Searching for a company snapshot" },
  { key: "news", title: "Recent news and events", brief: "News and events from the last 18 months: expansion, funding, results, launches, partnerships, problems. Three to six sentences, each with its month and year.", message: "Searching recent news" },
  { key: "hiring", title: "Hiring signals", brief: "Jobs the company is hiring for now, especially technology, data, e-commerce and operations roles, and what that suggests they're building. Two to four sentences.", message: "Searching hiring signals" },
] as const;

const TechScan = z.object({ technology: z.array(z.object({ category: TechCategory, label: z.string().min(1).max(60), evidence: z.string().max(200) })).max(20) });

const Inferences = z.object({
  inferences: z.array(z.object({ section: z.enum(["needs", "sector"]), text: z.string().min(1).max(400), basedOn: z.array(z.string()) })).max(12),
  questions: z.array(z.object({ text: z.string().min(1).max(300), basedOn: z.array(z.string()) })).max(8),
});

/** Stage 2, Research (FR-RES-1 to FR-RES-6, invariant 3). Ends at Gate B. */
export async function researchPipeline(context: RunContext): Promise<BriefOutput> {
  const intake = await context.upstream<IntakeOutput>("intake");
  const prospect = intake.prospect;
  if (!prospect) throw new Error("Research needs a confirmed company");
  const now = new Date().toISOString();
  const site = prospect.website ? ` (${prospect.website})` : "";
  const country = prospect.country ? `, in ${prospect.country}` : "";
  const sourceIndex = new Map<string, WebSource>();
  const searchSuggestions: string[] = [];
  let droppedCount = 0;

  await context.event("calc", "plan", "step", `Planning research on ${prospect.name}${site}`);

  // FR-RES-1: the grounded sections and the website scan run in parallel.
  const [sectionResults, techScan] = await Promise.all([
    Promise.all(
      SECTIONS.map(async (section) => {
        const result = await context.step("ai", `research.${section.key}`, section.message, () =>
          generateGrounded({
            tier: "flash",
            system: prompt("research-section", { section: section.title, company: prospect.name, site, country, brief: section.brief }),
            prompt: `Research ${prospect.name}${site}${country}.`,
            usage: context.usage,
          }),
        );
        return { section, result };
      }),
    ),
    prospect.website
      ? context
          .step("ai", "research.tech", `Reading ${prospect.website}`, () =>
            generateJson({ tier: "flash", system: prompt("tech-scan"), prompt: `Company website: https://${prospect.website}`, schema: TechScan, tools: [{ urlContext: {} }], usage: context.usage }),
          )
          .catch(async () => {
            await context.event("calc", "research.tech", "warning", `Couldn't read ${prospect.website}. Technology signals are left out.`);
            return { technology: [] };
          })
      : Promise.resolve({ technology: [] }),
  ]);

  const claims: Claim[] = [];
  for (const { section, result } of sectionResults) {
    const metadata = result.metadata;
    if (metadata?.searchEntryPoint?.renderedContent) searchSuggestions.push(metadata.searchEntryPoint.renderedContent);
    const cut = cutClaims(section.key, { parts: result.parts, supports: metadata?.groundingSupports ?? [], chunks: metadata?.groundingChunks ?? [] }, sourceIndex, metadata?.webSearchQueries ?? [], now);
    claims.push(...cut.claims);
    droppedCount += cut.dropped;
    await context.event("calc", `claims.${section.key}`, cut.dropped ? "warning" : "step", `${section.title}: kept ${cut.claims.length} sourced ${cut.claims.length === 1 ? "claim" : "claims"}${cut.dropped ? `, dropped ${cut.dropped} with no source` : ""}`);
  }

  // Technology read from the prospect's own site cites the site.
  let siteSourceId: string | null = null;
  if (techScan.technology.length && prospect.website) {
    const uri = `https://${prospect.website}`;
    siteSourceId = sourceIndex.get(uri)?.id ?? `src_${sourceIndex.size + 1}`;
    if (!sourceIndex.has(uri)) sourceIndex.set(uri, { id: siteSourceId, groundingUri: uri, title: prospect.website, domain: prospect.website, retrievedAt: now, queries: [] });
  }

  const graph = await context.graph();
  const sellerTech = new Set(graph.offerings.flatMap((offering) => offering.technology.map((tech) => tech.label.toLowerCase())));
  const detectedTech = await context.step("calc", "tech", "Matching their technology against your offerings", async () =>
    techScan.technology.map((tech) => ({
      category: tech.category,
      value: tech.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: tech.label,
      sourceIds: siteSourceId ? [siteSourceId] : [],
      matchesSeller: [...sellerTech].some((label) => label.includes(tech.label.toLowerCase()) || tech.label.toLowerCase().includes(label)),
    })),
  );

  // FR-RES-3: inferences rest only on kept claims; code drops any that don't.
  const claimIds = new Set(claims.map((claim) => claim.id));
  const requirementIds = new Set(intake.requirements.map((requirement) => requirement.id));
  let inferences: BriefOutput["inferences"] = [];
  let questions: BriefOutput["questions"] = [];
  if (claims.length) {
    const facts = claims.map((claim) => `${claim.id}: ${claim.text}`).join("\n");
    const needs = intake.requirements.map((requirement) => `${requirement.id}: ${requirement.text}`).join("\n") || "(none stated)";
    const result = await context.step("ai", "research.inferences", "Working out likely needs and sector pressures", () =>
      generateJson({ tier: "pro", thinking: "medium", system: prompt("inferences", { company: prospect.name }), prompt: `<facts>\n${facts}\n</facts>\n\n<stated_needs>\n${needs}\n</stated_needs>`, schema: Inferences, usage: context.usage }),
    );
    inferences = result.inferences
      .map((item, index) => ({ id: `inf_${index + 1}`, section: item.section, text: item.text, basedOn: item.basedOn.filter((id) => claimIds.has(id)) }))
      .filter((item) => item.basedOn.length > 0);
    questions = result.questions.map((item, index) => ({ id: `q_${index + 1}`, text: item.text, basedOn: item.basedOn.filter((id) => claimIds.has(id) || requirementIds.has(id)) }));
    const droppedInferences = result.inferences.length - inferences.length;
    if (droppedInferences) await context.event("calc", "research.inferences", "warning", `Dropped ${droppedInferences} ${droppedInferences === 1 ? "inference" : "inferences"} that didn't rest on a sourced claim`);
  }

  const has = (key: string) => claims.some((claim) => claim.section === key);
  return {
    sections: [
      { key: "snapshot", status: has("snapshot") ? "ok" : "nothing_found" },
      { key: "news", status: has("news") ? "ok" : "nothing_found" },
      { key: "hiring", status: has("hiring") ? "ok" : "nothing_found" },
      { key: "tech", status: detectedTech.length ? "ok" : "nothing_found" },
      { key: "sector", status: inferences.some((item) => item.section === "sector") ? "ok" : "nothing_found" },
      { key: "needs", status: inferences.some((item) => item.section === "needs") ? "ok" : "nothing_found" },
      { key: "questions", status: questions.length ? "ok" : "nothing_found" },
    ],
    claims,
    inferences,
    sources: { ...citedSources(claims, sourceIndex), ...(siteSourceId ? { [siteSourceId]: [...sourceIndex.values()].find((source) => source.id === siteSourceId)! } : {}) },
    droppedCount,
    searchSuggestions,
    detectedTech,
    questions,
    sellerNotes: [],
  };
}
