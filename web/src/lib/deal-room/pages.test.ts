import { describe, expect, it } from "vitest";
import { checkRequirementPages } from "./pages";

const pdf = {
  scanned: false,
  pages: ["Request for proposal. Issued by Anjung Serai Living.", "3.1 The system must report sales for all 42 stores daily.\n3.2 Data must stay in Malaysia.", "Submissions close on 30 November 2026."],
};
const req = (sourceLine: string | undefined, page?: number): { id: string; text: string; sourceLine?: string; page?: number; pageChecked?: boolean } => ({ id: "r1", text: "x", sourceLine, page });

describe("requirement pages are decided by code (FR-INT-3)", () => {
  it("keeps a page the source line is on", () => {
    expect(checkRequirementPages([req("must report sales for all 42 stores daily", 2)], pdf)[0]).toMatchObject({ page: 2, pageChecked: true });
  });

  it("moves a wrong page to the page the line is on", () => {
    expect(checkRequirementPages([req("Data must stay in Malaysia", 3)], pdf)[0]).toMatchObject({ page: 2, pageChecked: true });
  });

  it("finds the page when the model gave none", () => {
    expect(checkRequirementPages([req("Submissions close on 30 November 2026")], pdf)[0]).toMatchObject({ page: 3, pageChecked: true });
  });

  it("removes a page when the line isn't in the PDF, such as one from the pasted email", () => {
    const [result] = checkRequirementPages([req("Can you start in January?", 1)], pdf);
    expect(result.page).toBeUndefined();
    expect(result.pageChecked).toBeUndefined();
  });

  it("keeps a scan's page as unchecked, unless the file has no such page", () => {
    const scan = { scanned: true, pages: ["", ""] };
    expect(checkRequirementPages([req("anything", 2)], scan)[0]).toMatchObject({ page: 2, pageChecked: false });
    expect(checkRequirementPages([req("anything", 5)], scan)[0].page).toBeUndefined();
  });

  it("keeps no page when no PDF was attached", () => {
    expect(checkRequirementPages([req("must report sales", 2)], null)[0].page).toBeUndefined();
  });
});
