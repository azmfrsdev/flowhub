"use server";

import { z } from "zod";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { QuoteEdits, QuoteError, approveQuote, createQuote, createQuoteDoc, requestQuoteChanges, saveQuote, sendQuote } from "@/server/pipelines/quote";
import { requireRole } from "@/server/workspace/access";
import { ForbiddenError } from "@/server/workspace/roles";
import { ArgId, parseArgs } from "@/server/workspace/args";

/**
 * Step G, Quote (PRD 7.20, ADR-0019): server actions like the other steps
 * after Gate D. Zod and the caller's role are checked first (invariant 10).
 * Editors build and send; only the Owner approves or sends back (D5).
 */

export type QuoteResult = { error?: string; ok?: number; id?: string; url?: string };

function failed(err: unknown): QuoteResult {
  if (err instanceof QuoteError) return { error: err.message };
  if (err instanceof ModelOutputError) return { error: "Gemini's answer didn't have the expected shape. Try again." };
  if (err instanceof ModelBusyError) return { error: err.message };
  throw err;
}

/** FR-QUO-1: starts a quote from the approved pricing. One AI run for the scope wording. */
export async function startQuote(opportunityId: string, writeRunId: string): Promise<QuoteResult> {
  const context = await requireRole("editor");
  [opportunityId, writeRunId] = parseArgs([ArgId, ArgId], [opportunityId, writeRunId]);
  try {
    return { id: await createQuote(context, opportunityId, writeRunId), ok: Date.now() };
  } catch (err) {
    return failed(err);
  }
}

/** FR-QUO-2: quantities, lines left out, "On quote" prices and the discount. Totals are worked out on the server. */
export async function saveQuoteEdits(opportunityId: string, quoteId: string, edits: unknown): Promise<QuoteResult> {
  const context = await requireRole("editor");
  [opportunityId, quoteId] = parseArgs([ArgId, ArgId], [opportunityId, quoteId]);
  const input = QuoteEdits.safeParse(edits);
  if (!input.success) return { error: "Check the quantities, prices and discount." };
  try {
    await saveQuote(context, opportunityId, quoteId, input.data);
  } catch (err) {
    return failed(err);
  }
  return { ok: Date.now() };
}

/** FR-QUO-5: sends the quote for approval, and locks it. */
export async function sendForApproval(opportunityId: string, quoteId: string): Promise<QuoteResult> {
  const context = await requireRole("editor");
  [opportunityId, quoteId] = parseArgs([ArgId, ArgId], [opportunityId, quoteId]);
  try {
    await sendQuote(context, opportunityId, quoteId);
  } catch (err) {
    return failed(err);
  }
  return { ok: Date.now() };
}

/** FR-QUO-5: the Owner approves. The server re-runs every check first. */
export async function approve(opportunityId: string, quoteId: string): Promise<QuoteResult> {
  let context;
  try {
    context = await requireRole("owner");
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "Only the Owner can approve quotes." };
    throw err;
  }
  [opportunityId, quoteId] = parseArgs([ArgId, ArgId], [opportunityId, quoteId]);
  try {
    await approveQuote(context, opportunityId, quoteId);
  } catch (err) {
    return failed(err);
  }
  return { ok: Date.now() };
}

/** FR-QUO-5: the Owner sends it back with a note. */
export async function requestChanges(opportunityId: string, quoteId: string, note: string): Promise<QuoteResult> {
  let context;
  try {
    context = await requireRole("owner");
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "Only the Owner can send quotes back." };
    throw err;
  }
  [opportunityId, quoteId] = parseArgs([ArgId, ArgId], [opportunityId, quoteId]);
  const text = z.string().trim().min(3, "Say what should change.").max(1000).safeParse(note);
  if (!text.success) return { error: text.error.issues[0]?.message ?? "Say what should change." };
  try {
    await requestQuoteChanges(context, opportunityId, quoteId, text.data);
  } catch (err) {
    return failed(err);
  }
  return { ok: Date.now() };
}

/** FR-QUO-6: the approved quote as a Google Doc and PDF. The `drive.file` token is used here only, never stored or logged (invariant 12). */
export async function createQuoteInDocs(opportunityId: string, quoteId: string, accessToken: string): Promise<QuoteResult> {
  const context = await requireRole("editor");
  [opportunityId, quoteId] = parseArgs([ArgId, ArgId], [opportunityId, quoteId]);
  const token = z.string().min(20).max(4096).safeParse(accessToken);
  if (!token.success) return { error: "Google didn't give FlowHub permission. Try again." };
  try {
    const quote = await createQuoteDoc(context, opportunityId, quoteId, token.data);
    return { ok: Date.now(), url: quote.doc?.url };
  } catch (err) {
    return failed(err);
  }
}
