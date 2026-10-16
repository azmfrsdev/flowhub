import "server-only";
import { answerLines, copyHandlePrice, fillPrices, resolveCites, typedMoney } from "@/lib/ask/answer";
import { AskOrTellOutput, askOutline, toOperations } from "@/lib/ask/outline";
import { type WorkspaceGraph, malaysiaDay } from "@/lib/offerings/view";
import { Answer, AuditEvent, type CheckedOperation, Proposal, type Workspace } from "@/lib/schema";
import { generateJson, newUsage } from "@/server/ai/generate";
import { MODELS } from "@/server/ai/models";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import { offeringsTouched, proposalSummary, warnOpenDeals } from "@/server/proposals/shared";
import { costTokens, validateOperations } from "@/server/proposals/validate";
import type { HubContext } from "@/server/workspace/access";
import { CAPS } from "@/server/workspace/caps";

/**
 * Ask or tell (ADR-0009 D2, PRD 7.17). Called straight from a server action,
 * not through Cloud Tasks: one Flash call returns in seconds. Like every
 * pipeline it reads its inputs from Firestore, writes its result back, and
 * keeps nothing in memory (invariant 8).
 *
 *  1. Ask or tell (ai): one Flash call reads the message against a cost-free,
 *     price-free outline and returns typed changes, or an answer naming lines.
 *  2. Check changes (calc): code maps the changes onto operations and the
 *     validator drops anything unknown, stale, costed or not in the message.
 *  3. Copy prices (calc): for answers, code copies each price and does the sums.
 */

export class AskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskError";
  }
}

export type AskResult = { kind: "proposal" | "answer"; id: string };

/** What reading one message produces, before anything is stored: checked changes, or an answer. */
export type MessageResult =
  | { kind: "proposal"; operations: CheckedOperation[]; summary: string; offeringIds: string[]; scopeOfferingId?: string }
  | { kind: "answer"; answer: Omit<Answer, "id" | "workspaceId" | "createdBy" | "createdAt"> };

/**
 * Steps 1 to 3 for one message: the model reads it against the outline, and
 * code checks the changes or copies the prices. No storage, so the eval runs
 * it against a sample catalogue in memory (ADR-0010 D5).
 */
export async function readMessage(input: {
  graph: WorkspaceGraph;
  workspace: Pick<Workspace, "name" | "currency">;
  text: string;
  scopeOfferingId?: string;
  proposalId: string;
  day?: string;
}): Promise<MessageResult> {
  const { graph, text } = input;
  const day = input.day ?? malaysiaDay();
  const currency = input.workspace.currency;
  const { outline, handles } = askOutline(graph);
  const scope = input.scopeOfferingId ? outline.offerings.find((offering) => offering.id === input.scopeOfferingId) : undefined;

  const result = await generateJson({
    tier: "flash",
    system: prompt("ask-or-tell"),
    prompt: JSON.stringify({
      today: day,
      seller: input.workspace.name,
      currency,
      openedFrom: scope ? { offeringId: scope.id, name: scope.name } : null,
      hub: outline,
      message: text,
    }),
    schema: AskOrTellOutput,
    thinking: "low",
    usage: newUsage(),
  });
  const costs = costTokens(graph);

  if (result.intent === "tell" && result.changes.length > 0) {
    let n = 0;
    const checked = validateOperations({
      operations: toOperations(result.changes, handles, graph),
      graph,
      sourceText: text,
      source: { proposalId: input.proposalId, locator: {}, quote: text.slice(0, 400) },
      requireEvidenceInSource: true,
      newId: () => `op_${++n}`,
    });
    const proposed = checked.filter((item) => item.status === "proposed").length;
    return {
      kind: "proposal",
      operations: checked,
      summary: proposalSummary(proposed, checked.length - proposed),
      offeringIds: [...new Set(checked.flatMap((item) => offeringsTouched(item.op, graph)))],
      ...(scope ? { scopeOfferingId: scope.id } : {}),
    };
  }

  const fallbackFor = { tell: "I couldn't find anything in the hub to change from that. Try naming the offering or the price line.", unclear: "Could you say a bit more? Tell me what changed, or ask about what you sell.", ask: "" };
  let reply: string;
  let lines: ReturnType<typeof answerLines> = { lines: [], unknown: [] };
  if (result.intent === "ask") {
    lines = answerLines(result.priceLines, handles, graph, currency, day);
    const valueFor = (ref: string) => lines.lines.find((line) => line.ref === ref)?.valueText ?? (handles[ref] ? (copyHandlePrice(handles[ref], graph, day) ?? "Not offered") : null);
    reply = typedMoney(result.reply, text, costs)
      ? lines.lines.length
        ? "Here's what your price list says."
        : "The answer named an amount that isn't in the hub, so FlowHub held it back."
      : fillPrices(result.reply, valueFor);
    if (lines.unknown.length) reply += ` ${lines.unknown.length === 1 ? "One price line it named doesn't exist, so it's left out." : "Some price lines it named don't exist, so they're left out."}`;
  } else {
    reply = typedMoney(result.reply, text, costs) || !result.reply.trim() ? fallbackFor[result.intent] : result.reply;
  }
  return {
    kind: "answer",
    answer: {
      kind: result.intent === "ask" ? "answer" : result.intent === "tell" ? "no_change" : "unclear",
      question: text,
      ...(scope ? { scopeOfferingId: scope.id } : {}),
      text: reply,
      lines: lines.lines,
      ...(lines.total ? { total: lines.total } : {}),
      cites: result.intent === "ask" ? resolveCites(result.cites, graph) : [],
      notInHub: result.intent === "ask" && result.notInHub,
      model: MODELS.flash,
    },
  };
}

export async function askOrTell(context: HubContext, input: { text: string; scopeOfferingId?: string }): Promise<AskResult> {
  const ws = context.workspace.id;
  await countMessage(ws);
  const graph = await getGraphFor(ws);
  const base = db().collection("workspaces").doc(ws);
  const proposalRef = base.collection("proposals").doc();
  const read = await readMessage({ graph, workspace: context.workspace, text: input.text, scopeOfferingId: input.scopeOfferingId, proposalId: proposalRef.id });
  const now = new Date().toISOString();

  if (read.kind === "proposal") {
    await warnOpenDeals(ws, read.operations);
    const proposed = read.operations.filter((item) => item.status === "proposed").length;
    const proposal = Proposal.parse({
      id: proposalRef.id,
      workspaceId: ws,
      via: "message",
      input: { text: input.text },
      ...(read.scopeOfferingId ? { scopeOfferingId: read.scopeOfferingId } : {}),
      offeringIds: read.offeringIds,
      operations: read.operations,
      summary: read.summary,
      status: proposed > 0 ? "proposed" : "discarded",
      createdBy: context.user.name,
      createdAt: now,
      model: MODELS.flash,
    });
    const batch = db().batch();
    batch.set(proposalRef, JSON.parse(JSON.stringify(proposal)));
    batch.set(
      base.collection("auditEvents").doc(),
      AuditEvent.parse({ action: "generate", entity: "proposal", entityId: proposalRef.id, summary: `FlowHub proposed ${proposed === 1 ? "1 change" : `${proposed} changes`} from a message.`, by: context.user.uid, byName: context.user.name, at: now }),
    );
    await batch.commit();
    return { kind: "proposal", id: proposalRef.id };
  }

  const ref = base.collection("answers").doc();
  const answer = Answer.parse({ ...read.answer, id: ref.id, workspaceId: ws, createdBy: context.user.name, createdAt: now });
  await ref.set(JSON.parse(JSON.stringify(answer)));
  return { kind: "answer", id: ref.id };
}

/** FR-CAP-1, FR-CAP-2: the kill switch and the daily message cap, counted before the model is called. */
async function countMessage(ws: string) {
  const usageRef = db().doc(`workspaces/${ws}/usage/${malaysiaDay()}`);
  const flagsRef = db().doc("system/flags");
  await db().runTransaction(async (tx) => {
    const [usage, flags] = await Promise.all([tx.get(usageRef), tx.get(flagsRef)]);
    if (flags.exists && flags.get("agentsEnabled") === false) throw new AskError("The agents are paused for now. Try again later.");
    const used = Number(usage.get("askRuns") ?? 0);
    if (used >= CAPS.askRuns) throw new AskError(`Today's limit of ${CAPS.askRuns} messages is used up. It resets at midnight, Malaysia time.`);
    tx.set(usageRef, { askRuns: used + 1 }, { merge: true });
  });
}
