import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { Opportunity, type StageKey } from "@/lib/schema";
import { cn } from "cn";
import { db } from "@/server/firebase/admin";
import { getWorkspaceGraph } from "@/server/graph/read";
import { getHubContext } from "@/server/workspace/access";
import { INTAKE_LABEL, ScoreBadge } from "./[id]/shared";

export const metadata: Metadata = { title: "Opportunities" };

const STATUSES = ["new", "researching", "proposing", "sent", "won", "lost", "no_decision"] as const;
const MARKS: { key: StageKey; letter: string; label: string }[] = [
  { key: "intake", letter: "I", label: "intake" },
  { key: "research", letter: "R", label: "research" },
  { key: "fit", letter: "F", label: "fit and pricing" },
  { key: "write", letter: "W", label: "write and review" },
];
const MARK_TONE: Record<string, string> = {
  approved: "bg-fit-strong text-white",
  waiting: "bg-attention text-white",
  running: "bg-ai text-white animate-pulse",
  failed: "bg-destructive text-white",
  stale: "bg-muted text-muted-foreground line-through",
  idle: "border text-muted-foreground",
};
const STATE_WORDS: Record<string, string> = { approved: "approved", waiting: "waiting for you", running: "running", failed: "failed", stale: "out of date", idle: "not started" };
const GATE: Record<StageKey, string> = { intake: "Gate A: confirm the prospect", research: "Gate B: approve the brief", fit: "Gate C: approve the fit", write: "Gate D: finalise" };
const PERSONA = { sme: "SME", startup: "Startup", enterprise: "Enterprise" } as const;
const STATUS_TONE: Record<string, string> = {
  won: "bg-fit-strong-soft text-fit-strong",
  lost: "bg-destructive/10 text-destructive",
  no_decision: "bg-muted text-muted-foreground",
  sent: "bg-ai-soft text-ai",
};
/** A text symbol on each mark, so its state never rests on colour alone (FR-MRK-1). */
const MARK_SYMBOL: Record<string, string> = { approved: "✓", waiting: "!", running: "…", failed: "×", stale: "~", idle: "" };

/** FR-OPP-1 to FR-OPP-4: every deal, and what the agents have done on it. */
export default function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground">Every deal and what the agents have done on it. A person approves each stage before the next one starts.</p>
        </div>
        <Button asChild>
          <Link href="/opportunities/new">
            <Plus aria-hidden="true" />
            New opportunity
          </Link>
        </Button>
      </div>
      <Suspense fallback={<TabFallback label="Loading opportunities" />}>
        <Table searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Table({ searchParams }: { searchParams: PageProps<"/opportunities">["searchParams"] }) {
  const [params, { workspace }, graph] = await Promise.all([searchParams, getHubContext(), getWorkspaceGraph()]);
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const status = one(params.status);
  const snap = await db().collection(`workspaces/${workspace.id}/opportunities`).where("deletedAt", "==", null).get();
  const all = snap.docs.flatMap((doc) => {
    const parsed = Opportunity.safeParse(doc.data());
    return parsed.success ? [parsed.data] : [];
  });
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // FR-OPP-3: filter by status, persona and owner. Persona and owner filters show only when there's a choice.
  const filter = STATUSES.find((value) => value === status) ?? null;
  const personas = [...new Set(all.map((opp) => opp.persona))];
  const owners = [...new Set(all.map((opp) => opp.createdBy))].sort();
  const persona = personas.find((value) => value === one(params.persona)) ?? null;
  const owner = owners.find((value) => value === one(params.owner)) ?? null;
  const rows = all.filter((opp) => (!filter || opp.status === filter) && (!persona || opp.persona === persona) && (!owner || opp.createdBy === owner));
  const href = (next: { status?: string | null; persona?: string | null; owner?: string | null }) => {
    const query = new URLSearchParams();
    const merged = { status: filter, persona, owner, ...next };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, value);
    const text = query.toString();
    return text ? `/opportunities?${text}` : "/opportunities";
  };
  const names = new Map(graph.offerings.map((offering) => [offering.id, offering.name]));
  const updated = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

  if (all.length === 0) {
    return (
      <EmptyState
        title="No opportunities yet"
        action={
          <Button asChild>
            <Link href="/opportunities/new">New opportunity</Link>
          </Button>
        }
      >
        Paste a meeting invite, an email or a company website. FlowHub researches the prospect, maps their needs to what you sell and prices it. You approve every step.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 self-start rounded-lg bg-muted p-1 text-sm">
          <FilterLink href={href({ status: null })} active={!filter}>
            All · {all.length}
          </FilterLink>
          {STATUSES.map((value) => {
            const count = all.filter((opp) => opp.status === value).length;
            return count ? (
              <FilterLink key={value} href={href({ status: value })} active={filter === value}>
                <span className="capitalize">{value.replace("_", " ")}</span> · {count}
              </FilterLink>
            ) : null;
          })}
        </nav>
        {personas.length > 1 ? (
          <nav aria-label="Filter by persona" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
            <FilterLink href={href({ persona: null })} active={!persona}>
              Any persona
            </FilterLink>
            {personas.map((value) => (
              <FilterLink key={value} href={href({ persona: value })} active={persona === value}>
                {PERSONA[value]}
              </FilterLink>
            ))}
          </nav>
        ) : null}
        {owners.length > 1 ? (
          <nav aria-label="Filter by owner" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
            <FilterLink href={href({ owner: null })} active={!owner}>
              Anyone
            </FilterLink>
            {owners.map((value) => (
              <FilterLink key={value} href={href({ owner: value })} active={owner === value}>
                {value}
              </FilterLink>
            ))}
          </nav>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">Newest update first</span>
      </div>
      <section className="overflow-x-auto rounded-xl border-2 border-ink bg-card shadow-comic">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Prospect</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Came in as</th>
              <th className="px-4 py-2.5 font-semibold">Interested in</th>
              <th className="px-4 py-2.5 font-semibold">AI work</th>
              <th className="px-4 py-2.5 font-semibold">Next step</th>
              <th className="px-4 py-2.5 font-semibold">Go/no-go</th>
              <th className="px-4 py-2.5 font-semibold">Owner</th>
              <th className="px-4 py-2.5 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((opp) => {
              const waiting = MARKS.find(({ key }) => opp.stages[key].state === "waiting");
              const failed = MARKS.find(({ key }) => opp.stages[key].state === "failed");
              const running = MARKS.find(({ key }) => opp.stages[key].state === "running");
              return (
                <tr key={opp.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/opportunities/${opp.id}`} className="font-semibold text-link hover:underline">
                      {opp.prospect?.name ?? "New opportunity"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {PERSONA[opp.persona]}
                      {opp.contact ? ` · Contact: ${opp.contact.name}` : opp.prospect?.website ? ` · ${opp.prospect.website}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-px text-xs font-semibold whitespace-nowrap capitalize", STATUS_TONE[opp.status] ?? "border text-muted-foreground")}>{opp.status.replace("_", " ")}</span>
                    {opp.value ? <div className="mt-1 font-mono text-xs">{opp.value}</div> : null}
                  </td>
                  <td className="px-4 py-3">{INTAKE_LABEL[opp.intakeType]}</td>
                  <td className="px-4 py-3">{opp.interestedOfferingIds.map((id) => names.get(id)).filter(Boolean).join(", ") || <span className="text-muted-foreground">Not said</span>}</td>
                  <td className="px-4 py-3">
                    <span role="img" aria-label={MARKS.map(({ key, label }) => `${label} ${STATE_WORDS[opp.stages[key].state]}`).join(", ")} className="flex gap-1">
                      {MARKS.map(({ key, letter }) => (
                        <span key={key} aria-hidden="true" title={`${key}: ${STATE_WORDS[opp.stages[key].state]}`} className={cn("grid h-5 min-w-5 place-items-center rounded-md px-0.5 font-mono text-[10px] font-bold", MARK_TONE[opp.stages[key].state])}>
                          {letter}
                          {MARK_SYMBOL[opp.stages[key].state]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {opp.outcome ? <span className="capitalize">{opp.outcome.result.replace("_", " ")}</span> : waiting ? <b>{GATE[waiting.key]}</b> : failed ? `Retry ${failed.label}` : running ? `The agents are on ${running.label}` : "—"}
                  </td>
                  <td className="px-4 py-3">{opp.score !== null && opp.recommendation ? <ScoreBadge value={opp.score} band={opp.recommendation} /> : <span className="text-muted-foreground">Not yet</span>}</td>
                  <td className="px-4 py-3">{opp.createdBy}</td>
                  <td className="px-4 py-3 text-muted-foreground">{updated.format(new Date(opp.updatedAt))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">No opportunities match these filters.</p> : null}
      </section>
      <p aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          <b>AI work:</b> I intake, R research, F fit and pricing, W write and review.
        </span>
        {(["approved", "waiting", "running", "failed", "stale", "idle"] as const).map((state) => (
          <span key={state} className="flex items-center gap-1">
            <span className={cn("grid h-4 min-w-4 place-items-center rounded px-0.5 font-mono text-[9px] font-bold", MARK_TONE[state])}>{MARK_SYMBOL[state] || "·"}</span>
            {STATE_WORDS[state]}
          </span>
        ))}
      </p>
    </>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("rounded-md px-3 py-1", active ? "bg-card font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}
