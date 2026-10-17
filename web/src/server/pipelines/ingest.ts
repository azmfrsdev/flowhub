import "server-only";
import { z } from "zod";
import { typedMoney } from "@/lib/ask/answer";
import { ModelChange, askOutline, toOperations } from "@/lib/ask/outline";
import { malaysiaDay } from "@/lib/offerings/view";
import { AuditEvent, DocumentKind, DocumentRecord, Proposal, Workspace } from "@/lib/schema";
import { ModelBusyError, ModelOutputError, generateJson, newUsage } from "@/server/ai/generate";
import { MODELS } from "@/server/ai/models";
import { PdfError, looksScanned, pdfPages } from "@/server/documents/pdf";
import { bucket, db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import { prompt } from "@/server/prompts";
import { offeringsTouched, proposalSummary, warnOpenDeals } from "@/server/proposals/shared";
import { costTokens, normalisePrice, validateOperations } from "@/server/proposals/validate";
import { PAUSED_MESSAGE, agentsPaused } from "@/server/workspace/flags";

/**
 * Reading a dropped PDF (ADR-0009 D2: files and messages produce the same
 * proposal; PRD FR-ING-1 to FR-ING-3 as changed in 7.0). A job, like a stage:
 * it reads the file and the hub from storage, writes the proposal and the
 * file's status back, and ends (invariant 8).
 *
 *  1. Read the pages (calc): the PDF's text layer, page by page, by code.
 *     A scan has none, so Gemini transcribes the page images instead (ai).
 *  2. Read the file (ai): Gemini Flash reads the PDF itself, with the same
 *     cost-free, price-free outline as a message, and proposes changes, each
 *     citing a page.
 *  3. Check changes (calc): every price must appear word for word in the
 *     text of the page it cites; the other checks are the same as a message's.
 */

const DocumentRead = z.object({
  documentKind: DocumentKind,
  summary: z.string(),
  aboutOfferingIds: z.array(z.string()),
  changes: z.array(z.object({ page: z.number().int().describe("The page the change is stated on; the first page is 1."), change: ModelChange })),
});

const Transcript = z.object({ pages: z.array(z.object({ page: z.number().int(), text: z.string() })) });

/** Reading a whole PDF can be slow when healthy (a 20 MB scan), so each attempt gets longer than a Flash call's usual 2 minutes. */
const READ_TIMEOUT_MS = 240_000;

export async function runIngest(ids: { workspaceId: string; documentId: string }): Promise<void> {
  const base = db().collection("workspaces").doc(ids.workspaceId);
  const ref = base.collection("documents").doc(ids.documentId);

  // Claim the file, so a repeated task can't read it twice.
  const claimed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "uploaded") return null;
    tx.update(ref, { status: "reading", readingAt: new Date().toISOString() });
    return DocumentRecord.parse(snap.data());
  });
  if (!claimed) return;
  const doc = claimed;

  try {
    // FR-CAP-2: a file queued before the kill switch was thrown isn't read.
    if (await agentsPaused()) throw new PdfError(PAUSED_MESSAGE);
    const [[bytes], workspaceSnap, graph] = await Promise.all([bucket().file(doc.storagePath).download(), base.get(), getGraphFor(ids.workspaceId)]);
    const workspace = Workspace.parse(workspaceSnap.data());
    const usage = newUsage();
    const pdf = { inlineData: { mimeType: "application/pdf", data: bytes.toString("base64") } };

    let pages = await pdfPages(bytes);
    const scanned = looksScanned(pages);
    if (scanned) {
      const transcript = await generateJson({
        tier: "flash",
        system: "Transcribe the text of every page of this PDF exactly as it appears, page by page. The first page is 1. Keep numbers, prices and currency exactly as printed. Don't summarise or correct anything.",
        prompt: [{ role: "user", parts: [pdf, { text: "Transcribe every page." }] }],
        schema: Transcript,
        usage,
        timeoutMs: READ_TIMEOUT_MS,
      });
      pages = Array.from({ length: pages.length }, (_, i) => transcript.pages.find((page) => page.page === i + 1)?.text ?? "");
    }

    const { outline, handles } = askOutline(graph);
    const scope = doc.offeringIds[0] ? outline.offerings.find((offering) => offering.id === doc.offeringIds[0]) : undefined;
    const read = await generateJson({
      tier: "flash",
      system: prompt("read-document"),
      prompt: [
        {
          role: "user",
          parts: [
            pdf,
            {
              text: JSON.stringify({
                today: malaysiaDay(),
                seller: workspace.name,
                currency: workspace.currency,
                fileName: doc.name,
                pages: pages.length,
                droppedOn: scope ? { offeringId: scope.id, name: scope.name } : null,
                note: doc.message ?? null,
                hub: outline,
              }),
            },
          ],
        },
      ],
      schema: DocumentRead,
      usage,
      timeoutMs: READ_TIMEOUT_MS,
    });

    const proposalRef = base.collection("proposals").doc();
    const live = new Set(outline.offerings.map((offering) => offering.id));
    const linkTo = [...new Set(read.aboutOfferingIds)].filter((id) => live.has(id) && !doc.offeringIds.includes(id));
    const mapped = toOperations(
      read.changes.map((item) => item.change),
      handles,
      graph,
    ).map((op, i) => ({ ...(op as object), page: read.changes[i].page }));
    // The model can't see the hub's prices, so it lists every price the file states; code sets aside the ones that already match.
    const unchanged = mapped.filter(samePrice).length;
    const raw = [
      ...mapped.filter((op) => !samePrice(op)),
      ...(linkTo.length ? [{ kind: "link_document", evidence: doc.name, documentId: doc.id, offeringIds: linkTo }] : []),
    ];
    let n = 0;
    const checked = validateOperations({
      operations: raw,
      graph,
      sourceText: "",
      pages: new Map(pages.map((text, i) => [i + 1, text])),
      source: { documentId: doc.id, locator: {} },
      requireEvidenceInSource: false,
      newId: () => `op_${++n}`,
    });
    await warnOpenDeals(ids.workspaceId, checked);

    const proposed = checked.filter((item) => item.status === "proposed").length;
    const pageWord = `${pages.length} ${pages.length === 1 ? "page" : "pages"}`;
    const matching = unchanged ? ` ${unchanged === 1 ? "1 price already matches" : `${unchanged} prices already match`} the hub.` : "";
    const summary =
      checked.length === 0
        ? `Read ${pageWord}. Nothing in it differs from the hub.${matching}`
        : `Read ${pageWord}. ${proposalSummary(proposed, checked.length - proposed)}${matching}`;
    // The file's one-line description is the model's words, so it may not state an amount the file doesn't, or any cost.
    const about = typedMoney(read.summary, pages.join("\n"), costTokens(graph)) ? undefined : read.summary.trim().slice(0, 300) || undefined;
    const now = new Date().toISOString();
    const proposal = Proposal.parse({
      id: proposalRef.id,
      workspaceId: ids.workspaceId,
      via: "document",
      input: { documentId: doc.id, fileName: doc.name, ...(doc.message ? { text: doc.message } : {}) },
      ...(doc.offeringIds[0] ? { scopeOfferingId: doc.offeringIds[0] } : {}),
      offeringIds: [...new Set(checked.flatMap((item) => offeringsTouched(item.op, graph)))],
      operations: checked,
      summary,
      status: proposed > 0 ? "proposed" : "discarded",
      createdBy: doc.uploadedBy,
      createdAt: now,
      model: MODELS.flash,
    });

    const batch = db().batch();
    batch.set(proposalRef, JSON.parse(JSON.stringify(proposal)));
    batch.update(ref, {
      status: proposed > 0 ? "ready_to_review" : "no_changes",
      proposalId: proposalRef.id,
      pages: pages.length,
      scanned,
      ...(about ? { summary: about } : {}),
      // FR-ING-2: the model suggests the kind; a person's choice is never overwritten.
      ...(doc.kind === "other" ? { kind: read.documentKind } : {}),
    });
    batch.set(
      base.collection("auditEvents").doc(),
      AuditEvent.parse({
        action: "generate",
        entity: "proposal",
        entityId: proposalRef.id,
        summary: `FlowHub read ${doc.name} and proposed ${proposed === 1 ? "1 change" : `${proposed} changes`}.`,
        by: "ingest",
        byName: doc.uploadedBy,
        at: now,
      }),
    );
    await batch.commit();
  } catch (err) {
    // FR-ING-3: a failure always shows on the file, with a reason and Retry. Never silent.
    console.error(`Reading document ${doc.id} failed:`, err);
    const message =
      err instanceof PdfError
        ? err.message
        : err instanceof ModelOutputError
          ? "FlowHub couldn't make sense of this file. Retry, or check it opens as a normal PDF."
          : err instanceof ModelBusyError
            ? err.message
            : "FlowHub couldn't read this file just now. Retry in a moment.";
    await ref.update({ status: "failed", error: message });
  }
}

/** A price change to the value the line already has. */
function samePrice(op: object): boolean {
  const { kind, before, after } = op as { kind?: string; before?: unknown; after?: unknown };
  return (kind === "set_price_cell" || kind === "set_fee_line_price") && typeof before === "string" && typeof after === "string" && normalisePrice(before) === normalisePrice(after);
}
