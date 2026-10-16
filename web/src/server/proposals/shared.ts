import "server-only";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import type { CheckedOperation, FitOutput, Operation, Opportunity } from "@/lib/schema";
import { db } from "@/server/firebase/admin";

/** What a proposal from a message and one from a file share (ADR-0009 D2: one proposal shape). */

export function proposalSummary(proposed: number, dropped: number): string {
  if (proposed === 0) return `Nothing to apply: the checks dropped ${dropped === 1 ? "the change" : `all ${dropped} changes`}. See why below.`;
  const lead = `${proposed === 1 ? "1 change" : `${proposed} changes`} to review. Nothing is saved until you apply ${proposed === 1 ? "it" : "them"}.`;
  return dropped ? `${lead} ${dropped} ${dropped === 1 ? "was" : "were"} dropped by the checks.` : lead;
}

/** The offerings a change lands on, so their pages can show it's pending (FR-ASK-5). */
export function offeringsTouched(op: Operation, graph: WorkspaceGraph): string[] {
  switch (op.kind) {
    case "add_note":
      return op.offeringId ? [op.offeringId] : [];
    case "add_feature":
    case "update_feature":
      return [op.offeringId];
    case "set_price_cell":
      return graph.rateCards.filter((card) => card.id === op.rateCardId).map((card) => card.offeringId);
    case "set_fee_line_price":
    case "add_fee_line":
      return graph.feeSchedules.filter((schedule) => schedule.id === op.feeScheduleId).map((schedule) => schedule.offeringId);
    case "add_proof":
    case "add_constraint":
    case "add_partner":
      return op.offeringIds;
    case "link_document":
      return op.offeringIds;
    case "create_opportunity":
      return [];
  }
}

const CLOSED: Opportunity["status"][] = ["won", "lost", "no_decision"];

/**
 * FR-ASK-6: a price change names the open deals whose approved pricing used
 * the old price. They keep it until someone re-runs pricing.
 */
export async function warnOpenDeals(ws: string, checked: CheckedOperation[]) {
  const priceOps = checked.filter((item) => item.status === "proposed" && (item.op.kind === "set_price_cell" || item.op.kind === "set_fee_line_price"));
  if (priceOps.length === 0) return;
  const snap = await db().collection(`workspaces/${ws}/opportunities`).where("deletedAt", "==", null).get();
  const open = snap.docs
    .map((doc) => doc.data() as Opportunity)
    .filter((opp) => !CLOSED.includes(opp.status) && opp.stages.fit.currentRunId && ["waiting", "approved", "stale"].includes(opp.stages.fit.state));
  const runs = await Promise.all(open.map((opp) => db().doc(`workspaces/${ws}/opportunities/${opp.id}/runs/${opp.stages.fit.currentRunId}`).get()));
  const pricing = runs.map((run) => ((run.get("working") ?? run.get("output")) as FitOutput | null)?.pricing?.lines ?? []);

  for (const item of priceOps) {
    const op = item.op;
    const names = open
      .filter((_, i) =>
        pricing[i].some((line) =>
          op.kind === "set_price_cell"
            ? line.ref.kind === "cell" && line.ref.cardId === op.rateCardId && line.ref.rowId === op.rowId && line.ref.colId === op.colId
            : op.kind === "set_fee_line_price" && line.ref.kind === "fee" && line.ref.scheduleId === op.feeScheduleId && line.ref.lineId === op.lineId,
        ),
      )
      .map((opp) => opp.prospect?.name ?? "a new opportunity");
    if (names.length === 0 || (op.kind !== "set_price_cell" && op.kind !== "set_fee_line_price") || !op.before) continue;
    const n = names.length;
    item.warning = `${n === 1 ? "1 open deal uses" : `${n} open deals use`} the old price: ${names.join(", ")}. ${n === 1 ? "It keeps" : "They keep"} ${op.before} unless you re-run pricing.`;
  }
}
