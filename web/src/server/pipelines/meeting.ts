import "server-only";
import { z } from "zod";
import { graphOutline } from "@/lib/deal-room/fit";
import { allowedAmounts, checkMeetingDraft, meetingCatalogue } from "@/lib/deal-room/meeting";
import { type ExampleContext, exampleNotes } from "@/lib/deal-room/meeting-examples";
import { pricingGroups } from "@/lib/deal-room/pricing-groups";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { AuditEvent, type FitOutput, Meeting, type MeetingExample, type Opportunity, type Run } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";

export class MeetingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingError";
  }
}

const Draft = z.object({
  summary: z.string(),
  points: z.array(z.object({ ref: z.string(), kind: z.string(), text: z.string(), quote: z.string() })).max(16),
  steps: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string(),
        detail: z.string(),
        due: z.string(),
        owner: z.string(),
        points: z.array(z.string()),
        refs: z.array(z.string()),
        emailSubject: z.string(),
        emailBody: z.string(),
      }),
    )
    .max(14),
});

/** The offerings a fit map relies on: mapped offerings, and the offerings of mapped features. */
export function proposalOfferings(fit: Pick<FitOutput, "mappings">, graph: Pick<WorkspaceGraph, "offerings">): Set<string> {
  const ids = new Set<string>();
  for (const mapping of fit.mappings) {
    if (mapping.target.type === "offering") ids.add(mapping.target.id);
    if (mapping.target.type === "feature") {
      const owner = graph.offerings.find((offering) => offering.features.some((feature) => feature.id === mapping.target.id));
      if (owner) ids.add(owner.id);
    }
  }
  return ids;
}

type Loaded = { opp: Opportunity; fit: FitOutput; graph: WorkspaceGraph; writeRunId: string };

/** The deal behind a meeting: step F follows a written proposal (PRD 7.25). Reads only the caller's workspace (invariant 7). */
async function load(context: HubContext, opportunityId: string): Promise<Loaded> {
  const ws = context.workspace.id;
  const oppRef = db().doc(`workspaces/${ws}/opportunities/${opportunityId}`);
  const [oppSnap, graph] = await Promise.all([oppRef.get(), getGraphFor(ws)]);
  const opp = oppSnap.data() as Opportunity | undefined;
  if (!opp || opp.deletedAt) throw new MeetingError("This opportunity no longer exists. Reload the page.");
  const writeRunId = opp.stages.write.currentRunId;
  if (!writeRunId || !["waiting", "approved"].includes(opp.stages.write.state)) throw new MeetingError("Write the proposal at Gate D first. The next steps are checked against it.");
  const run = (await oppRef.collection("runs").doc(writeRunId).get()).data() as Run | undefined;
  const fitRunId = run?.inputs.upstreamRunIds.fit ?? opp.stages.fit.currentRunId;
  const fit = fitRunId ? ((await oppRef.collection("runs").doc(fitRunId).get()).get("working") as FitOutput | undefined) : undefined;
  if (!fit) throw new MeetingError("The fit map behind this proposal is missing. Re-run writing.");
  return { opp, fit, graph, writeRunId };
}

/** FR-MEET-1: the deal's own example notes, built by code (ADR-0016 D5). No AI run. */
export async function meetingExamples(context: HubContext, opportunityId: string): Promise<Record<MeetingExample, string>> {
  const { opp, fit, graph } = await load(context, opportunityId);
  const inProposal = proposalOfferings(fit, graph);
  const offerings = graph.offerings.filter((offering) => inProposal.has(offering.id) && offering.status !== "retired");
  const demoOffering = offerings.find((offering) => offering.features.some((feature) => feature.status === "active")) ?? offerings[0];
  const demoFeature = demoOffering?.features.find((feature) => feature.status === "active");
  // A need outside scope, with the partner that covers it when the hub has one: the fit map's own first, then a
  // scope limit of an offering in the proposal, then any scope limit with a partner, then any gap outside scope.
  const partnerName = (id?: string) => (id ? graph.partners.find((partner) => partner.id === id)?.name : undefined);
  const gapText = (id: string) => fit.gaps.find((gap) => gap.id === id)?.text;
  const cannotWithPartner = fit.cannotMeet.find((item) => item.partner && !item.sellingRule && gapText(item.gapId));
  const scopes = graph.constraints.filter((rule) => rule.offeringIds.length > 0 && rule.partnerId && partnerName(rule.partnerId));
  const scope = scopes.find((rule) => rule.offeringIds.some((id) => inProposal.has(id))) ?? scopes[0];
  const cannot = fit.cannotMeet.find((item) => !item.sellingRule && gapText(item.gapId));
  const outside: ExampleContext["outside"] = cannotWithPartner
    ? { need: gapText(cannotWithPartner.gapId)!, partner: partnerName(cannotWithPartner.partner?.id) }
    : scope
      ? { need: scope.statement, partner: partnerName(scope.partnerId) }
      : cannot
        ? { need: gapText(cannot.gapId)! }
        : undefined;
  const extra = graph.offerings.find((offering) => !inProposal.has(offering.id) && !offering.parentId && offering.status === "active")?.name;
  return exampleNotes({
    prospect: opp.prospect?.name ?? "the prospect",
    ...(opp.contact ? { contact: { name: opp.contact.name, ...(opp.contact.role ? { role: opp.contact.role } : {}) } } : {}),
    presenter: context.user.name,
    offerings: offerings.map((offering) => offering.name),
    ...(demoOffering ? { demo: { offering: demoOffering.name, feature: demoFeature?.name ?? demoOffering.name } } : {}),
    ...(outside ? { outside } : {}),
    ...(extra ? { extra } : {}),
    today: new Date(),
  });
}

/**
 * After the meeting (PRD 7.25, ADR-0016 D4). Pro reads the notes with the
 * proposal's needs, its approved pricing and a catalogue of confirmed hub
 * entities (no cost, no contact details), and writes what they said and the
 * next steps. Code checks every quote, step, reference and email
 * (lib/deal-room/meeting). One AI run against the daily cap.
 */
export async function planMeeting(context: HubContext, opportunityId: string, input: { notes: string; heldOn: string; example: MeetingExample | null }): Promise<Meeting> {
  const ws = context.workspace.id;
  const { opp, fit, graph, writeRunId } = await load(context, opportunityId);
  try {
    await chargeAiRun(ws);
  } catch (err) {
    if (err instanceof UsageError) throw new MeetingError(err.message);
    throw err;
  }

  const prospect = opp.prospect?.name ?? "the prospect";
  const inProposal = proposalOfferings(fit, graph);
  const contacts = new Map(
    graph.partners.flatMap((partner) => {
      const contact = partner.contacts[0];
      return contact ? [[partner.id, { name: contact.name, ...(contact.email ? { email: contact.email } : {}) }] as const] : [];
    }),
  );
  const catalogue = meetingCatalogue(graphOutline(graph), inProposal, contacts);
  const groups = pricingGroups(fit.pricing.lines);
  const pricingText = groups.flatMap((group) => [
    `${group.title}${group.subtotal ? ` (subtotal ${group.subtotal})` : ""}:`,
    ...group.lines.map((line) => `- ${line.label}: ${line.unpriced ? "on quote" : line.total ? `${line.valueText} (${line.total})` : line.valueText}`),
  ]);
  const outsideIds = new Set(fit.cannotMeet.map((item) => item.gapId));
  const needs = fit.gaps.map((gap) => `- ${gap.text}${outsideIds.has(gap.id) ? " [outside what we offer]" : ""}`);

  const draft = await generateJson({
    tier: "pro",
    system: prompt("meeting-plan", { sender: context.user.name, seller: context.workspace.name, prospect }),
    prompt: [
      `<proposal>\nThe client's needs in the proposal:\n${needs.join("\n") || "(none recorded)"}\n</proposal>`,
      `<pricing>\n${pricingText.join("\n") || "(no priced lines)"}\n</pricing>`,
      `<catalogue>\n${[...catalogue.entries()].map(([ref, entry]) => `${ref}: ${entry.line}`).join("\n")}\n</catalogue>`,
      `<meeting>\nHeld on ${input.heldOn}. Client contact: ${opp.contact ? `${opp.contact.name}${opp.contact.role ? `, ${opp.contact.role}` : ""}` : "not recorded"}.\n</meeting>`,
      `<notes>\n${input.notes}\n</notes>`,
    ].join("\n\n"),
    schema: Draft,
  });

  const allowed = allowedAmounts([input.notes, ...fit.pricing.lines.flatMap((line) => [line.valueText, line.total ?? ""]), ...groups.map((group) => group.subtotal ?? "")]);
  const client = opp.contact ? { name: opp.contact.name, ...(opp.contact.email ? { email: opp.contact.email } : {}) } : undefined;
  const checked = checkMeetingDraft(draft, { notes: input.notes, catalogue, allowed, ...(client ? { client } : {}) });
  const ref = db().collection(`workspaces/${ws}/opportunities/${opportunityId}/meetings`).doc();
  const now = new Date().toISOString();
  const meeting = Meeting.parse({ id: ref.id, heldOn: input.heldOn, notes: input.notes, example: input.example, ...checked, writeRunId, createdAt: now, createdBy: context.user.name });

  const batch = db().batch();
  batch.set(ref, JSON.parse(JSON.stringify(meeting)));
  batch.set(
    db().collection(`workspaces/${ws}/auditEvents`).doc(),
    AuditEvent.parse({ action: "generate", entity: "meeting", entityId: ref.id, summary: `FlowHub planned ${checked.steps.length} next steps from the meeting with ${prospect}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return meeting;
}
