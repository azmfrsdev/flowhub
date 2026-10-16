import { Briefcase, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { Opportunity, type StageKey } from "@/lib/schema";
import { cn } from "cn";
import { db } from "@/server/firebase/admin";
import { getWorkspaceGraph } from "@/server/graph/read";
import { getHubContext } from "@/server/workspace/access";
import { ScoreBadge } from "./[id]/shared";

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
  const [{ status }, { workspace }, graph] = await Promise.all([searchParams, getHubContext(), getWorkspaceGraph()]);
  const snap = await db().collection(`workspaces/${workspace.id}/opportunities`).where("deletedAt", "==", null).get();
  const all = snap.docs.flatMap((doc) => {
    const parsed = Opportunity.safeParse(doc.data());
    return parsed.success ? [parsed.data] : [];
  });
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filter = STATUSES.find((value) => value === status) ?? null;
  const rows = filter ? all.filter((opp) => opp.status === filter) : all;
  const names = new Map(graph.offerings.map((offering) => [offering.id, offering.name]));
  const updated = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
        <Briefcase aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="font-semibold">No opportunities yet</p>
        <p className="max-w-lg text-sm text-muted-foreground">
          Paste a meeting invite, an email or a company website. FlowHub researches the prospect with cited sources, maps their needs to what you sell and prices it from your own rate cards. You approve every step.
        </p>
        <Button asChild>
          <Link href="/opportunities/new">New opportunity</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-1 self-start rounded-lg bg-muted p-1 text-sm">
        <FilterLink href="/opportunities" active={!filter}>
          All · {all.length}
        </FilterLink>
        {STATUSES.map((value) => {
          const count = all.filter((opp) => opp.status === value).length;
          return count ? (
            <FilterLink key={value} href={`/opportunities?status=${value}`} active={filter === value}>
              <span className="capitalize">{value.replace("_", " ")}</span> · {count}
            </FilterLink>
          ) : null;
        })}
      </nav>
      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Prospect</th>
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
                    <Link href={`/opportunities/${opp.id}`} className="font-semibold text-primary hover:underline">
                      {opp.prospect?.name ?? "New opportunity"}
                    </Link>
                    <div className="text-xs text-muted-foreground">{opp.contact ? `Contact: ${opp.contact.name}` : (opp.prospect?.website ?? "")}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{opp.intakeType === "told" ? "Told to FlowHub" : opp.intakeType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">{opp.interestedOfferingIds.map((id) => names.get(id)).filter(Boolean).join(", ") || <span className="text-muted-foreground">Not said</span>}</td>
                  <td className="px-4 py-3">
                    <span role="img" aria-label={MARKS.map(({ key, label }) => `${label} ${STATE_WORDS[opp.stages[key].state]}`).join(", ")} className="flex gap-1">
                      {MARKS.map(({ key, letter }) => (
                        <span key={key} aria-hidden="true" className={cn("grid size-5 place-items-center rounded-md font-mono text-[10px] font-bold", MARK_TONE[opp.stages[key].state])}>
                          {letter}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {waiting ? <b>{GATE[waiting.key]}</b> : failed ? `Retry ${failed.label}` : running ? `The agents are on ${running.label}` : opp.outcome ? <span className="capitalize">{opp.outcome.result.replace("_", " ")}</span> : "—"}
                  </td>
                  <td className="px-4 py-3">{opp.score !== null && opp.recommendation ? <ScoreBadge value={opp.score} band={opp.recommendation} /> : <span className="text-muted-foreground">Not yet</span>}</td>
                  <td className="px-4 py-3">{opp.createdBy}</td>
                  <td className="px-4 py-3 text-muted-foreground">{updated.format(new Date(opp.updatedAt))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
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
