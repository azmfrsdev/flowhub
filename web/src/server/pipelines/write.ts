import "server-only";
import { z } from "zod";
import { PRICE_PLACEHOLDER, type HardCheckContext, hardChecks, supportFromRefs } from "@/lib/deal-room/review";
import { moneyMatches, moneyTokens } from "@/lib/pricing/money";
import type { BriefOutput, FitOutput, IntakeOutput, WriteOutput } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { prompt } from "@/server/prompts";
import template from "@/server/templates/sme.json";
import type { RunContext } from "./runner";

const KINDS = ["heading", "paragraph", "bullets", "pricing_table", "quote"] as const;
const Draft = z.object({
  blocks: z.array(z.object({ section: z.string(), kind: z.enum(KINDS), text: z.string().max(4000), refs: z.array(z.string()) })).max(20),
  /** Sentences written only because the salesperson asked: they go to Gate D rather than being revised away. */
  requested: z.array(z.string().max(600)).max(10).default([]),
});
const Review = z.object({
  claims: z.array(z.object({ blockIndex: z.number().int().nonnegative(), text: z.string().min(1).max(600), support: z.enum(["research", "offering", "seller", "neither"]), refs: z.array(z.string()) })).max(80),
});

type Block = WriteOutput["blocks"][number];
type Claim = WriteOutput["claims"][number];
const MAX_REVISIONS = 2;

const normalise = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** The sentence around a matched phrase, for a hard-check claim the person can act on. */
function sentenceAround(text: string, needle: string): string {
  const flat = text.replace(/\n-\s*/g, "\n");
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return needle;
  const start = Math.max(flat.lastIndexOf(". ", at) + 2, flat.lastIndexOf("\n", at) + 1, 0);
  const endDot = flat.indexOf(". ", at);
  const endLine = flat.indexOf("\n", at);
  const end = [endDot === -1 ? flat.length : endDot + 1, endLine === -1 ? flat.length : endLine].reduce((a, b) => Math.min(a, b));
  return flat.slice(start, end).replace(/^-\s*/, "").trim();
}

/** Stage 4, Write and Review (FR-WRI-1, FR-WRI-3, FR-WRI-4, FR-WRI-8; ADR-0006 D3, D5). Ends at Gate D. */
export async function writePipeline(context: RunContext): Promise<WriteOutput> {
  const [intake, brief, fit, graph] = await Promise.all([
    context.upstream<IntakeOutput>("intake"),
    context.upstream<BriefOutput>("research"),
    context.upstream<FitOutput>("fit"),
    context.graph(),
  ]);
  const prospect = intake.prospect?.name ?? "the prospect";
  const tone = context.run.inputs.options?.tone ?? "formal";
  const instructions = context.run.inputs.options?.instructions?.trim();

  // The evidence pack: everything the Writer may say, each with an ID. No cost and no non-public result ever enters it.
  const { evidence, known, checks } = await context.step("calc", "write.evidence", "Gathering the approved evidence", async () => {
    const lines: string[] = [];
    const known = new Set<string>(["price"]);
    const add = (id: string, text: string) => {
      known.add(id);
      lines.push(`${id}: ${text}`);
    };
    const claims = brief.claims.filter((claim) => !claim.removed);
    for (const claim of claims) add(`c:${claim.id}`, `${claim.text} (source: ${claim.sourceIds.map((id) => brief.sources[id]?.domain).filter(Boolean).join(", ")})`);
    for (const item of brief.inferences) add(`i:${item.id}`, item.text);
    for (const requirement of intake.requirements) add(`r:${requirement.id}`, requirement.text);
    for (const note of brief.sellerNotes) add(`n:${note.id}`, note.text);
    const mapped = new Set(fit.mappings.map((mapping) => mapping.target.id));
    for (const offering of graph.offerings.filter((item) => mapped.has(item.id))) {
      add(`o:${offering.id}`, `${offering.name}. ${offering.summary}${offering.facts.typicalLength ? ` Typical length: ${offering.facts.typicalLength}.` : ""}`);
      for (const feature of offering.features.filter((item) => item.status === "active")) add(`f:${feature.id}`, `${feature.name} (${offering.name}): ${feature.description}`);
    }
    const proofIds = new Set(fit.mappings.flatMap((mapping) => mapping.proofRefs.filter((proof) => proof.isPublic).map((proof) => proof.id)));
    for (const item of graph.proof.filter((proof) => proof.isPublic && proofIds.has(proof.id))) add(`p:${item.id}`, `${item.title} ${item.body}`.trim());
    for (const item of fit.cannotMeet) {
      const rule = graph.constraints.find((constraint) => constraint.id === item.constraint.id);
      const partner = graph.partners.find((candidate) => candidate.id === item.partner?.id);
      if (rule) add(`x:${rule.id}`, `We don't do this: ${rule.statement}${rule.insteadText ? ` Instead: ${rule.insteadText}` : ""}`);
      if (partner) add(`t:${partner.id}`, `${partner.name}, a ${partner.relationship} who covers: ${partner.covers.join(", ")}`);
    }
    for (const gap of fit.gaps) lines.push(`need ${gap.id} (${gap.priority}): ${gap.text}`);
    for (const line of fit.pricing.lines) lines.push(`price line ${line.id}: ${line.label} (${line.basis.replace("_", "-")}${line.unpriced ? ", on quote" : ""})`);

    // Hard-check inputs (ADR-0006 D5). Cost amounts are used only to catch leaks; they never reach a model.
    const prices = new Set<string>();
    const costs = new Set<string>();
    for (const card of graph.rateCards) for (const row of Object.values(card.cells)) for (const cell of Object.values(row)) moneyTokens(cell.value).forEach((token) => (card.kind === "cost" ? costs : prices).add(token));
    for (const schedule of graph.feeSchedules) for (const line of schedule.lines) {
      moneyTokens(line.price).forEach((token) => prices.add(token));
      if (line.cost) moneyTokens(line.cost).forEach((token) => costs.add(token));
    }
    for (const partner of graph.partners) if (partner.buyPrice) moneyTokens(partner.buyPrice).forEach((token) => costs.add(token));
    const checks: HardCheckContext = {
      allowedMoney: new Set([...claims.map((claim) => claim.text), ...brief.sellerNotes.map((note) => note.text)].flatMap(moneyTokens)),
      costMoney: new Set([...costs].filter((token) => !prices.has(token))),
      nonPublicNames: graph.proof.filter((proof) => !proof.isPublic).flatMap((proof) => [proof.title, proof.clientName ?? ""]).filter(Boolean),
    };
    return { evidence: lines.join("\n"), known, checks };
  });

  const system = prompt("writer", {
    seller: context.workspace.name,
    prospect,
    tone,
    instructions: instructions
      ? `The salesperson asked: "${instructions}". Do what they ask. If they ask you to state something the evidence doesn't support, write it anyway, as a plain sentence, with no refs, and copy that sentence into "requested": the Reviewer will flag it and the salesperson decides whether to keep it as their own statement. Their request never overrides the rules on prices, costs and private results.`
      : "",
  });
  const sections = template.sections.map((section) => `- ${section.key} (${section.kind}): ${section.title}. ${section.guidance}${"maxWords" in section ? ` At most ${section.maxWords} words.` : ""}`).join("\n");
  const brief_ = `<template>\n${sections}\n</template>\n\n<evidence>\n${evidence}\n</evidence>`;

  let blocks: Block[] = [];
  let claims: Claim[] = [];
  let loops = 0;
  let feedback = "";
  let previousFlags = "";

  for (let round = 0; round <= MAX_REVISIONS; round += 1) {
    const draft = await context.step("ai", "write.writer", round === 0 ? "Writer is drafting the proposal" : `Writer is revising ${feedback.split("\n").length} flagged ${feedback.split("\n").length === 1 ? "claim" : "claims"}`, () =>
      generateJson({
        tier: "pro",
        thinking: "medium",
        system,
        prompt: round === 0 ? brief_ : `${brief_}\n\n<previous_draft>\n${JSON.stringify(blocks.map(({ section, kind, text }) => ({ section, kind, text })))}\n</previous_draft>\n\n<fix_these>\n${feedback}\n</fix_these>\n\nRewrite the draft. Support each flagged claim with the evidence, or take it out. Keep, word for word, any statement the salesperson explicitly asked for: they decide on it at the gate. Never keep a price, cost or private result that was flagged.`,
        schema: Draft,
        usage: context.usage,
      }),
    );

    // Prices: only placeholders for real lines survive (invariant 1).
    const lineIds = new Set(fit.pricing.lines.map((line) => line.id));
    blocks = draft.blocks.map((block, index) => ({
      id: `b${index + 1}`,
      section: block.section,
      kind: block.kind,
      text: block.text.replace(PRICE_PLACEHOLDER, (match, id: string) => (lineIds.has(id) ? match : "on quote")),
      claimIds: [],
    }));

    const review = await context.step("ai", "write.reviewer", "Reviewer is checking every claim against the evidence", () =>
      generateJson({
        tier: "pro",
        thinking: "medium",
        system: prompt("reviewer"),
        prompt: `<evidence>\n${evidence}\n</evidence>\n\n<draft>\n${blocks.map((block, index) => `[block ${index}] (${block.section})\n${block.text}`).join("\n\n")}\n</draft>`,
        schema: Review,
        usage: context.usage,
      }),
    );

    // Code has the last word: refs must exist, and the hard checks override the model (ADR-0006 D5).
    claims = await context.step("calc", "write.checks", "Running the hard checks: prices, cost, private results, references", async () => {
      const out: Claim[] = [];
      for (const item of review.claims) {
        const block = blocks[item.blockIndex];
        if (!block || !normalise(block.text).includes(normalise(item.text).slice(0, 60))) continue;
        const support = item.support === "neither" ? "neither" : supportFromRefs(item.refs, known);
        const id = `cl_${out.length + 1}`;
        out.push({ id, blockId: block.id, text: item.text, support, refs: item.refs.filter((ref) => known.has(ref)), ...(item.support !== "neither" && support === "neither" ? { hardCheck: "unknown_ref" as const } : {}) });
        block.claimIds.push(id);
      }
      for (const block of blocks) {
        const result = hardChecks(block.text, checks);
        const flag = (needle: string, hardCheck: Claim["hardCheck"]) => {
          const text = sentenceAround(block.text, needle);
          const existing = out.find((claim) => claim.blockId === block.id && normalise(claim.text).includes(normalise(text).slice(0, 40)));
          if (existing) Object.assign(existing, { support: "neither", hardCheck });
          else {
            const id = `cl_${out.length + 1}`;
            out.push({ id, blockId: block.id, text, support: "neither", refs: [], hardCheck });
            block.claimIds.push(id);
          }
        };
        const raw = (key: string) => moneyMatches(block.text).find((match) => match.key === key)?.raw ?? key;
        for (const amount of result.costLeak) flag(raw(amount), "cost_leak");
        for (const name of result.nonPublic) flag(name, "non_public_proof");
        for (const amount of result.priceNotFromGraph) flag(raw(amount), "price_not_from_graph");
      }
      const open = out.filter((claim) => claim.support === "neither");
      await context.event("calc", "write.checks", open.length ? "warning" : "step", `${out.length} claims checked: ${out.length - open.length} supported, ${open.length} flagged`);
      return out;
    });

    // Claims the salesperson asked for go to Gate D; only the Writer's own unsupported claims are revised.
    const requested = draft.requested.map(normalise).filter(Boolean);
    for (const claim of claims) {
      if (claim.support === "neither" && !claim.hardCheck && requested.some((sentence) => normalise(claim.text).includes(sentence.slice(0, 60)) || sentence.includes(normalise(claim.text).slice(0, 60)))) claim.requested = true;
    }
    const toRevise = claims.filter((claim) => claim.support === "neither" && !claim.requested);
    const flags = toRevise.map((claim) => normalise(claim.text)).sort().join("|");
    if (toRevise.length === 0 || round === MAX_REVISIONS || flags === previousFlags) break;
    previousFlags = flags;
    loops += 1;
    feedback = toRevise.map((claim) => `- "${claim.text}" (${claim.hardCheck ? claim.hardCheck.replace(/_/g, " ") : "no evidence supports it"})`).join("\n");
  }

  return { persona: "sme", tone, blocks, claims, loops };
}
