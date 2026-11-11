import type { GraphEdge, GraphNode } from "./graph-model";

/**
 * Where each node sits in the graph view (ADR-0018 D2). Offerings start on an
 * inner ring and every other node beside the offerings it links to; then a
 * fixed number of force steps (repulsion, springs, a pull to the centre)
 * settles it. No randomness, so the same graph always draws the same way.
 */

export type Point = { x: number; y: number };

export const GRAPH_SIZE = { width: 1000, height: 680 } as const;

/** Taller for bigger hubs, so labels keep apart: 680 up to about 30 nodes, then 16 more per node, at most 1100. */
export function graphSize(nodeCount: number): { width: number; height: number } {
  return { width: GRAPH_SIZE.width, height: Math.min(1100, Math.max(GRAPH_SIZE.height, GRAPH_SIZE.height + (nodeCount - 30) * 16)) };
}
const MARGIN = { x: 80, top: 40, bottom: 60 };

const RING: Record<GraphNode["kind"], number> = { offering: 0.32, proof: 0.72, rule: 0.72, partner: 0.95, document: 0.95, deal: 0.85 };

export function layoutGraph(nodes: Pick<GraphNode, "id" | "kind">[], edges: Pick<GraphEdge, "from" | "to">[], steps = 300): Map<string, Point> {
  const { width, height } = graphSize(nodes.length);
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - MARGIN.x;
  const ry = height / 2 - MARGIN.top;
  const neighbours = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const { from, to } of edges) {
    neighbours.get(from)?.push(to);
    neighbours.get(to)?.push(from);
  }

  // Seed: offerings evenly round an inner ring, sorted so related offerings sit together.
  const angle = new Map<string, number>();
  const offerings = nodes.filter((node) => node.kind === "offering");
  offerings.forEach((node, index) => angle.set(node.id, -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, offerings.length)));
  const pos = new Map<string, Point>();
  const place = (key: string, kind: GraphNode["kind"], a: number) => pos.set(key, { x: cx + Math.cos(a) * rx * RING[kind], y: cy + Math.sin(a) * ry * RING[kind] });
  for (const node of offerings) place(node.id, node.kind, angle.get(node.id)!);

  // Every other node at the mean angle of the offerings it touches (directly or through one hop), spread a little by order.
  const others = nodes.filter((node) => node.kind !== "offering");
  const seen = new Map<string, number>();
  for (const node of others) {
    const direct = (neighbours.get(node.id) ?? []).filter((key) => angle.has(key));
    const hop = direct.length ? direct : (neighbours.get(node.id) ?? []).flatMap((key) => (neighbours.get(key) ?? []).filter((next) => angle.has(next)));
    const angles = hop.map((key) => angle.get(key)!);
    const mean = angles.length ? Math.atan2(angles.reduce((s, a) => s + Math.sin(a), 0), angles.reduce((s, a) => s + Math.cos(a), 0)) : 0;
    const bucket = `${node.kind}:${Math.round(mean * 8)}`;
    const n = seen.get(bucket) ?? 0;
    seen.set(bucket, n + 1);
    const spread = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.22;
    angle.set(node.id, mean + spread);
    place(node.id, node.kind, mean + spread);
  }

  // Settle with fixed forces.
  const keys = nodes.map((node) => node.id);
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  for (let step = 0; step < steps; step += 1) {
    const cool = 1 - step / steps;
    const move = new Map<string, Point>(keys.map((key) => [key, { x: 0, y: 0 }]));
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = pos.get(keys[i]!)!;
        const b = pos.get(keys[j]!)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (i - j) * 0.5;
          dy = 0.5;
          d2 = dx * dx + dy * dy;
        }
        // Labels sit under nodes and are wide, so push harder sideways.
        const force = 30000 / d2;
        const d = Math.sqrt(d2);
        move.get(keys[i]!)!.x += (dx / d) * force * 1.3;
        move.get(keys[i]!)!.y += (dy / d) * force;
        move.get(keys[j]!)!.x -= (dx / d) * force * 1.3;
        move.get(keys[j]!)!.y -= (dy / d) * force;
      }
    }
    for (const { from, to } of edges) {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const pull = (d - 170) * 0.012;
      move.get(from)!.x += (dx / d) * pull;
      move.get(from)!.y += (dy / d) * pull;
      move.get(to)!.x -= (dx / d) * pull;
      move.get(to)!.y -= (dy / d) * pull;
    }
    for (const key of keys) {
      const p = pos.get(key)!;
      const m = move.get(key)!;
      const centre = kindOf.get(key) === "offering" ? 0.004 : 0.0015;
      m.x += (cx - p.x) * centre;
      m.y += (cy - p.y) * centre;
      const len = Math.sqrt(m.x * m.x + m.y * m.y);
      const cap = 24 * cool + 1;
      const k = len > cap ? cap / len : 1;
      p.x = Math.min(width - MARGIN.x, Math.max(MARGIN.x, p.x + m.x * k));
      p.y = Math.min(height - MARGIN.bottom, Math.max(MARGIN.top, p.y + m.y * k));
    }
  }
  // Last, keep labels apart: nodes closer than a label's width side by side, or a line apart, are pushed away from each other.
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = false;
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = pos.get(keys[i]!)!;
        const b = pos.get(keys[j]!)!;
        const wide = kindOf.get(keys[i]!) === "offering" || kindOf.get(keys[j]!) === "offering" ? 170 : 140;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) >= wide || Math.abs(dy) >= 46) continue;
        moved = true;
        // Separate along the cheaper direction.
        if ((wide - Math.abs(dx)) / wide < (46 - Math.abs(dy)) / 46) {
          const push = (wide - Math.abs(dx)) / 2 + 1;
          const s = dx >= 0 ? 1 : -1;
          a.x -= s * push;
          b.x += s * push;
        } else {
          const push = (46 - Math.abs(dy)) / 2 + 1;
          const s = dy >= 0 ? 1 : -1;
          a.y -= s * push;
          b.y += s * push;
        }
        for (const p of [a, b]) {
          p.x = Math.min(width - MARGIN.x, Math.max(MARGIN.x, p.x));
          p.y = Math.min(height - MARGIN.bottom, Math.max(MARGIN.top, p.y));
        }
      }
    }
    if (!moved) break;
  }
  for (const p of pos.values()) {
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }
  return pos;
}
