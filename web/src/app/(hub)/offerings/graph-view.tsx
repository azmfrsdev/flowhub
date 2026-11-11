"use client";

import { ExternalLink, FileText, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalcMarker } from "@/components/flowhub/markers";
import type { FitStrength, GraphEdge, GraphNode, GraphNodeKind, PlacedGraph } from "@/lib/offerings/graph-model";
import { cn } from "cn";

/**
 * The offering graph view (PRD FR-OG-12, ADR-0018). Read-only: every node
 * opens with its source or who entered it, and a deal's fit map can be laid
 * over it. The data is a cost-free projection laid out on the server.
 */

const KINDS: { kind: GraphNodeKind; label: string }[] = [
  { kind: "offering", label: "Offerings" },
  { kind: "proof", label: "Results" },
  { kind: "rule", label: "Not included" },
  { kind: "partner", label: "Partners" },
  { kind: "document", label: "Documents" },
  { kind: "deal", label: "Deals" },
];
const KIND_NAME: Record<GraphNodeKind, string> = { offering: "Offering", proof: "Result you can cite", rule: "Not included", partner: "Partner", document: "Document", deal: "Deal" };
const EDGE_NAME: Record<GraphEdge["kind"], string> = { part_of: "part of", partner: "works with", result: "result", not_included: "not included", covers: "covers it", source: "source", deal: "interested" };
const FIT: Record<FitStrength, { label: string; stroke: string; chip: string }> = {
  strong: { label: "Strong", stroke: "var(--fit-strong)", chip: "bg-fit-strong-soft text-fit-strong" },
  partial: { label: "Partial", stroke: "var(--fit-partial)", chip: "bg-fit-partial-soft text-fit-partial" },
  weak: { label: "Weak", stroke: "var(--fit-weak)", chip: "bg-fit-weak-soft text-fit-weak" },
  cannot: { label: "Cannot meet", stroke: "var(--fit-cannot)", chip: "bg-fit-cannot-soft text-fit-cannot" },
};
const BAND: Record<string, string> = { go: "Go", consider: "Consider", nogo: "No-go" };

const short = (text: string, max = 24) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export function GraphView({ data }: { data: PlacedGraph }) {
  const byId = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const [hidden, setHidden] = useState<Set<GraphNodeKind>>(new Set());
  const [selected, setSelected] = useState<string | null>(data.nodes.find((node) => node.kind === "offering")?.id ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [lensId, setLensId] = useState("");
  const lens = data.lenses.find((item) => item.opportunityId === lensId) ?? null;

  const shown = data.nodes.filter((node) => !hidden.has(node.kind));
  const shownIds = new Set(shown.map((node) => node.id));
  const edges = data.edges.filter((edge) => shownIds.has(edge.from) && shownIds.has(edge.to));

  // The fit lens: which nodes light up, and in which colour (the strongest wins when a node meets several needs).
  const lit = useMemo(() => {
    if (!lens) return null;
    const rank: FitStrength[] = ["cannot", "strong", "partial", "weak"];
    const map = new Map<string, FitStrength>();
    for (const need of lens.needs)
      for (const key of need.nodeIds) {
        const current = map.get(key);
        if (!current || rank.indexOf(need.fit) < rank.indexOf(current)) map.set(key, need.fit);
      }
    return map;
  }, [lens]);
  const lensDeal = lens ? `deal:${lens.opportunityId}` : null;
  const focus = hover ?? (lens ? null : selected);
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (!focus) return set;
    set.add(focus);
    for (const edge of data.edges) {
      if (edge.from === focus) set.add(edge.to);
      if (edge.to === focus) set.add(edge.from);
    }
    return set;
  }, [focus, data.edges]);

  const isLit = (key: string) => !lit || lit.has(key) || key === lensDeal;
  const toggle = (kind: GraphNodeKind) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map(({ kind, label }) => {
          const count = data.nodes.filter((node) => node.kind === kind).length;
          if (!count) return null;
          const on = !hidden.has(kind);
          return (
            <label key={kind} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold", on ? "border-ink bg-card" : "border-ink/20 text-muted-foreground")}>
              <input type="checkbox" className="accent-ink" checked={on} onChange={() => toggle(kind)} />
              <Swatch kind={kind} />
              {label} · {count}
            </label>
          );
        })}
        <span className="flex-1" />
        {data.lenses.length ? (
          <label className="flex items-center gap-2 text-xs font-semibold">
            Lay a fit map over it
            <select
              value={lensId}
              onChange={(event) => setLensId(event.target.value)}
              className="rounded-lg border-2 border-ink bg-card px-2 py-1 text-xs font-semibold"
            >
              <option value="">None</option>
              {data.lenses.map((item) => (
                <option key={item.opportunityId} value={item.opportunityId}>
                  {item.prospect}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="overflow-x-auto rounded-xl border-2 border-ink bg-card shadow-comic">
            <svg viewBox={`0 0 ${data.size.width} ${data.size.height}`} role="img" aria-label="Your offering graph" className="block h-auto w-full min-w-[640px]">
              <g>
                {edges.map((edge, index) => {
                  const a = data.positions[edge.from]!;
                  const b = data.positions[edge.to]!;
                  const hot = lit ? isLit(edge.from) && isLit(edge.to) : focus !== null && (edge.from === focus || edge.to === focus);
                  const faded = lit ? !hot : hover !== null && !hot;
                  return (
                    <line
                      key={index}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      strokeWidth={hot ? 2.6 : 1.4}
                      strokeDasharray={edge.kind === "covers" || edge.kind === "deal" ? "6 5" : undefined}
                      className={cn("transition-opacity motion-reduce:transition-none", hot ? "stroke-ink" : "stroke-ink/25", faded && "opacity-15")}
                    />
                  );
                })}
              </g>
              {shown.map((node) => {
                const p = data.positions[node.id]!;
                const faded = lit ? !isLit(node.id) : hover !== null && !neighbours.has(node.id);
                const fit = lit?.get(node.id);
                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${KIND_NAME[node.kind]}: ${node.label}`}
                    aria-pressed={selected === node.id}
                    onClick={() => {
                      setSelected(node.id);
                      setLensId("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(node.id);
                        setLensId("");
                      }
                    }}
                    onMouseEnter={() => setHover(node.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(node.id)}
                    onBlur={() => setHover(null)}
                    className={cn("cursor-pointer outline-none transition-opacity motion-reduce:transition-none [&:focus-visible_.fh-ring]:stroke-link", faded && "opacity-20")}
                  >
                    <title>{`${KIND_NAME[node.kind]}: ${node.label}`}</title>
                    {fit ? <circle cx={p.x} cy={p.y} r={node.kind === "offering" ? 32 : 24} fill="none" stroke={FIT[fit].stroke} strokeWidth={4} strokeDasharray={fit === "cannot" ? "5 4" : undefined} /> : null}
                    <circle className="fh-ring" cx={p.x} cy={p.y} r={node.kind === "offering" ? 30 : 22} fill="transparent" stroke="transparent" strokeWidth={3} />
                    <Shape node={node} x={p.x} y={p.y} selected={selected === node.id && !lens} />
                    <text
                      x={p.x}
                      y={p.y + (node.kind === "offering" ? (node.sub ? 30 : 38) : 30)}
                      textAnchor="middle"
                      className={cn("fill-foreground font-sans", node.kind === "offering" ? "text-[13px] font-bold" : "text-[11.5px] font-semibold")}
                      style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 4, strokeLinejoin: "round" }}
                    >
                      {short(node.label, node.kind === "offering" ? 28 : 22)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <Legend />
        </div>
        <aside aria-live="polite" className="flex min-w-0 flex-col gap-3 rounded-xl border-2 border-ink bg-card px-4 py-4 text-sm shadow-comic">
          {lens ? <LensPanel lens={lens} byId={byId} /> : selected && byId.get(selected) ? <NodePanel node={byId.get(selected)!} edges={data.edges} byId={byId} onPick={setSelected} /> : <p className="text-muted-foreground">Pick anything in the graph to see where it came from.</p>}
        </aside>
      </div>
    </div>
  );
}

function Shape({ node, x, y, selected }: { node: GraphNode; x: number; y: number; selected: boolean }) {
  const stroke = { stroke: "var(--ink)", strokeWidth: selected ? 3.5 : 2 };
  switch (node.kind) {
    case "offering": {
      const r = node.sub ? 15 : 22;
      return (
        <>
          <circle cx={x + 3} cy={y + 3} r={r} fill="var(--ink)" />
          <circle cx={x} cy={y} r={r} fill="var(--primary)" {...stroke} />
        </>
      );
    }
    case "proof":
      return <rect x={x - 11} y={y - 11} width={22} height={22} rx={5} fill={node.isPublic ? "var(--fit-strong-soft)" : "var(--private-soft)"} strokeDasharray={node.isPublic ? undefined : "4 3"} {...stroke} />;
    case "rule":
      return <path d={`M${x} ${y - 14} L${x + 14} ${y} L${x} ${y + 14} L${x - 14} ${y}Z`} fill="var(--fit-cannot-soft)" {...stroke} />;
    case "partner":
      return <circle cx={x} cy={y} r={14} fill="var(--claim-research-soft)" {...stroke} />;
    case "document":
      return <path d={`M${x - 9} ${y - 12} H${x + 4} L${x + 9} ${y - 7} V${y + 12} H${x - 9}Z`} fill="var(--card)" {...stroke} />;
    case "deal":
      return <circle cx={x} cy={y} r={13} fill="var(--attention-soft)" strokeDasharray={node.dealStatus === "lost" || node.dealStatus === "no_decision" ? "4 3" : undefined} {...stroke} />;
  }
}

function Swatch({ kind }: { kind: GraphNodeKind }) {
  return (
    <svg width="14" height="14" viewBox="0 0 28 28" aria-hidden="true">
      <Shape node={{ id: "", kind, label: "", summary: "", href: null, sources: [], provenance: null, isPublic: true }} x={14} y={14} selected={false} />
    </svg>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 28 28" aria-hidden="true">
          <rect x={3} y={3} width={22} height={22} rx={5} fill="var(--private-soft)" stroke="var(--ink)" strokeWidth={2} strokeDasharray="4 3" />
        </svg>
        Dashed result: not public, never cited
      </span>
      <span>– – dashed line: a partner covers it, or a deal is interested</span>
      <span>Hover to see what links to what. Laid out by code, the same each time.</span>
    </p>
  );
}

function NodePanel({ node, edges, byId, onPick }: { node: GraphNode; edges: GraphEdge[]; byId: Map<string, GraphNode>; onPick: (key: string) => void }) {
  const links = edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .map((edge) => ({ other: byId.get(edge.from === node.id ? edge.to : edge.from)!, kind: edge.kind }))
    .filter((link) => link.other);
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
          <Swatch kind={node.kind} />
          {KIND_NAME[node.kind]}
          {node.sub ? " · sub-offering" : ""}
        </span>
        <h3 className="fh-hand text-xl leading-tight">{node.label}</h3>
        {node.summary ? <p className="text-muted-foreground">{node.summary}</p> : null}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {node.sources.length ? (
          <>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="flex flex-wrap gap-1">
              {node.sources.map((source) => (
                <span key={source} className="inline-flex items-center gap-1 rounded-md border border-link/30 bg-claim-research-soft px-1.5 text-xs text-link">
                  <FileText aria-hidden="true" className="size-3" />
                  {source}
                </span>
              ))}
            </dd>
          </>
        ) : null}
        {node.provenance ? (
          <>
            <dt className="text-muted-foreground">Who</dt>
            <dd>{node.provenance}</dd>
          </>
        ) : null}
        {node.kind === "proof" ? (
          <>
            <dt className="text-muted-foreground">Citable</dt>
            <dd>{node.isPublic ? <span className="rounded-full bg-fit-strong-soft px-2 text-xs font-semibold text-fit-strong">Public: may be cited</span> : <span className="rounded-full bg-private-soft px-2 text-xs font-semibold text-private">Not public: never cited</span>}</dd>
          </>
        ) : null}
        {node.kind === "partner" ? (
          <>
            <dt className="text-muted-foreground">Kind</dt>
            <dd className="capitalize">{node.relationship}</dd>
            {node.privateBuyPrice ? (
              <>
                <dt className="text-muted-foreground">Buy price</dt>
                <dd className="flex items-center gap-1 text-private">
                  <Lock aria-hidden="true" className="size-3.5" />
                  Private: never sent to an agent
                </dd>
              </>
            ) : null}
          </>
        ) : null}
        {node.kind === "deal" ? (
          <>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{node.dealStatus?.replace("_", " ")}</dd>
            {node.score ? (
              <>
                <dt className="text-muted-foreground">Go/no-go</dt>
                <dd className="flex items-center gap-1.5">
                  {node.score.value} · {BAND[node.score.band] ?? node.score.band}
                  <CalcMarker>Calculated</CalcMarker>
                </dd>
              </>
            ) : null}
          </>
        ) : null}
      </dl>
      {links.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">Linked to</span>
          <ul className="flex flex-col gap-0.5 text-[13px]">
            {links.map(({ other, kind }) => (
              <li key={`${other.id}-${kind}`}>
                <button type="button" onClick={() => onPick(other.id)} className="text-left text-link underline-offset-2 hover:underline">
                  {other.label}
                </button>
                <span className="text-xs text-muted-foreground"> · {EDGE_NAME[kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {node.href ? (
        <Link href={node.href} className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-ink bg-primary px-3 py-1 text-xs font-semibold shadow-comic-sm">
          {node.kind === "deal" ? "Open the deal room" : node.kind === "offering" ? "Open the offering page" : "Open where it lives"}
          <ExternalLink aria-hidden="true" className="size-3" />
        </Link>
      ) : null}
    </>
  );
}

/** Where a need lands: the offerings it maps to, or for Cannot meet the scope rule and the partner that covers it. */
function lensTarget(need: PlacedGraph["lenses"][number]["needs"][number], byId: Map<string, GraphNode>): string {
  const names = (kind: GraphNodeKind) => need.nodeIds.map((key) => byId.get(key)).filter((node): node is GraphNode => node?.kind === kind).map((node) => node.label);
  if (need.fit === "cannot") {
    const [rule] = names("rule");
    const partner = names("partner")[0];
    return `${rule ? `Not included: ${rule}` : "Not included"}${partner ? `. ${partner} covers it` : ". No partner recorded"}`;
  }
  return names("offering").join(" and ") || "nothing in the hub";
}

function LensPanel({ lens, byId }: { lens: PlacedGraph["lenses"][number]; byId: Map<string, GraphNode> }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">Fit map from Gate C</span>
        <h3 className="fh-hand text-xl leading-tight">{lens.prospect}</h3>
        {lens.score ? (
          <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
            Go/no-go {lens.score.value} · {BAND[lens.score.band] ?? lens.score.band}
            <CalcMarker>Calculated</CalcMarker>
          </p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {lens.needs.map((need) => (
          <li key={need.text} className="flex flex-col gap-0.5 border-b border-dashed border-ink/15 pb-2 text-[13px] last:border-b-0">
            <span className="flex items-start justify-between gap-2">
              <span>{need.text}</span>
              <span className={cn("shrink-0 rounded-full px-2 text-[11px] font-semibold", FIT[need.fit].chip)}>{FIT[need.fit].label}</span>
            </span>
            <span className="text-xs text-muted-foreground">→ {lensTarget(need, byId)}</span>
          </li>
        ))}
      </ul>
      <Link href={`/opportunities/${lens.opportunityId}`} className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-ink bg-primary px-3 py-1 text-xs font-semibold shadow-comic-sm">
        Open the deal room
        <ExternalLink aria-hidden="true" className="size-3" />
      </Link>
    </>
  );
}
