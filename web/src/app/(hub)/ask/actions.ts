"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ModelBusyError } from "@/server/ai/generate";
import { UploadError, retryDocument, uploadDocument } from "@/server/documents/upload";
import { AskError, askOrTell } from "@/server/pipelines/ask";
import { OperationPatch, ProposalError, applyProposal, discardProposal, editOperation, setOperationIncluded, undoProposal } from "@/server/proposals/apply";
import { requireRole } from "@/server/workspace/access";

/**
 * Ask or tell (PRD 7.17, ADR-0009 D2). Every write is a server action with the
 * caller's role checked (invariant 10); the browser only reads the results
 * through Firestore listeners.
 */

export type AskActionResult = { ok: true; id?: string; kind?: "proposal" | "answer" | "document"; message?: string; href?: string } | { ok: false; error: string };

const Message = z.object({
  text: z.string().trim().min(1, "Type a message first.").max(4000, "Keep a message under 4,000 characters."),
  scopeOfferingId: z.string().max(128).optional(),
});
const Id = z.string().min(1).max(128);

function failure(err: unknown, fallback: string): AskActionResult {
  if (err instanceof AskError || err instanceof ProposalError || err instanceof UploadError || err instanceof ModelBusyError) return { ok: false, error: err.message };
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

/** FR-ASK-1: one message, typed in the panel or on Home, optionally scoped to an offering. */
export async function sendMessage(text: string, scopeOfferingId?: string): Promise<AskActionResult> {
  const context = await requireRole("editor");
  const input = Message.safeParse({ text, scopeOfferingId: scopeOfferingId || undefined });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Check your message." };
  try {
    const result = await askOrTell(context, input.data);
    // A proposal shows on Home and on the records it would change (FR-ASK-5).
    if (result.kind === "proposal") refresh();
    return { ok: true, ...result };
  } catch (err) {
    return failure(err, "FlowHub couldn't read that just now. Try again in a moment.");
  }
}

/**
 * FR-ASK-1, FR-ING-1 (PDF only, as changed in PRD 7.0): a file dropped into
 * Ask or tell or a Sales material tab. It's stored and queued for reading; its
 * status and then its proposal reach the browser through listeners.
 */
export async function uploadFile(formData: FormData): Promise<AskActionResult> {
  const context = await requireRole("editor");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a PDF first." };
  const input = z
    .object({ message: z.string().trim().max(4000, "Keep a message under 4,000 characters."), scopeOfferingId: z.string().max(128) })
    .safeParse({ message: formData.get("message") ?? "", scopeOfferingId: formData.get("scopeOfferingId") ?? "" });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Check your message." };
  try {
    const id = await uploadDocument(context, file, { message: input.data.message || undefined, scopeOfferingId: input.data.scopeOfferingId || undefined });
    refresh();
    return { ok: true, id, kind: "document" };
  } catch (err) {
    return failure(err, "The upload didn't finish. Try again in a moment.");
  }
}

/** FR-ING-3: Retry a file that couldn't be read. */
export async function retryDocumentAction(documentId: string): Promise<AskActionResult> {
  const context = await requireRole("editor");
  try {
    await retryDocument(context, Id.parse(documentId));
    refresh();
    return { ok: true };
  } catch (err) {
    return failure(err, "That couldn't be retried. Try again in a moment.");
  }
}

/** FR-ASK-4: Apply. Each change is checked again against the hub as it is now. */
export async function applyProposalAction(proposalId: string): Promise<AskActionResult> {
  const context = await requireRole("editor");
  try {
    const result = await applyProposal(context, Id.parse(proposalId));
    refresh();
    const message = result.dropped ? `${result.dropped} ${result.dropped === 1 ? "change" : "changes"} couldn't be applied. See why below.` : undefined;
    return { ok: true, ...(message ? { message } : {}), ...(result.opportunityId ? { href: `/opportunities/${result.opportunityId}` } : {}) };
  } catch (err) {
    return failure(err, "The changes couldn't be applied. Try again in a moment.");
  }
}

export async function undoProposalAction(proposalId: string): Promise<AskActionResult> {
  const context = await requireRole("editor");
  try {
    const result = await undoProposal(context, Id.parse(proposalId));
    refresh();
    return { ok: true, ...(result.kept.length ? { message: `Kept, because it changed since: ${result.kept.join("; ")}.` } : {}) };
  } catch (err) {
    return failure(err, "That couldn't be undone. Try again in a moment.");
  }
}

export async function discardProposalAction(proposalId: string): Promise<AskActionResult> {
  const context = await requireRole("editor");
  try {
    await discardProposal(context, Id.parse(proposalId));
    refresh();
    return { ok: true };
  } catch (err) {
    return failure(err, "That couldn't be discarded. Try again in a moment.");
  }
}

export async function editOperationAction(proposalId: string, opId: string, patch: unknown): Promise<AskActionResult> {
  const context = await requireRole("editor");
  const input = OperationPatch.safeParse(patch);
  if (!input.success) return { ok: false, error: "Check the values and try again." };
  try {
    await editOperation(context, Id.parse(proposalId), Id.parse(opId), input.data);
    refresh();
    return { ok: true };
  } catch (err) {
    return failure(err, "That edit couldn't be saved. Try again in a moment.");
  }
}

export async function includeOperationAction(proposalId: string, opId: string, include: boolean): Promise<AskActionResult> {
  const context = await requireRole("editor");
  try {
    await setOperationIncluded(context, Id.parse(proposalId), Id.parse(opId), include === true);
    return { ok: true };
  } catch (err) {
    return failure(err, "That couldn't be changed. Try again in a moment.");
  }
}
