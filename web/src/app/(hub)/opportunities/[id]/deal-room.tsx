"use client";

import { AlertTriangle, Calculator, CheckCircle2, Circle, Loader2, RotateCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { DraftContext } from "@/lib/deal-room/draft";
import type { BriefOutput, FitOutput, IntakeOutput, Opportunity, Run, RunEvent, StageKey, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { retryStage } from "./actions";
import { type Catalogue, Panel, ScoreBadge } from "./shared";
import { BriefView } from "./brief-view";
import { FitView } from "./fit-view";
import { IntakeView } from "./stage-views";
import { WriteView } from "./write-view";

const STAGES: { key: StageKey; label: string; gate: string }[] = [
  { key: "intake", label: "Intake", gate: "Gate A" },
  { key: "research", label: "Research", gate: "Gate B" },
  { key: "fit", label: "Fit and pricing", gate: "Gate C" },
  { key: "write", label: "Write and review", gate: "Gate D" },
];
const STALL_MS = 3 * 60 * 1000;

function duration(ms?: number) {
  if (!ms) return null;
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function DealRoom({
  workspaceId,
  initial,
  initialRuns,
  catalogue,
  canEdit,
  seller,
  titles,
}: {
  workspaceId: string;
  initial: Opportunity;
  initialRuns: Record<string, Run>;
  catalogue: Catalogue;
  canEdit: boolean;
  seller: string;
  titles: Record<string, string>;
}) {
  const oppPath = `workspaces/${workspaceId}/opportunities/${initial.id}`;
  const { data: live, status } = useLiveDoc<Opportunity>(oppPath, initial);
  const opp = live ?? initial;
  const active = STAGES.find(({ key }) => ["running", "waiting", "failed"].includes(opp.stages[key].state))?.key ?? [...STAGES].reverse().find(({ key }) => opp.stages[key].state !== "idle")?.key ?? "intake";
  const [chosen, setChosen] = useState<StageKey | null>(null);
  const selected = chosen ?? active;
  const runId = opp.stages[selected].currentRunId;
  const runPath = runId ? `${oppPath}/runs/${runId}` : null;
  const { data: run } = useLiveDoc<Run>(runPath, runId ? (initialRuns[runId] ?? null) : null);
  const events = useLiveCollection<RunEvent>(runPath ? `${runPath}/events` : null, "seq");

  // A deal closed before its deal room was used shows only its outcome (PRD section 10 sample history).
  const recordOnly = Boolean(opp.outcome) && STAGES.every(({ key }) => opp.stages[key].state === "idle");

  // The draft renders from the approved fit and research runs it was written from.
  const upstream = run?.stage === "write" ? run.inputs.upstreamRunIds : null;
  const fitRun = initialRuns[upstream?.fit ?? opp.stages.fit.currentRunId ?? ""];
  const researchRun = initialRuns[upstream?.research ?? opp.stages.research.currentRunId ?? ""];
  const draft: DraftContext | null =
    fitRun?.working && researchRun?.working
      ? {
          prospect: opp.prospect?.name ?? "the prospect",
          seller,
          date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(run?.startedAt ?? opp.updatedAt)),
          titles,
          lines: (fitRun.working as FitOutput).pricing.lines,
          brief: researchRun.working as BriefOutput,
        }
      : null;

  // Follow the flow: when a new stage starts running, show it.
  const [lastActive, setLastActive] = useState(active);
  if (active !== lastActive) {
    setLastActive(active);
    setChosen(null);
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted-foreground">
        <Link href="/opportunities" className="text-primary hover:underline">
          Opportunities
        </Link>
        <span aria-hidden="true">/</span>
        <span>{opp.prospect?.name ?? "New opportunity"}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{opp.prospect?.name ?? "New opportunity"}</h1>
            <span className="rounded-full border px-2 py-px text-xs font-semibold text-muted-foreground capitalize">{opp.status.replace("_", " ")}</span>
            {opp.score !== null && opp.recommendation ? <ScoreBadge value={opp.score} band={opp.recommendation} /> : null}
            {opp.latestDoc ? (
              <a href={opp.latestDoc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-fit-strong-soft px-2.5 py-px text-xs font-semibold text-fit-strong no-underline hover:underline">
                Proposal in Google Docs ↗
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {opp.prospect?.website ? <span>{opp.prospect.website}</span> : null}
            {opp.nextMeeting ? (
              <span>
                Meeting <b className="text-foreground">{opp.nextMeeting}</b>
              </span>
            ) : null}
            {opp.contact ? (
              <span>
                Contact <b className="text-foreground">{opp.contact.name}</b>
                {opp.contact.role ? `, ${opp.contact.role}` : ""}
              </span>
            ) : null}
            <span>Added by {opp.createdBy}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <AiMarker>AI drafted</AiMarker>
          <CalcMarker>Calculated by code</CalcMarker>
          <PersonMarker name="A person decided" />
          {status === "paused" ? <span className="text-xs text-attention">Live updates paused. Reload to refresh.</span> : null}
        </div>
      </div>

      {opp.outcome ? <OutcomeBanner outcome={opp.outcome} value={opp.value} recordOnly={recordOnly} /> : null}
      {recordOnly ? null : (
        <>
      <nav aria-label="Deal room stages" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STAGES.map(({ key, label, gate }, index) => {
          const stage = opp.stages[key];
          const stageRun = stage.currentRunId ? (stage.currentRunId === runId ? run : initialRuns[stage.currentRunId]) : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setChosen(key)}
              aria-current={selected === key ? "step" : undefined}
              disabled={stage.state === "idle"}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors disabled:cursor-default disabled:opacity-60",
                selected === key && "border-primary ring-2 ring-primary/20",
                stage.state === "waiting" && "bg-attention-soft/40",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <StageIcon state={stage.state} index={index + 1} />
                {label}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {stage.state === "running" ? "Agents working…" : null}
                {stage.state === "waiting" ? <span className="rounded-full bg-attention-soft px-2 font-semibold text-attention">Your turn: {gate}</span> : null}
                {stage.state === "approved" ? `${gate} passed${stageRun?.approvedBy ? ` by ${stageRun.approvedBy}` : ""}` : null}
                {stage.state === "failed" ? <span className="font-semibold text-destructive">Failed, can be retried</span> : null}
                {stage.state === "stale" ? "Out of date: an earlier stage changed" : null}
                {stage.state === "idle" ? "Not started" : null}
                {stageRun?.metrics?.ms && stage.state !== "running" ? <span>· {duration(stageRun.metrics.ms)}</span> : null}
              </span>
            </button>
          );
        })}
      </nav>

      {run?.state === "running" ? (
        // While the agents work, the log is the main thing to watch.
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <StagePanel opp={opp} stage={selected} run={run} catalogue={catalogue} canEdit={canEdit} draft={draft} />
          <ProgressLog events={events} running />
        </div>
      ) : (
        // Once it's your turn, the stage gets the full width and the log folds away.
        <>
          {events.length ? <LogDisclosure events={events} run={run} /> : null}
          <StagePanel opp={opp} stage={selected} run={run} catalogue={catalogue} canEdit={canEdit} draft={draft} />
        </>
      )}
        </>
      )}
    </>
  );
}

const OUTCOME = {
  won: { label: "Won", tone: "bg-fit-strong-soft text-fit-strong" },
  lost: { label: "Lost", tone: "bg-destructive/10 text-destructive" },
  no_decision: { label: "No decision", tone: "bg-muted text-muted-foreground" },
} as const;

/** FR-OPP-2: how a deal ended, who recorded it and why. A deal closed before its deal room was used has no stages to show. */
function OutcomeBanner({ outcome, value, recordOnly }: { outcome: NonNullable<Opportunity["outcome"]>; value: string | null; recordOnly: boolean }) {
  const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(outcome.at));
  return (
    <section aria-label="Outcome" className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-full px-2.5 py-px text-xs font-bold", OUTCOME[outcome.result].tone)}>{OUTCOME[outcome.result].label}</span>
        <span>
          on <b>{when}</b>
          {value ? <> · <b className="font-mono">{value}</b></> : null}
        </span>
        <PersonMarker name={outcome.by} />
      </div>
      <p className="text-sm">{outcome.reason}</p>
      {outcome.note ? <p className="text-sm text-muted-foreground">{outcome.note}</p> : null}
      {recordOnly ? <p className="text-xs text-muted-foreground">This deal was closed before its deal room was used, so it has no stage history.</p> : null}
    </section>
  );
}

function LogDisclosure({ events, run }: { events: RunEvent[]; run: Run | null }) {
  const ai = events.filter((event) => event.actor.kind === "ai" && event.kind === "step").length;
  const calc = events.filter((event) => event.actor.kind === "calc" && event.kind !== "done").length;
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <b>What the agents did</b>
        <span className="text-muted-foreground">
          {ai} AI {ai === 1 ? "step" : "steps"} · {calc} calculated
          {run?.metrics?.ms ? ` · ${duration(run.metrics.ms)}` : ""}
          {run?.metrics?.groundedQueries ? ` · ${run.metrics.groundedQueries} Google searches` : ""}
        </span>
        <span className="ml-auto text-xs text-primary group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs text-primary group-open:inline">Hide</span>
      </summary>
      <div className="border-t">
        <LogList events={events} />
      </div>
    </details>
  );
}

function StagePanel({ opp, stage, run, catalogue, canEdit, draft }: { opp: Opportunity; stage: StageKey; run: Run | null; catalogue: Catalogue; canEdit: boolean; draft: DraftContext | null }) {
  if (!run) return <Panel>{stage === "write" ? "Approve the fit map at Gate C to write the proposal." : "This stage hasn't started yet."}</Panel>;
  if (run.state === "running") return <Running opp={opp} stage={stage} run={run} canEdit={canEdit} />;
  if (run.state === "failed")
    return (
      <Panel tone="error">
        <span className="flex items-center gap-2 font-semibold">
          <XCircle aria-hidden="true" className="size-4" />
          {run.error?.message ?? "This stage failed."}
        </span>
        {canEdit ? <RetryButton opportunityId={opp.id} stage={stage} /> : null}
      </Panel>
    );
  const editable = canEdit && run.state === "waiting";
  if (stage === "intake") return <IntakeView opp={opp} run={run} working={run.working as IntakeOutput} editable={editable} />;
  if (stage === "research") return <BriefView opp={opp} run={run} working={run.working as BriefOutput} editable={editable} />;
  if (stage === "fit") return <FitView opp={opp} run={run} working={run.working as FitOutput} catalogue={catalogue} editable={editable} canWrite={canEdit} />;
  if (stage === "write" && draft) return <WriteView opp={opp} run={run} working={run.working as WriteOutput} context={draft} editable={editable} />;
  return <Panel>The earlier stages behind this draft are no longer available. Re-run fit to write again.</Panel>;
}

function Running({ opp, stage, run, canEdit }: { opp: Opportunity; stage: StageKey; run: Run; canEdit: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const started = new Date(run.startedAt).getTime();
  const stalled = now - new Date(run.lastEventAt).getTime() > STALL_MS;
  return (
    <Panel>
      <span className="flex items-center gap-2 font-semibold">
        {stalled ? <AlertTriangle aria-hidden="true" className="size-4 text-attention" /> : <Loader2 aria-hidden="true" className="size-4 animate-spin text-ai" />}
        {stalled ? "No progress for 3 minutes. The run may have stalled." : "The agents are working. You can leave this page; the run carries on."}
      </span>
      <span className="text-sm text-muted-foreground">Running for {duration(Math.max(1000, now - started))}</span>
      {stalled && canEdit ? <RetryButton opportunityId={opp.id} stage={stage} /> : null}
    </Panel>
  );
}

function RetryButton({ opportunityId, stage }: { opportunityId: string; stage: StageKey }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryStage(opportunityId, stage);
            setError(result.error ?? null);
          })
        }
      >
        <RotateCw aria-hidden="true" />
        {pending ? "Starting…" : "Retry"}
      </Button>
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </span>
  );
}

function ProgressLog({ events, running }: { events: RunEvent[]; running: boolean }) {
  return (
    <section aria-labelledby="log" className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 id="log" className="font-bold">
          What the agents are doing
        </h2>
        {running ? <Loader2 aria-label="Running" className="size-4 animate-spin text-ai" /> : null}
      </div>
      {events.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">Starting…</p> : <LogList events={events} />}
    </section>
  );
}

function LogList({ events }: { events: RunEvent[] }) {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  return (
        <ol aria-live="polite" className="flex max-h-[60vh] flex-col overflow-x-hidden overflow-y-auto px-4 py-2 text-[13px] [overflow-wrap:anywhere]">
          {events.map((event) => (
            <li key={event.seq} className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)] gap-2 border-b border-dashed border-line-soft py-2 last:border-b-0">
              <time dateTime={event.at} className="text-muted-foreground tabular-nums">
                {time.format(new Date(event.at))}
              </time>
              <span className={cn("flex items-start gap-1.5", event.kind === "warning" && "text-attention", event.kind === "error" && "text-destructive")}>
                {event.actor.kind === "ai" ? (
                  <span className="mt-0.5 shrink-0 rounded bg-ai px-1 font-mono text-[9px] leading-4 font-bold text-white">AI</span>
                ) : (
                  <Calculator aria-label="Calculated by code" className="mt-0.5 size-3.5 shrink-0 text-calc" />
                )}
                {event.message}
              </span>
            </li>
          ))}
        </ol>
  );
}

function StageIcon({ state, index }: { state: string; index: number }) {
  if (state === "approved") return <CheckCircle2 aria-hidden="true" className="size-4 text-fit-strong" />;
  if (state === "running") return <Loader2 aria-hidden="true" className="size-4 animate-spin text-ai" />;
  if (state === "failed") return <XCircle aria-hidden="true" className="size-4 text-destructive" />;
  if (state === "waiting") return <span className="grid size-4 place-items-center rounded-full bg-attention text-[10px] font-bold text-white">{index}</span>;
  return <Circle aria-hidden="true" className="size-4 text-muted-foreground" />;
}

