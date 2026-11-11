import "server-only";
import { z } from "zod";
import { followUpEvidence } from "@/lib/deal-room/follow-up";
import { checkScope, linesFromFit, quoteChecks, quoteNumber, quoteSettings, quoteTotals } from "@/lib/deal-room/quote";
import { renderQuoteHtml } from "@/lib/deal-room/quote-html";
import { type WorkspaceGraph, malaysiaDay } from "@/lib/offerings/view";
import { parsePrice } from "@/lib/pricing/parse";
import { AuditEvent, Quote, type QuoteLine } from "@/lib/schema";
import { generateJson } from "@/server/ai/generate";
import { DriveError, createProposalDoc, saveDocAsPdf } from "@/server/deal-room/docs";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import type { HubContext } from "@/server/workspace/access";
import { UsageError, chargeAiRun } from "@/server/workspace/usage";
import { PrepError, loadProposal } from "./prep";

/**
 * Quotes with approval (PRD 7.20, ADR-0019). Lines come from the approved
 * Gate C pricing with prices as copied (invariant 1); code works out every
 * amount and runs the checks on every save and again at approval, on the
 * server (D4). One Flash call writes the scope wording, checked by code (D3).
 */

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

const quotesOf = (ws: string, opportunityId: string) => db().collection(`workspaces/${ws}/opportunities/${opportunityId}/quotes`);
const nonPublicNames = (graph: WorkspaceGraph) => graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);

function audit(context: HubContext, action: AuditEvent["action"], quoteId: string, summary: string, at: string) {
  return AuditEvent.parse({ action, entity: "quote", entityId: quoteId, summary, by: context.user.uid, byName: context.user.name, at });
}

/** Recomputes totals and checks from the lines, against today's graph. The browser never sends a figure. */
function priced(quote: Omit<Quote, "totals" | "checks">, graph: WorkspaceGraph, currency: string): Quote {
  const totals = quoteTotals(quote.lines, quote.discountPercent, quote.tax.rate, currency);
  return { ...quote, totals, checks: quoteChecks({ ...quote, totals }, graph, currency, malaysiaDay()) };
}

const Scope = z.object({ lines: z.array(z.object({ id: z.string(), covers: z.string() })) });

/** FR-QUO-1: starts a quote from the approved proposal's pricing. One AI run for the scope wording. */
export async function createQuote(context: HubContext, opportunityId: string, writeRunId: string): Promise<string> {
  const ws = context.workspace.id;
  let proposal: Awaited<ReturnType<typeof loadProposal>>;
  try {
    proposal = await loadProposal(ws, opportunityId, writeRunId);
  } catch (err) {
    if (err instanceof PrepError) throw new QuoteError(err.message);
    throw err;
  }
  const { oppRef, opp, run, working, fit } = proposal;
  const fitRunId = run.inputs.upstreamRunIds.fit;
  if (!fitRunId || fit.pricing.lines.length === 0) throw new QuoteError("The fit map behind this proposal has no priced lines to quote.");
  const [graph, fitRun] = await Promise.all([getGraphFor(ws), oppRef.collection("runs").doc(fitRunId).get()]);
  const currency = context.workspace.currency;
  const settings = quoteSettings(context.workspace);
  let lines = linesFromFit(fit.pricing.lines, currency);

  try {
    await chargeAiRun(ws);
  } catch (err) {
    if (err instanceof UsageError) throw new QuoteError(err.message);
    throw err;
  }
  // ADR-0019 D3: one short "what this covers" per line, restating the proposal; code checks each.
  const evidence = followUpEvidence(working);
  const draft = await generateJson({
    tier: "flash",
    system: prompt("quote-scope", { seller: context.workspace.name, prospect: opp.prospect?.name ?? "the client" }),
    prompt: [
      `<claims>\n${[...evidence.values()].map((claim) => `- ${claim.text}`).join("\n") || "(none)"}\n</claims>`,
      `<lines>\n${lines.map((line) => `${line.id}: ${line.label}`).join("\n")}\n</lines>`,
    ].join("\n\n"),
    schema: Scope,
  });
  const nonPublic = nonPublicNames(graph);
  lines = lines.map((line) => ({ ...line, ...checkScope(draft.lines.find((item) => item.id === line.id)?.covers, line.label, nonPublic) }));

  const now = new Date().toISOString();
  const year = Number(now.slice(0, 4));
  const ref = quotesOf(ws, opportunityId).doc();
  await db().runTransaction(async (tx) => {
    const counterRef = db().doc(`workspaces/${ws}/counters/quotes`);
    const counter = await tx.get(counterRef);
    const n = Number(counter.get(String(year)) ?? 0) + 1;
    const quote = Quote.parse(
      priced(
        {
          id: ref.id,
          number: quoteNumber(year, n),
          writeRunId,
          fitRunId,
          writeRev: run.rev,
          fitRev: Number(fitRun.get("rev") ?? 0),
          status: "draft",
          lines,
          discountPercent: 0,
          tax: { label: settings.taxLabel, rate: settings.taxRate },
          maxDiscount: settings.maxDiscount,
          history: [{ action: "created", by: context.user.name, byUid: context.user.uid, at: now }],
          approvedBy: null,
          approvedAt: null,
          doc: null,
          rev: 1,
          createdAt: now,
          createdBy: context.user.name,
          createdByUid: context.user.uid,
        },
        graph,
        currency,
      ),
    );
    tx.set(counterRef, { [String(year)]: n }, { merge: true });
    tx.set(ref, JSON.parse(JSON.stringify(quote)));
    tx.set(db().collection(`workspaces/${ws}/auditEvents`).doc(), audit(context, "generate", ref.id, `${context.user.name} started quote ${quote.number} for ${opp.prospect?.name ?? "the prospect"}.`, now));
  });
  return ref.id;
}

export const QuoteEdits = z.object({
  rev: z.number().int().nonnegative(),
  discountPercent: z.number().min(0).max(100),
  lines: z.array(
    z.object({
      id: z.string(),
      include: z.boolean(),
      quantity: z.number().positive().max(1_000_000).nullable(),
      personPrice: z.string().trim().max(80).nullable(),
    }),
  ),
});
export type QuoteEdits = z.infer<typeof QuoteEdits>;

/** Reads a quote and runs `change` in a transaction, with the rev check and fresh totals and checks. */
async function update(context: HubContext, opportunityId: string, quoteId: string, change: (quote: Quote) => Omit<Quote, "totals" | "checks"> | string, auditAction?: { action: AuditEvent["action"]; summary: (quote: Quote) => string }) {
  const ws = context.workspace.id;
  const ref = quotesOf(ws, opportunityId).doc(quoteId);
  const graph = await getGraphFor(ws);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Quote.parse(snap.data()) : null;
    if (!current) throw new QuoteError("This quote no longer exists. Reload the page.");
    const next = change(current);
    if (typeof next === "string") throw new QuoteError(next);
    const quote = priced({ ...next, rev: current.rev + 1 }, graph, context.workspace.currency);
    tx.set(ref, JSON.parse(JSON.stringify(Quote.parse(quote))));
    if (auditAction) tx.set(db().collection(`workspaces/${ws}/auditEvents`).doc(), audit(context, auditAction.action, quoteId, auditAction.summary(quote), new Date().toISOString()));
    return quote;
  });
}

/** FR-QUO-2: a person changes quantities, leaves lines out, prices "On quote" lines and sets the discount. Never a copied price. */
export async function saveQuote(context: HubContext, opportunityId: string, quoteId: string, edits: QuoteEdits): Promise<Quote> {
  const currency = context.workspace.currency;
  return update(context, opportunityId, quoteId, (quote) => {
    if (!["draft", "changes_requested"].includes(quote.status)) return "This quote is with the approver. Ask for changes to edit it.";
    if (quote.rev !== edits.rev) return "Someone changed this quote since you opened it. Reload to see their version.";
    const byId = new Map(edits.lines.map((line) => [line.id, line]));
    const lines: QuoteLine[] = quote.lines.map((line) => {
      const edit = byId.get(line.id);
      if (!edit) return line;
      const next: QuoteLine = { ...line, include: edit.include };
      // A quantity only where the line is charged per unit.
      if (line.quantity !== null && edit.quantity !== null && edit.quantity !== line.quantity) Object.assign(next, { quantity: edit.quantity, quantityFrom: "person" });
      // Invariant 1: a person may price only an "On quote" line, and it must read as an amount.
      if (line.unpriced) {
        const price = edit.personPrice?.trim() || null;
        if (price && parsePrice(price, currency).kind !== "amount") throw new QuoteError(`"${price}" isn't a price FlowHub can read. Write it like ${currency === "MYR" ? "RM 12,000" : `${currency} 12,000`}.`);
        if (price !== line.personPrice) Object.assign(next, { personPrice: price, personPriceBy: price ? context.user.name : null });
      }
      return next;
    });
    return { ...quote, lines, discountPercent: Math.round(edits.discountPercent * 100) / 100, status: quote.status };
  });
}

/** FR-QUO-5: the builder sends the quote for approval. It is locked until approved or sent back. */
export async function sendQuote(context: HubContext, opportunityId: string, quoteId: string): Promise<Quote> {
  const now = new Date().toISOString();
  return update(
    context,
    opportunityId,
    quoteId,
    (quote) => (["draft", "changes_requested"].includes(quote.status) ? { ...quote, status: "sent", history: [...quote.history, { action: "sent", by: context.user.name, byUid: context.user.uid, at: now }] } : "This quote was already sent."),
    { action: "send", summary: (quote) => `${context.user.name} sent quote ${quote.number} for approval.` },
  );
}

/**
 * FR-QUO-5, ADR-0019 D4: the Owner approves, and only when every check
 * passes against today's graph. The server re-runs the checks; a disabled
 * button in the browser is not the control.
 */
export async function approveQuote(context: HubContext, opportunityId: string, quoteId: string): Promise<Quote> {
  const ws = context.workspace.id;
  const graph = await getGraphFor(ws);
  const now = new Date().toISOString();
  return update(
    context,
    opportunityId,
    quoteId,
    (quote) => {
      if (quote.status !== "sent") return "Only a quote sent for approval can be approved.";
      const fresh = quoteChecks(quote, graph, context.workspace.currency, malaysiaDay());
      const failed = fresh.filter((check) => check.state === "fail");
      if (failed.length) return `Approval is blocked: ${failed.map((check) => check.label.toLowerCase()).join("; ")}.`;
      return { ...quote, status: "approved", approvedBy: context.user.name, approvedAt: now, history: [...quote.history, { action: "approved", by: context.user.name, byUid: context.user.uid, at: now }] };
    },
    { action: "update", summary: (quote) => `${context.user.name} approved quote ${quote.number}.` },
  );
}

/** FR-QUO-5: the approver sends it back with a note. */
export async function requestQuoteChanges(context: HubContext, opportunityId: string, quoteId: string, note: string): Promise<Quote> {
  const now = new Date().toISOString();
  return update(
    context,
    opportunityId,
    quoteId,
    (quote) => (quote.status === "sent" ? { ...quote, status: "changes_requested", history: [...quote.history, { action: "changes_requested", by: context.user.name, byUid: context.user.uid, at: now, note }] } : "Only a quote sent for approval can be sent back."),
    { action: "update", summary: (quote) => `${context.user.name} asked for changes to quote ${quote.number}: ${note}` },
  );
}

/** FR-QUO-6: the approved quote as a Google Doc, with a PDF beside it, in the user's FlowHub folder. The token is used here only. */
export async function createQuoteDoc(context: HubContext, opportunityId: string, quoteId: string, token: string): Promise<Quote> {
  const ws = context.workspace.id;
  const ref = quotesOf(ws, opportunityId).doc(quoteId);
  const [snap, oppSnap, userSnap] = await Promise.all([ref.get(), db().doc(`workspaces/${ws}/opportunities/${opportunityId}`).get(), db().doc(`users/${context.user.uid}`).get()]);
  const quote = snap.exists ? Quote.parse(snap.data()) : null;
  if (!quote || quote.status !== "approved") throw new QuoteError("Only an approved quote can be created in Google Docs.");
  const prospect = (oppSnap.get("prospect")?.name as string | undefined) ?? "the client";
  const contact = (oppSnap.get("contact")?.name as string | undefined) ?? null;
  const format = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(date);
  const html = renderQuoteHtml(quote, { seller: context.workspace.name, prospect, contact, date: format(new Date()), validUntil: format(new Date(Date.now() + 30 * 86_400_000)) });
  const title = `Quote ${quote.number} for ${prospect} · ${context.workspace.name}`;
  let doc: { id: string; url: string; folderId: string };
  let pdfUrl: string | null = null;
  try {
    doc = await createProposalDoc(token, title, html, (userSnap.get("driveFolderId") as string | undefined) ?? null);
  } catch (err) {
    if (err instanceof DriveError) throw new QuoteError(err.message);
    throw err;
  }
  try {
    pdfUrl = (await saveDocAsPdf(token, doc.id, `${title}.pdf`, doc.folderId)).url;
  } catch {
    // The Doc exists; the PDF is a convenience. The view offers the Doc either way.
  }
  const now = new Date().toISOString();
  return update(
    context,
    opportunityId,
    quoteId,
    (current) => ({ ...current, doc: { id: doc.id, url: doc.url, pdfUrl, createdAt: now }, history: [...current.history, { action: "doc_created", by: context.user.name, byUid: context.user.uid, at: now }] }),
    { action: "generate", summary: () => `Created quote ${quote.number} in Google Docs: ${doc.url}` },
  ).then(async (result) => {
    await db().doc(`users/${context.user.uid}`).set({ driveFolderId: doc.folderId, driveGrantedAt: now }, { merge: true });
    return result;
  });
}
