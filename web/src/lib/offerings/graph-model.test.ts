import { describe, expect, it } from "vitest";
import { SAMPLES } from "@/lib/sample";
import type { FitOutput, Opportunity } from "@/lib/schema";
import { graphSize, layoutGraph } from "./graph-layout";
import { buildGraphModel } from "./graph-model";
import type { WorkspaceGraph } from "./view";

const graphOf = (seller: keyof typeof SAMPLES): WorkspaceGraph => ({ ...SAMPLES[seller].graph, documents: SAMPLES[seller].documents });

const deal = (over: Partial<Opportunity>): Opportunity =>
  ({ id: "opp_1", workspaceId: "ws", status: "proposing", prospect: { name: "Pelita Waris Hospitals" }, interestedOfferingIds: ["off_gcm"], deletedAt: null, ...over }) as Opportunity;

const fit = {
  gaps: [
    { id: "g1", text: "Move 140 VMs", priority: "high", origin: { kind: "intake", ref: "r1" } },
    { id: "g2", text: "Network upgrade across 4 hospitals", priority: "medium", origin: { kind: "intake", ref: "r2" } },
    { id: "g3", text: "Patient reporting", priority: "low", origin: { kind: "intake", ref: "r3" } },
    { id: "g4", text: "No gambling", priority: "low", origin: { kind: "intake", ref: "r4" } },
  ],
  mappings: [
    { gapId: "g1", target: { type: "offering", id: "off_gcm", rev: 1 }, strength: "strong", featureRefs: [], proofRefs: [] },
    { gapId: "g3", target: { type: "feature", id: "f_sd", rev: 1 }, strength: "partial", featureRefs: [], proofRefs: [] },
  ],
  cannotMeet: [
    { gapId: "g2", constraint: { type: "constraint", id: "con_hw", rev: 1 }, partner: { type: "partner", id: "ptn_jentayu", rev: 1 } },
    { gapId: "g4", constraint: { type: "constraint", id: "con_ind", rev: 1 }, sellingRule: true },
  ],
  score: { value: 72.4, band: "go", components: { coverage: 0, penalties: 0, techBonus: 0 } },
  reasons: [],
  pricing: { lines: [] },
} as unknown as FitOutput;

describe("buildGraphModel (FR-OG-12, ADR-0018 D1)", () => {
  const graph = graphOf("olvessa");
  const model = buildGraphModel(graph, [deal({})], new Map([["opp_1", fit]]));

  it("draws offerings, results, scope rules, partners, documents and deals", () => {
    const kinds = new Set(model.nodes.map((node) => node.kind));
    expect([...kinds].sort()).toEqual(["deal", "document", "offering", "partner", "proof", "rule"]);
    expect(model.nodes.find((node) => node.id === "prf:prf_bank")?.isPublic).toBe(false);
    expect(model.edges).toContainEqual({ from: "rule:con_hw", to: "ptn:ptn_jentayu", kind: "covers" });
  });

  it("leaves out company-wide selling rules", () => {
    expect(model.nodes.some((node) => node.id === "rule:con_region")).toBe(false);
  });

  it("never carries cost, buy prices or contacts (invariant 2)", () => {
    const text = JSON.stringify(model);
    const secrets = [
      ...graph.partners.flatMap((partner) => [partner.buyPrice ?? "", ...partner.contacts.flatMap((contact) => [contact.email ?? "", contact.phone ?? ""])]),
      ...graph.feeSchedules.flatMap((schedule) => schedule.lines.map((line) => line.cost ?? "")),
    ].filter((value) => value.length > 3);
    expect(secrets.length).toBeGreaterThan(0);
    for (const secret of secrets) expect(text).not.toContain(secret);
    expect(model.nodes.find((node) => node.id === "ptn:ptn_sempadan")?.privateBuyPrice).toBe(true);
  });

  it("turns a fit map into a lens: strengths, features to their offering, Cannot meet to rule and partner", () => {
    const lens = model.lenses[0]!;
    expect(lens.score).toEqual({ value: 72, band: "go" });
    expect(lens.needs).toEqual([
      { text: "Move 140 VMs", priority: "high", fit: "strong", nodeIds: ["off:off_gcm"] },
      { text: "Network upgrade across 4 hospitals", priority: "medium", fit: "cannot", nodeIds: ["rule:con_hw", "ptn:ptn_jentayu"] },
      { text: "Patient reporting", priority: "low", fit: "partial", nodeIds: ["off:off_bq"] },
    ]);
  });

  it("leaves out deleted records", () => {
    const deleted = { ...graph, proof: graph.proof.map((item) => (item.id === "prf_450" ? { ...item, deletedAt: "2026-11-01T00:00:00+08:00" } : item)) };
    expect(buildGraphModel(deleted, [], new Map()).nodes.some((node) => node.id === "prf:prf_450")).toBe(false);
  });
});

describe("layoutGraph (ADR-0018 D2)", () => {
  for (const seller of ["olvessa", "yorvex", "trassoq"] as const) {
    it(`places every ${seller} node inside the drawing, the same way each time`, () => {
      const model = buildGraphModel(graphOf(seller), [], new Map());
      const first = layoutGraph(model.nodes, model.edges);
      const again = layoutGraph(model.nodes, model.edges);
      expect([...first.entries()]).toEqual([...again.entries()]);
      const size = graphSize(model.nodes.length);
      for (const node of model.nodes) {
        const p = first.get(node.id)!;
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(size.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(size.height);
      }
      // No two nodes on top of each other.
      const points = [...first.values()];
      for (let i = 0; i < points.length; i += 1)
        for (let j = i + 1; j < points.length; j += 1) expect(Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)).toBeGreaterThan(20);
    });
  }
});
