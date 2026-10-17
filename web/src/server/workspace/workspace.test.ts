import { describe, expect, it } from "vitest";
import { olvessa } from "@/lib/sample/olvessa";
import { GRAPH_COLLECTIONS, graphSummary, graphToDocs } from "./import-graph";
import { roleAllows } from "./roles";

describe("roleAllows (ADR-0008)", () => {
  it("ranks owner over editor over viewer", () => {
    expect(roleAllows("owner", "owner")).toBe(true);
    expect(roleAllows("owner", "viewer")).toBe(true);
    expect(roleAllows("editor", "editor")).toBe(true);
    expect(roleAllows("editor", "owner")).toBe(false);
    expect(roleAllows("viewer", "editor")).toBe(false);
  });

  it("allows nothing for a missing or unknown role", () => {
    expect(roleAllows(undefined, "viewer")).toBe(false);
    expect(roleAllows(null, "viewer")).toBe(false);
    expect(roleAllows("admin", "viewer")).toBe(false);
    expect(roleAllows("toString", "viewer")).toBe(false);
  });
});

describe("graphToDocs (R12 import)", () => {
  const docs = graphToDocs(olvessa, "ws_abc");

  it("writes every entity of the sample, once, under the new workspace", () => {
    const expected = GRAPH_COLLECTIONS.reduce((sum, key) => sum + olvessa[key].length, 0);
    expect(docs).toHaveLength(expected);
    expect(new Set(docs.map((doc) => doc.path)).size).toBe(expected);
    for (const doc of docs) {
      expect(doc.path).toMatch(/^workspaces\/ws_abc\/(offerings|rateCards|feeSchedules|proof|constraints|partners|notes)\/[^/]+$/);
      expect(doc.data.workspaceId).toBe("ws_abc");
    }
  });

  it("leaves no undefined values, which Firestore rejects", () => {
    const hasUndefined = (value: unknown): boolean =>
      value === undefined ||
      (typeof value === "object" && value !== null && Object.values(value).some(hasUndefined));
    expect(docs.some((doc) => hasUndefined(doc.data))).toBe(false);
  });

  it("rejects an export that doesn't match the schema", () => {
    expect(() => graphToDocs({ ...olvessa, format: "something-else" }, "ws_abc")).toThrow();
  });

  it("counts top-level offerings for the sample card", () => {
    expect(graphSummary(olvessa).offerings).toBe(4);
  });
});
