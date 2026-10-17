import { describe, expect, it } from "vitest";
import type { WorkspaceGraph } from "@/lib/offerings/view";
import { olvessa, olvessaDocuments } from "@/lib/sample/olvessa";
import { validateOperations } from "@/server/proposals/validate";
import { askOutline, type ModelChange, toOperations } from "./outline";

const graph: WorkspaceGraph = { ...olvessa, documents: olvessaDocuments };
const { handles } = askOutline(graph);
const LZ_GROWTH = Object.entries(handles).find(([, h]) => h.kind === "cell" && h.cardId === "rc_gcm" && h.rowId === "row_lz" && h.colId === "col_gro")![0];

const pages = new Map([
  [1, "Olvessa · Google Cloud migration 2026"],
  [2, "Packages\nLanding zone setup  Essentials RM 12,000  Growth RM19,500  Scale RM 30,000\nPrices from 1 November 2026."],
  [3, "Our oﬃce in Kuala Lumpur supports clients across Malaysia and Singapore."],
]);

function read(changes: { page?: number; change: ModelChange }[], extra: unknown[] = []) {
  let n = 0;
  return validateOperations({
    operations: [...toOperations(changes.map((item) => item.change), handles, graph).map((op, i) => ({ ...(op as object), page: changes[i].page })), ...extra],
    graph,
    sourceText: "",
    pages,
    source: { documentId: "doc_new", locator: {} },
    requireEvidenceInSource: false,
    newId: () => `op_${++n}`,
  });
}

const priceChange = (page: number, newPrice = "RM 19,500"): { page: number; change: ModelChange } => ({
  page,
  change: { kind: "set_price", evidence: "Growth RM19,500", priceRef: LZ_GROWTH, newPrice },
});

describe("a file's changes are checked against the page they cite (ADR-0009 D2)", () => {
  it("accepts a price written on the cited page, however it's spaced, and cites that page", () => {
    const [checked] = read([priceChange(2)]);
    expect(checked.status).toBe("proposed");
    expect(checked.source).toEqual({ documentId: "doc_new", locator: { page: 2 }, quote: "Growth RM19,500" });
  });

  it("drops a price the cited page doesn't contain, even if another page does", () => {
    const [checked] = read([priceChange(1)]);
    expect(checked.status).toBe("dropped");
    expect(checked.dropReason).toContain("isn't written in the source");
  });

  it("drops a rounded price", () => {
    expect(read([priceChange(2, "RM 20,000")])[0].status).toBe("dropped");
  });

  it("drops a change that names no page, or a page the file doesn't have", () => {
    expect(read([{ change: priceChange(2).change }])[0].dropReason).toBe("It doesn't say which page of the file it comes from.");
    expect(read([priceChange(9)])[0].status).toBe("dropped");
  });

  it("keeps a quote only when the page contains it, reading ligatures as letters", () => {
    const [found, invented] = read([
      { page: 3, change: { kind: "add_note", evidence: "Our office in Kuala Lumpur supports clients", offeringId: "off_gcm", linkToNewOpportunity: false, text: "Supports clients in Malaysia and Singapore from KL." } },
      { page: 3, change: { kind: "add_note", evidence: "We have 200 engineers", offeringId: "off_gcm", linkToNewOpportunity: false, text: "Has 200 engineers." } },
    ]);
    expect(found.source.quote).toBe("Our office in Kuala Lumpur supports clients");
    expect(found.status).toBe("proposed");
    expect(invented.source.quote).toBeUndefined();
    expect(invented.source.locator).toEqual({ page: 3 });
  });

  it("files the document under offerings, and drops a link to a file that doesn't exist", () => {
    const [link, missing] = read([], [
      { kind: "link_document", evidence: "Brochure.pdf", documentId: olvessaDocuments[0].id, offeringIds: ["off_bq"] },
      { kind: "link_document", evidence: "Brochure.pdf", documentId: "doc_gone", offeringIds: ["off_bq"] },
    ]);
    expect(link).toMatchObject({ status: "proposed", path: "Data and analytics on BigQuery › Sales material › Files", href: "/offerings/off_bq/sales" });
    expect(missing.dropReason).toBe("That file no longer exists.");
  });
});
