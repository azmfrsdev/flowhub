import "server-only";
import type { DocumentData } from "firebase-admin/firestore";
import { z } from "zod";
import { malaysiaDay } from "@/lib/offerings/view";
import {
  type AppliedChange,
  AuditEvent,
  type CheckedOperation,
  FeeSchedule,
  Feature,
  Note,
  Offering,
  Operation,
  Opportunity,
  type PriceCell,
  Proposal,
  RateCard,
  type SourceRef,
} from "@/lib/schema";
import { StageError, startStage } from "@/server/deal-room/runs";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { ConflictError, type GraphCollection, GoneError, createEntity, editEntity, softDeleteEntity } from "@/server/graph/write";
import type { HubContext } from "@/server/workspace/access";
import { validateOperations } from "./validate";

/**
 * Apply, Edit, Discard and Undo for Ask or tell proposals (FR-ASK-4,
 * ADR-0009 D2). Nothing in the hub changes until Apply. Apply re-checks every
 * included change against the hub as it is now, then makes each one with the
 * same writers hand edits use, recording that it came from a message or a file, who
 * applied it and when. Undo puts back exactly what Apply changed, unless
 * someone has changed it since.
 */

export class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalError";
  }
}

const proposalRef = (ws: string, id: string) => db().doc(`workspaces/${ws}/proposals/${id}`);
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const shortDay = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** Re-runs the code checks on stored changes, keeping their IDs and sources. Person-edited values vouch for themselves. */
function recheck(proposal: Proposal, items: CheckedOperation[], graph: Awaited<ReturnType<typeof getGraphFor>>): Map<string, CheckedOperation> {
  const checked = validateOperations({
    operations: items.map((item) => item.op),
    graph,
    sourceText: proposal.input.text ?? "",
    source: { proposalId: proposal.id, locator: {} },
    requireEvidenceInSource: proposal.via === "message",
    // A person's edit vouches for the values they typed. A file's prices were checked against the
    // page they cite when it was read, and the stored file never changes, so they aren't re-read here.
    personEdited: new Set(items.filter((item) => item.editedBy || proposal.via === "document").map((item) => item.op.id)),
    keepIds: true,
    newId: () => `op_${Math.random().toString(36).slice(2, 8)}`,
  });
  return new Map(checked.map((result, i) => [items[i].op.id, { ...items[i], status: result.status, dropReason: result.dropReason, path: result.path, href: result.href ?? items[i].href }]));
}

/* ---------- Apply ---------- */

type ApplyState = { revs: Map<string, number>; day: string; opportunityId?: string };

export async function applyProposal(context: HubContext, proposalId: string): Promise<{ applied: number; dropped: number; opportunityId?: string }> {
  const ws = context.workspace.id;
  const ref = proposalRef(ws, proposalId);
  // Claim it first, so a second click can't apply the same changes twice.
  const proposal = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProposalError("This proposal no longer exists.");
    const current = Proposal.parse(snap.data());
    if (current.status !== "proposed") throw new ProposalError("This proposal was already applied or discarded.");
    const claimed = snap.get("applyingAt") as string | undefined;
    if (claimed && Date.now() - new Date(claimed).getTime() < 120_000) throw new ProposalError("It's being applied already.");
    tx.update(ref, { applyingAt: new Date().toISOString() });
    return current;
  });

  try {
    const graph = await getGraphFor(ws);
    const included = proposal.operations.filter((item) => item.status === "proposed");
    if (included.length === 0) throw new ProposalError("Nothing is left to apply.");
    const checked = recheck(proposal, included, graph);
    const state: ApplyState = { revs: new Map(), day: malaysiaDay() };
    // A new opportunity goes first, so a note can link to it.
    const order = [...included].sort((a, b) => Number(b.op.kind === "create_opportunity") - Number(a.op.kind === "create_opportunity"));
    const results = new Map<string, CheckedOperation>();
    for (const item of order) {
      const current = checked.get(item.op.id)!;
      if (current.status === "dropped") {
        results.set(item.op.id, current);
        continue;
      }
      try {
        const outcome = await applyOne(context, proposal, current, state);
        results.set(item.op.id, { ...current, status: "applied", applied: outcome.applied, ...(outcome.href ? { href: outcome.href } : {}) });
      } catch (err) {
        if (!(err instanceof ConflictError || err instanceof GoneError)) throw err;
        results.set(item.op.id, { ...current, status: "dropped", dropReason: err instanceof ConflictError ? "It changed since FlowHub read it. Ask again." : "What it points at no longer exists." });
      }
    }

    const operations = proposal.operations.map((item) => results.get(item.op.id) ?? item);
    const applied = operations.filter((item) => item.status === "applied").length;
    const left = operations.filter((item) => item.status === "discarded").length;
    const now = new Date().toISOString();
    const next = Proposal.parse({
      ...proposal,
      operations,
      status: applied === 0 ? "discarded" : left > 0 || applied < included.length ? "partially_applied" : "applied",
      ...(applied ? { appliedBy: context.user.name, appliedAt: now } : {}),
    });
    await ref.set(plain(next));
    await syncDocument(context, next);
    return { applied, dropped: included.length - applied, ...(state.opportunityId ? { opportunityId: state.opportunityId } : {}) };
  } catch (err) {
    await ref.update({ applyingAt: null }).catch(() => undefined);
    throw err;
  }
}

async function applyOne(context: HubContext, proposal: Proposal, item: CheckedOperation, state: ApplyState): Promise<{ applied: AppliedChange; href?: string }> {
  const op = item.op;
  const ws = context.workspace.id;
  const now = new Date().toISOString();
  const by = context.user.name;
  const provenance = { via: proposal.via, proposalId: proposal.id, confirmedBy: by, confirmedAt: now };
  // A file's change keeps its page (and the quote, if the page contains it); a message's keeps the words it rests on.
  const sources: SourceRef[] = proposal.via === "document" ? [item.source] : [{ proposalId: proposal.id, locator: {}, quote: op.evidence.slice(0, 400) }];
  const from = proposal.via === "document" ? `from ${proposal.input.fileName ?? "a file"}` : "from a message";
  const record = (collection: AppliedChange["collection"], id: string, rev: number | null, extra: Partial<AppliedChange> = {}): AppliedChange => ({ collection, id, rev, at: now, by, ...extra });
  const edit = async (collection: GraphCollection, id: string, expectedRev: number | null, change: (current: DocumentData) => { patch: DocumentData; summary: string }) => {
    const key = `${collection}/${id}`;
    const expected = state.revs.get(key) ?? expectedRev;
    const result = await editEntity(context, collection, id, expected, change);
    state.revs.set(key, result.rev);
    return result.rev;
  };
  const newId = (prefix: string) => `${prefix}_${db().collection("_").doc().id.slice(0, 10)}`;

  switch (op.kind) {
    case "set_price_cell": {
      let before = "null";
      const rev = await edit("rateCards", op.rateCardId, op.expectedRev, (current) => {
        const card = RateCard.parse(current);
        const row = card.rows.find((item) => item.id === op.rowId)!;
        const column = card.columns.find((item) => item.id === op.colId)!;
        const cell = card.cells[op.rowId]?.[op.colId];
        before = JSON.stringify(cell ?? null);
        // A start date in the future schedules the price; until then the old one stays in use (FR-ASK-6).
        const scheduled = Boolean(cell && op.effectiveFrom && op.effectiveFrom > state.day);
        const next: PriceCell = scheduled
          ? { ...cell!, next: { value: op.after, from: op.effectiveFrom! }, sources: [...cell!.sources, ...sources] }
          : { value: op.after, ...(cell?.next ? { next: cell.next } : {}), sources };
        const cells = { ...card.cells, [op.rowId]: { ...card.cells[op.rowId], [op.colId]: next } };
        const where = `${row.label}, ${column.label} on ${card.name}`;
        const summary = scheduled
          ? `Scheduled ${where} to go from ${cell!.value} to ${op.after} on ${shortDay(op.effectiveFrom!)}, ${from}.`
          : `Changed ${where}${cell ? ` from ${cell.value}` : ""} to ${op.after}, ${from}.`;
        return { patch: { cells: plain(cells) }, summary };
      });
      return { applied: record("rateCards", op.rateCardId, rev, { before }) };
    }
    case "set_fee_line_price": {
      let before = "null";
      const rev = await edit("feeSchedules", op.feeScheduleId, op.expectedRev, (current) => {
        const schedule = FeeSchedule.parse(current);
        const line = schedule.lines.find((item) => item.id === op.lineId)!;
        before = JSON.stringify({ price: line.price, next: line.next ?? null });
        const scheduled = Boolean(op.effectiveFrom && op.effectiveFrom > state.day);
        const lines = schedule.lines.map((item) =>
          item.id !== op.lineId
            ? item
            : scheduled
              ? { ...item, next: { value: op.after, from: op.effectiveFrom! }, sources: [...item.sources, ...sources] }
              : { ...item, price: op.after, sources: [...item.sources, ...sources] },
        );
        const summary = scheduled
          ? `Scheduled ${line.label} on ${schedule.name} to go from ${line.price} to ${op.after} on ${shortDay(op.effectiveFrom!)}, ${from}.`
          : `Changed ${line.label} on ${schedule.name} from ${line.price} to ${op.after}, ${from}.`;
        return { patch: { lines: plain(lines) }, summary };
      });
      return { applied: record("feeSchedules", op.feeScheduleId, rev, { before }) };
    }
    case "add_fee_line": {
      const lineId = newId("fl");
      const rev = await edit("feeSchedules", op.feeScheduleId, op.expectedRev, (current) => {
        const schedule = FeeSchedule.parse(current);
        const lines = [...schedule.lines, { id: lineId, label: op.label, basis: op.basis, price: op.price, sources }];
        return { patch: { lines: plain(lines) }, summary: `Added ${op.label} at ${op.price} to ${schedule.name}, ${from}.` };
      });
      return { applied: record("feeSchedules", op.feeScheduleId, rev, { createdId: lineId }) };
    }
    case "add_feature": {
      const featureId = newId("f");
      const rev = await edit("offerings", op.offeringId, null, (current) => {
        const offering = Offering.parse(current);
        const feature = Feature.parse({ id: featureId, name: op.name, description: op.description, status: "active", sources, provenance });
        return { patch: { features: plain([...offering.features, feature]) }, summary: `Added ${op.name} to the scope of ${offering.name}, ${from}.` };
      });
      return { applied: record("offerings", op.offeringId, rev, { createdId: featureId }) };
    }
    case "update_feature": {
      let before = "null";
      const rev = await edit("offerings", op.offeringId, op.expectedRev, (current) => {
        const offering = Offering.parse(current);
        const feature = offering.features.find((item) => item.id === op.featureId)!;
        before = JSON.stringify({ name: feature.name, description: feature.description });
        const features = offering.features.map((item) =>
          item.id === op.featureId ? { ...item, name: op.name ?? item.name, description: op.description ?? item.description, sources: [...item.sources, ...sources], provenance } : item,
        );
        return { patch: { features: plain(features) }, summary: `Updated ${feature.name} in the scope of ${offering.name}, ${from}.` };
      });
      return { applied: record("offerings", op.offeringId, rev, { createdId: op.featureId, before }) };
    }
    case "add_note": {
      const base = db().collection("workspaces").doc(ws);
      const noteRef = base.collection("notes").doc();
      const opportunityId = op.opportunityRef === "new_opportunity" ? state.opportunityId : undefined;
      const offering = op.offeringId ? await base.collection("offerings").doc(op.offeringId).get() : null;
      if (offering && (!offering.exists || offering.get("deletedAt"))) throw new GoneError();
      const note = Note.parse({
        id: noteRef.id,
        workspaceId: ws,
        ...(op.offeringId ? { offeringId: op.offeringId } : {}),
        ...(opportunityId ? { opportunityId } : {}),
        text: op.text,
        pinned: false,
        by: context.user.uid,
        byName: by,
        at: now,
        provenance,
        deletedAt: null,
      });
      const batch = db().batch();
      batch.set(noteRef, plain(note));
      batch.set(
        base.collection("auditEvents").doc(),
        AuditEvent.parse({ action: "create", entity: "note", entityId: noteRef.id, summary: `Added a note${offering ? ` to ${offering.get("name")}` : ""}, ${from}.`, by: context.user.uid, byName: by, at: now }),
      );
      await batch.commit();
      return { applied: record("notes", noteRef.id, null) };
    }
    case "add_proof": {
      const id = await createEntity(context, "proof", { kind: op.proofKind, title: op.title, body: op.body, isPublic: op.isPublic, offeringIds: op.offeringIds }, `Added the result "${op.title}", ${from}.`, { provenance, sources });
      return { applied: record("proof", id, 1) };
    }
    case "add_constraint": {
      const fields = { kind: op.constraintKind, statement: op.statement, values: op.values, offeringIds: op.offeringIds, ...(op.insteadText ? { insteadText: op.insteadText } : {}) };
      const id = await createEntity(context, "constraints", fields, op.offeringIds.length ? `Added the exclusion: ${op.statement}, ${from}.` : `Added a selling rule: ${op.statement}, ${from}.`, { provenance, sources });
      return { applied: record("constraints", id, 1) };
    }
    case "add_partner": {
      const id = await createEntity(context, "partners", { name: op.name, relationship: op.relationship, covers: op.covers, contacts: op.contacts, technology: [] }, `Added the ${op.relationship} ${op.name}, ${from}.`, { provenance, sources });
      for (const offeringId of op.offeringIds) {
        await edit("offerings", offeringId, null, (current) => {
          const offering = Offering.parse(current);
          return { patch: { partnerIds: [...new Set([...offering.partnerIds, id])] }, summary: `Linked ${op.name} to ${offering.name}.` };
        });
      }
      return { applied: record("partners", id, 1) };
    }
    case "link_document": {
      const docRef = db().doc(`workspaces/${ws}/documents/${op.documentId}`);
      let before = "[]";
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) throw new GoneError();
        const current = (snap.get("offeringIds") as string[] | undefined) ?? [];
        before = JSON.stringify(current);
        tx.update(docRef, { offeringIds: [...new Set([...current, ...op.offeringIds])] });
        tx.set(
          db().collection(`workspaces/${ws}/auditEvents`).doc(),
          AuditEvent.parse({ action: "update", entity: "document", entityId: op.documentId, summary: `Filed ${snap.get("name")} under more offerings.`, by: context.user.uid, byName: by, at: now }),
        );
      });
      return { applied: record("documents", op.documentId, null, { before }) };
    }
    case "create_opportunity": {
      const base = db().collection("workspaces").doc(ws);
      const oppRef = base.collection("opportunities").doc();
      const website = op.website ? (/^https?:\/\//i.test(op.website) ? op.website : `https://${op.website}`) : undefined;
      const idle = { state: "idle" as const, currentRunId: null, updatedAt: now };
      const opportunity = Opportunity.parse({
        id: oppRef.id,
        workspaceId: ws,
        prospect: { name: op.prospectName, ...(website ? { website } : {}) },
        ...(op.contact ? { contact: op.contact } : {}),
        persona: context.workspace.persona,
        intakeType: "told",
        source: "Told to FlowHub",
        interestedOfferingIds: op.interestedOfferingIds,
        ...(op.nextMeeting ? { nextMeeting: op.nextMeeting } : {}),
        status: "new",
        inputs: [{ kind: "text", text: proposal.input.text ?? op.evidence }, ...(website ? [{ kind: "url", url: website }] : []), { kind: "proposal", proposalId: proposal.id }],
        stages: { intake: idle, research: idle, fit: idle, write: idle },
        rev: 0,
        createdAt: now,
        createdBy: by,
        updatedAt: now,
      });
      const batch = db().batch();
      batch.set(oppRef, plain(opportunity));
      batch.set(
        base.collection("auditEvents").doc(),
        AuditEvent.parse({ action: "create", entity: "opportunity", entityId: oppRef.id, summary: `Added ${op.prospectName} as a new opportunity, told to FlowHub.`, by: context.user.uid, byName: by, at: now }),
      );
      await batch.commit();
      state.opportunityId = oppRef.id;
      // FR-ASK-7: intake reads the message and stops at Gate A, so research never starts on an unconfirmed company.
      try {
        await startStage(context, oppRef.id, "intake");
      } catch (err) {
        if (!(err instanceof StageError)) throw err;
      }
      return { applied: record("opportunities", oppRef.id, null), href: `/opportunities/${oppRef.id}` };
    }
  }
}

/* ---------- Undo ---------- */

export async function undoProposal(context: HubContext, proposalId: string): Promise<{ undone: number; kept: string[] }> {
  const ws = context.workspace.id;
  const ref = proposalRef(ws, proposalId);
  const snap = await ref.get();
  if (!snap.exists) throw new ProposalError("This proposal no longer exists.");
  const proposal = Proposal.parse(snap.data());
  if (proposal.status !== "applied" && proposal.status !== "partially_applied") throw new ProposalError("There's nothing to undo.");

  const revs = new Map<string, number>();
  const kept: string[] = [];
  const reverted = new Set<string>();
  const appliedOps = proposal.operations.filter((item) => item.status === "applied" && item.applied).reverse();
  for (const item of appliedOps) {
    try {
      await undoOne(context, item, revs);
      reverted.add(item.op.id);
    } catch (err) {
      if (!(err instanceof ConflictError || err instanceof GoneError)) throw err;
      kept.push(item.path);
    }
  }

  // Undone changes are pending again. Their revisions move to where Undo left each document, so Apply works a second time.
  const operations = proposal.operations.map((item) => {
    if (!reverted.has(item.op.id) || !item.applied) return item;
    const rev = revs.get(`${item.applied.collection}/${item.applied.id}`);
    const op = rev !== undefined && "expectedRev" in item.op ? { ...item.op, expectedRev: rev } : item.op;
    const reset: CheckedOperation = { ...item, op: Operation.parse(op), status: "proposed", ...(item.op.kind === "create_opportunity" ? { href: "/opportunities" } : {}) };
    delete reset.applied;
    return reset;
  });
  const stillApplied = operations.some((item) => item.status === "applied");
  const next = Proposal.parse({ ...proposal, operations, status: stillApplied ? "partially_applied" : "proposed" });
  if (!stillApplied) {
    delete next.appliedBy;
    delete next.appliedAt;
  }
  await ref.set(plain(next));
  await syncDocument(context, next);
  return { undone: reverted.size, kept };
}

async function undoOne(context: HubContext, item: CheckedOperation, revs: Map<string, number>) {
  const applied = item.applied!;
  const op = item.op;
  const ws = context.workspace.id;
  const now = new Date().toISOString();
  const key = `${applied.collection}/${applied.id}`;
  const edit = async (collection: GraphCollection, checkRev: boolean, change: (current: DocumentData) => { patch: DocumentData; summary: string }) => {
    const result = await editEntity(context, collection, applied.id, checkRev ? (revs.get(key) ?? applied.rev) : null, change);
    revs.set(key, result.rev);
  };

  switch (op.kind) {
    case "set_price_cell":
      return edit("rateCards", true, (current) => {
        const card = RateCard.parse(current);
        const before = JSON.parse(applied.before ?? "null") as PriceCell | null;
        const row = { ...card.cells[op.rowId] };
        if (before) row[op.colId] = before;
        else delete row[op.colId];
        return { patch: { cells: plain({ ...card.cells, [op.rowId]: row }) }, summary: `Undid a price change on ${card.name}${before ? `: back to ${before.value}` : ""}.` };
      });
    case "set_fee_line_price":
      return edit("feeSchedules", true, (current) => {
        const schedule = FeeSchedule.parse(current);
        const before = JSON.parse(applied.before ?? "null") as { price: string; next: PriceCell["next"] | null } | null;
        if (!before) throw new GoneError();
        const lines = schedule.lines.map((line) => {
          if (line.id !== op.lineId) return line;
          const restored = { ...line, price: before.price, next: before.next ?? undefined };
          if (!restored.next) delete restored.next;
          return restored;
        });
        return { patch: { lines: plain(lines) }, summary: `Undid a price change on ${schedule.name}: back to ${before.price}.` };
      });
    case "add_fee_line":
      return edit("feeSchedules", true, (current) => {
        const schedule = FeeSchedule.parse(current);
        return { patch: { lines: plain(schedule.lines.filter((line) => line.id !== applied.createdId)) }, summary: `Undid adding ${op.label} to ${schedule.name}.` };
      });
    case "add_feature":
      return edit("offerings", false, (current) => {
        const offering = Offering.parse(current);
        return { patch: { features: plain(offering.features.filter((feature) => feature.id !== applied.createdId)) }, summary: `Undid adding ${op.name} to the scope of ${offering.name}.` };
      });
    case "update_feature":
      return edit("offerings", true, (current) => {
        const offering = Offering.parse(current);
        const before = z.object({ name: z.string(), description: z.string() }).parse(JSON.parse(applied.before ?? "null"));
        const features = offering.features.map((feature) => (feature.id === op.featureId ? { ...feature, ...before } : feature));
        return { patch: { features: plain(features) }, summary: `Undid a change to ${before.name} in the scope of ${offering.name}.` };
      });
    case "add_note":
    case "create_opportunity": {
      const collection = op.kind === "add_note" ? "notes" : "opportunities";
      const docRef = db().doc(`workspaces/${ws}/${collection}/${applied.id}`);
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists || snap.get("deletedAt")) throw new GoneError();
        tx.update(docRef, { deletedAt: now, ...(collection === "opportunities" ? { updatedAt: now } : {}) });
        tx.set(
          db().collection(`workspaces/${ws}/auditEvents`).doc(),
          AuditEvent.parse({
            action: "delete",
            entity: op.kind === "add_note" ? "note" : "opportunity",
            entityId: applied.id,
            summary: op.kind === "add_note" ? "Undid a note added through Ask or tell." : `Undid adding ${op.prospectName} as an opportunity.`,
            by: context.user.uid,
            byName: context.user.name,
            at: now,
          }),
        );
      });
      return;
    }
    case "link_document": {
      const docRef = db().doc(`workspaces/${ws}/documents/${applied.id}`);
      await docRef.update({ offeringIds: JSON.parse(applied.before ?? "[]") as string[] });
      return;
    }
    case "add_proof":
    case "add_constraint":
    case "add_partner": {
      const collection = op.kind === "add_proof" ? "proof" : op.kind === "add_constraint" ? "constraints" : "partners";
      const label = op.kind === "add_proof" ? op.title : op.kind === "add_constraint" ? op.statement : op.name;
      return softDeleteEntity(context, collection, applied.id, `Undid adding ${label}, which came through Ask or tell.`);
    }
  }
}

/* ---------- Edit, leave out, discard ---------- */

/** What a person may change in each kind of proposed change before applying it. */
const EDITABLE: Record<Operation["kind"], readonly string[]> = {
  set_price_cell: ["after", "effectiveFrom"],
  set_fee_line_price: ["after", "effectiveFrom"],
  add_fee_line: ["label", "price"],
  add_note: ["text"],
  add_feature: ["name", "description"],
  update_feature: ["name", "description"],
  add_proof: ["title", "body", "isPublic"],
  add_constraint: ["statement", "insteadText"],
  add_partner: ["name"],
  link_document: [],
  create_opportunity: ["prospectName", "website", "contactName", "contactRole", "nextMeeting"],
};

export const OperationPatch = z.record(z.string().max(40), z.union([z.string().trim().max(2000), z.boolean()]));

async function updateProposal(context: HubContext, proposalId: string, change: (proposal: Proposal) => Proposal): Promise<Proposal> {
  const ref = proposalRef(context.workspace.id, proposalId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ProposalError("This proposal no longer exists.");
    if (snap.get("applyingAt")) throw new ProposalError("It's being applied already.");
    const next = Proposal.parse(change(Proposal.parse(snap.data())));
    tx.set(ref, plain(next));
    return next;
  });
}

/** Whether the person can still change a proposal: pending, or discarded only because the checks dropped everything. */
const editable = (proposal: Proposal) =>
  proposal.status === "proposed" || (proposal.status === "discarded" && !proposal.operations.some((item) => item.status === "discarded"));

export async function editOperation(context: HubContext, proposalId: string, opId: string, patch: z.infer<typeof OperationPatch>) {
  const graph = await getGraphFor(context.workspace.id);
  await updateProposal(context, proposalId, (proposal) => {
    if (!editable(proposal)) throw new ProposalError("This proposal can't be edited any more.");
    const item = proposal.operations.find((entry) => entry.op.id === opId);
    if (!item || (item.status !== "proposed" && item.status !== "dropped")) throw new ProposalError("That change can't be edited.");
    const allowed = EDITABLE[item.op.kind];
    const draft: Record<string, unknown> = { ...item.op };
    for (const [field, value] of Object.entries(patch)) {
      if (!allowed.includes(field)) continue;
      const text = typeof value === "string" ? value : undefined;
      if (field === "contactName" || field === "contactRole") {
        const contact = { ...((draft.contact as Record<string, unknown> | undefined) ?? {}) };
        contact[field === "contactName" ? "name" : "role"] = text || undefined;
        draft.contact = contact.name ? contact : undefined;
      } else if (field === "isPublic") draft.isPublic = value === true;
      else draft[field] = text === "" ? undefined : text;
    }
    const parsed = Operation.safeParse(draft);
    if (!parsed.success) throw new ProposalError("Fill in the required fields.");
    const edited = { ...item, op: parsed.data, editedBy: context.user.name, status: "proposed" as const };
    const included = proposal.operations.map((entry) => (entry.op.id === opId ? edited : entry)).filter((entry) => entry.status === "proposed");
    const result = recheck(proposal, included, graph).get(opId)!;
    const operations = proposal.operations.map((entry) => (entry.op.id === opId ? { ...result, dropReason: result.status === "dropped" ? result.dropReason : undefined } : entry));
    return { ...proposal, operations, status: operations.some((entry) => entry.status === "proposed") ? "proposed" : proposal.status };
  });
}

export async function setOperationIncluded(context: HubContext, proposalId: string, opId: string, include: boolean) {
  await updateProposal(context, proposalId, (proposal) => {
    if (proposal.status !== "proposed") throw new ProposalError("This proposal was already applied or discarded.");
    const operations = proposal.operations.map((item) => {
      if (item.op.id !== opId) return item;
      if (include && item.status === "discarded") return { ...item, status: "proposed" as const };
      if (!include && item.status === "proposed") return { ...item, status: "discarded" as const };
      return item;
    });
    return { ...proposal, operations };
  });
}

export async function discardProposal(context: HubContext, proposalId: string) {
  const next = await updateProposal(context, proposalId, (proposal) => {
    if (proposal.status !== "proposed") throw new ProposalError("This proposal was already applied or discarded.");
    const operations = proposal.operations.map((item) => (item.status === "proposed" ? { ...item, status: "discarded" as const } : item));
    return { ...proposal, operations, status: "discarded" };
  });
  await syncDocument(context, next);
}

/** FR-ING-3: a file's status follows its proposal: waiting, applied, or read with nothing applied. */
async function syncDocument(context: HubContext, proposal: Proposal) {
  if (proposal.via !== "document" || !proposal.input.documentId) return;
  const status = proposal.status === "proposed" ? "ready_to_review" : proposal.status === "discarded" ? "no_changes" : "applied";
  await db()
    .doc(`workspaces/${context.workspace.id}/documents/${proposal.input.documentId}`)
    .update({ status })
    .catch(() => undefined);
}
