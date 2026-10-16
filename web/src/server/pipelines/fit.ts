import "server-only";
import { z } from "zod";
import { type PriceSelection, checkSellingRules, computeScore, copyPriceLines, graphOutline, pricingProjection, quantityStated } from "@/lib/deal-room/fit";
import { type BriefOutput, type FitOutput, type IntakeOutput, PriceLineRef } from "@/lib/schema";
import { converseWithTools, generateJson } from "@/server/ai/generate";
import { prompt } from "@/server/prompts";
import type { RunContext } from "./runner";

const FitDraft = z.object({
  gaps: z
    .array(z.object({ id: z.string(), text: z.string().min(1).max(300), priority: z.enum(["high", "medium", "low"]), origin: z.object({ kind: z.enum(["intake", "claim", "note"]), ref: z.string() }) }))
    .max(15),
  mappings: z
    .array(
      z.object({
        gapId: z.string(),
        offeringId: z.string(),
        strength: z.enum(["strong", "partial", "weak"]),
        featureIds: z.array(z.string()),
        proofIds: z.array(z.string()),
        customisation: z.string().max(300).optional(),
      }),
    )
    .max(30),
  cannotMeet: z.array(z.object({ gapId: z.string(), constraintId: z.string(), partnerId: z.string().optional() })).max(15),
});

const Reasons = z.object({ reasons: z.array(z.object({ text: z.string().min(1).max(300), refs: z.array(z.string()) })).length(3) });

const Selection = z.object({
  selections: z.array(z.object({ ref: PriceLineRef, quantity: z.object({ value: z.number().positive(), claimId: z.string() }).optional() })).max(30),
  note: z.string().max(400).optional(),
});

/** Stage 3, Fit and Pricing (FR-FIT-1 to FR-FIT-5; invariants 1, 2, 5, 6). Ends at Gate C. */
export async function fitPipeline(context: RunContext): Promise<FitOutput> {
  const [intake, brief, graph] = await Promise.all([context.upstream<IntakeOutput>("intake"), context.upstream<BriefOutput>("research"), context.graph()]);
  const prospect = intake.prospect;
  if (!prospect) throw new Error("Fit needs a confirmed company");
  const currency = context.workspace.currency;
  const claims = brief.claims.filter((claim) => !claim.removed);
  const outline = graphOutline(graph);

  // FR-FIT-3: selling rules are checked in code before anything is scored.
  const conflicts = await context.step("calc", "fit.rules", "Checking your selling rules", async () => {
    const profile = [prospect.oneLine ?? "", ...claims.filter((claim) => claim.section === "snapshot").map((claim) => claim.text)].join(" ");
    const found = checkSellingRules(graph.constraints, { country: prospect.country, text: profile });
    for (const conflict of found) await context.event("calc", "fit.rules", "warning", `Selling rule: ${conflict.constraint.statement} ${conflict.reason}`);
    return found;
  });

  const sources = [
    ...intake.requirements.map((requirement) => `${requirement.id} (stated need): ${requirement.text}`),
    ...claims.map((claim) => `${claim.id} (research fact): ${claim.text}`),
    ...brief.inferences.map((item) => `${item.id} (inference, ${item.section}): ${item.text}`),
    ...brief.sellerNotes.map((note) => `${note.id} (seller note): ${note.text}`),
  ];
  const draft = await context.step("ai", "fit.analyst", "Fit Analyst is mapping their needs to your offerings", () =>
    generateJson({
      tier: "pro",
      thinking: "medium",
      system: prompt("fit-analyst"),
      prompt: [
        `<prospect>\n${prospect.name}${prospect.website ? ` (${prospect.website})` : ""}${prospect.country ? `, ${prospect.country}` : ""}. ${prospect.oneLine ?? ""}\n</prospect>`,
        `<needs_sources>\n${sources.join("\n")}\n</needs_sources>`,
        `<catalogue>\n${JSON.stringify(outline)}\n</catalogue>`,
        `<rule_conflicts>\n${conflicts.map((conflict) => `${conflict.constraint.id}: ${conflict.constraint.statement} ${conflict.reason}`).join("\n") || "(none)"}\n</rule_conflicts>`,
      ].join("\n\n"),
      schema: FitDraft,
      usage: context.usage,
    }),
  );

  // Code checks every reference the model gave; anything unknown is dropped (ADR-0006 D8).
  const fit = await context.step("calc", "fit.validate", "Checking every reference against your catalogue", async () => {
    const origins = {
      intake: new Set([...intake.requirements.map((requirement) => requirement.id), "prospect"]),
      claim: new Set([...claims.map((claim) => claim.id), ...brief.inferences.map((item) => item.id)]),
      note: new Set(brief.sellerNotes.map((note) => note.id)),
    };
    const offerings = new Map(graph.offerings.map((offering) => [offering.id, offering]));
    const constraints = new Map(graph.constraints.map((rule) => [rule.id, rule]));
    const partners = new Map(graph.partners.map((partner) => [partner.id, partner]));
    const proof = new Map(graph.proof.map((item) => [item.id, item]));

    const idMap = new Map<string, string>();
    const gaps: FitOutput["gaps"] = [];
    for (const gap of draft.gaps) {
      if (!origins[gap.origin.kind].has(gap.origin.ref)) continue;
      const id = `g${gaps.length + 1}`;
      idMap.set(gap.id, id);
      gaps.push({ id, text: gap.text, priority: gap.priority, origin: gap.origin });
    }
    const mappings: FitOutput["mappings"] = draft.mappings.flatMap((mapping) => {
      const gapId = idMap.get(mapping.gapId);
      const offering = offerings.get(mapping.offeringId);
      if (!gapId || !offering) return [];
      const featureIds = new Set(offering.features.map((feature) => feature.id));
      return [
        {
          gapId,
          target: { type: "offering" as const, id: offering.id, rev: offering.rev },
          strength: mapping.strength,
          featureRefs: mapping.featureIds.filter((id) => featureIds.has(id)),
          // Whether a result is public comes from the graph, never from the model (invariant 5).
          proofRefs: mapping.proofIds.flatMap((id) => {
            const item = proof.get(id);
            return item && item.offeringIds.includes(offering.id) ? [{ id: item.id, isPublic: item.isPublic }] : [];
          }),
          ...(mapping.customisation ? { customisation: mapping.customisation } : {}),
        },
      ];
    });
    const cannotMeet: FitOutput["cannotMeet"] = draft.cannotMeet.flatMap((item) => {
      const gapId = idMap.get(item.gapId);
      const rule = constraints.get(item.constraintId);
      if (!gapId || !rule) return [];
      const partner = partners.get(item.partnerId ?? rule.partnerId ?? "");
      return [{ gapId, constraint: { type: "constraint" as const, id: rule.id, rev: rule.rev }, ...(partner ? { partner: { type: "partner" as const, id: partner.id, rev: partner.rev } } : {}) }];
    });
    // Every selling-rule conflict code found is a Cannot meet, whatever the model said, and it caps the score (FR-FIT-4).
    for (const conflict of conflicts) {
      const listed = cannotMeet.filter((item) => item.constraint.id === conflict.constraint.id);
      if (listed.length) {
        for (const item of listed) item.sellingRule = true;
        continue;
      }
      const id = `g${gaps.length + 1}`;
      gaps.unshift({ id, text: `Working with this prospect at all: ${conflict.reason}`, priority: "high", origin: { kind: "intake", ref: "prospect" } });
      cannotMeet.push({ gapId: id, constraint: { type: "constraint", id: conflict.constraint.id, rev: conflict.constraint.rev }, sellingRule: true });
    }
    const dropped = draft.gaps.length + draft.mappings.length + draft.cannotMeet.length - (gaps.length - conflicts.length + mappings.length + cannotMeet.length);
    if (dropped > 0) await context.event("calc", "fit.validate", "warning", `Dropped ${dropped} ${dropped === 1 ? "item" : "items"} that pointed at something not in your catalogue`);
    return { gaps, mappings, cannotMeet };
  });

  const score = await context.step("calc", "fit.score", "Calculating the go/no-go score", async () => computeScore(fit, brief.detectedTech.filter((tech) => tech.matchesSeller).length));

  const reasons = await context.step("ai", "fit.reasons", "Explaining the score", async () => {
    const result = await generateJson({
      tier: "flash",
      system: prompt("fit-reasons"),
      prompt: JSON.stringify({ score, gaps: fit.gaps, mappings: fit.mappings.map(({ gapId, target, strength }) => ({ gapId, offering: graph.offerings.find((offering) => offering.id === target.id)?.name, strength })), cannotMeet: fit.cannotMeet }),
      schema: Reasons,
      usage: context.usage,
    });
    const valid = new Set([...fit.gaps.map((gap) => gap.id), ...fit.cannotMeet.map((item) => item.constraint.id), "coverage", "penalties", "techBonus"]);
    return result.reasons.map((reason) => ({ text: reason.text, refs: reason.refs.filter((ref) => valid.has(ref)) }));
  });

  // Invariant 1: Pricing reads rate cards through function calls and names lines; code copies every price.
  const mapped = [...new Set(fit.mappings.map((mapping) => mapping.target.id))];
  const pricing = await (async () => {
    if (mapped.length === 0) return { lines: [] };
    const conversation = await context.step("ai", "fit.pricing", "Pricing is reading your rate cards", () =>
      converseWithTools({
        tier: "flash",
        system: prompt("pricing"),
        prompt: [
          `Offerings to price: ${mapped.map((id) => `${id} (${graph.offerings.find((offering) => offering.id === id)?.name})`).join(", ")}.`,
          `Prospect: ${prospect.name}. ${prospect.oneLine ?? ""}`,
          `Needs: ${fit.gaps.map((gap) => `${gap.id}: ${gap.text}`).join("; ")}`,
          `Stated needs with numbers: ${intake.requirements.filter((requirement) => /\d/.test(`${requirement.text} ${requirement.sourceLine ?? ""}`)).map((requirement) => `${requirement.id}: ${requirement.text}${requirement.sourceLine ? ` ("${requirement.sourceLine}")` : ""}`).join(" ") || "(none)"}`,
          `Facts with numbers: ${claims.filter((claim) => /\d/.test(claim.text)).map((claim) => `${claim.id}: ${claim.text}`).join(" ") || "(none)"}`,
        ].join("\n"),
        tools: {
          list_pricing: {
            description: "Lists an offering's rate cards (pricing columns, rows and cells) and fee lines, with the references to use.",
            parameters: { type: "object", properties: { offeringId: { type: "string" } }, required: ["offeringId"] },
            handler: (args) => {
              const id = String(args.offeringId ?? "");
              return graph.offerings.some((offering) => offering.id === id) ? pricingProjection(graph, id, currency) : { error: "Unknown offering" };
            },
          },
        },
        onCall: (_name, args) => context.event("ai", "fit.pricing", "step", `Reading the rate cards for ${graph.offerings.find((offering) => offering.id === args.offeringId)?.name ?? "an offering"}`),
        usage: context.usage,
      }),
    );
    const selection = await generateJson({
      tier: "flash",
      system: prompt("pricing"),
      prompt: [...conversation, { role: "user", parts: [{ text: "Now return your selection as JSON." }] }],
      schema: Selection,
      usage: context.usage,
    });
    return context.step("calc", "fit.prices", "Copying prices exactly from your rate cards", async () => {
      // A quantity must cite a stated need or a research fact, and that text must contain the number (FR-FIT-5).
      const quantitySources = new Map([
        ...intake.requirements.map((requirement) => [requirement.id, `${requirement.text} ${requirement.sourceLine ?? ""}`] as const),
        ...claims.map((claim) => [claim.id, claim.text] as const),
      ]);
      let unstated = 0;
      const selections: PriceSelection[] = selection.selections.map((item) => {
        if (!item.quantity) return { ref: item.ref };
        if (quantityStated(item.quantity.value, quantitySources.get(item.quantity.claimId) ?? "")) return { ref: item.ref, quantity: item.quantity };
        unstated += 1;
        return { ref: item.ref };
      });
      if (unstated) await context.event("calc", "fit.prices", "warning", `Left out ${unstated === 1 ? "a quantity" : `${unstated} quantities`} that ${unstated === 1 ? "its source doesn't" : "their sources don't"} state`);
      const copied = copyPriceLines(graph, selections, currency);
      if (copied.rejected.length) await context.event("calc", "fit.prices", "warning", `Ignored ${copied.rejected.length} price ${copied.rejected.length === 1 ? "reference" : "references"} that didn't match your current rate cards`);
      return { lines: copied.lines };
    });
  })();

  return { gaps: fit.gaps, mappings: fit.mappings, cannotMeet: fit.cannotMeet, score, reasons, pricing };
}
