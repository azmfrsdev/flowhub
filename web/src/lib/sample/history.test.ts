import { describe, expect, it } from "vitest";
import { SampleSeller } from "@/lib/schema";
import { sampleHistoryDocs } from "./history";

describe.each(SampleSeller.options)("sample history for %s (PRD section 10)", (seller) => {
  const docs = sampleHistoryDocs(seller, "ws_test");
  const of = (collection: string) => docs.filter((doc) => doc.path.startsWith(`workspaces/ws_test/${collection}/`)).map((doc) => doc.data);

  it("has past deals, at least one won and one lost, each closed with a reason", () => {
    const deals = of("opportunities");
    expect(deals.map((deal) => deal.status)).toEqual(expect.arrayContaining(["won", "lost"]));
    for (const deal of deals) expect((deal.outcome as { reason: string }).reason.length).toBeGreaterThan(10);
  });

  it("has audit entries by the seller's own staff", () => {
    expect(of("auditEvents").length).toBeGreaterThanOrEqual(2);
  });

  it("builds every pending proposal through the validator, with nothing dropped", () => {
    for (const proposal of of("proposals")) {
      const operations = proposal.operations as { status: string }[];
      expect(operations.length).toBeGreaterThan(0);
      expect(operations.every((item) => item.status === "proposed")).toBe(true);
    }
  });
});

describe("Kelapa Cloud's pending proposals", () => {
  const docs = sampleHistoryDocs("kelapa-cloud", "ws_test");
  const proposals = docs.filter((doc) => doc.path.includes("/proposals/")).map((doc) => doc.data);

  it("has one from a message and one from a file, and the file is recorded as waiting", () => {
    expect(proposals.map((proposal) => proposal.via).sort()).toEqual(["document", "message"]);
    const file = docs.find((doc) => doc.path.endsWith("/documents/doc_ai_onepager"))!.data;
    expect(file).toMatchObject({ status: "ready_to_review", proposalId: "prop_ai_onepager", pages: 2 });
  });

  it("cites the page each file change comes from, with its quote", () => {
    const fromFile = proposals.find((proposal) => proposal.via === "document")!.operations as { op: { kind: string }; source: { locator: { page?: number }; quote?: string } }[];
    const price = fromFile.find((item) => item.op.kind === "add_fee_line")!;
    expect(price.source).toMatchObject({ locator: { page: 2 }, quote: "Starter agent (one channel, one knowledge base): RM 24,000" });
  });
});
