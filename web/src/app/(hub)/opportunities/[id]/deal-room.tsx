"use client";

import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, ChevronDown, Circle, ExternalLink, HelpCircle, History, Loader2, LockOpen, MoreHorizontal, RotateCw, XCircle } from "lucide-react";
import Link from "next/link";
import { MENU_ITEM } from "@/components/flowhub/edit-dialog";
import { PageHeader } from "@/components/flowhub/page-header";
import { Fragment, useEffect, useState, useTransition } from "react";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { DraftContext } from "@/lib/deal-room/draft";
import type { BriefOutput, FitOutput, IntakeOutput, Meeting, Opportunity, PitchPrep, Quote, Run, RunEvent, StageKey, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { reopenGate, retryStage } from "./actions";
import { DealStatus } from "./deal-status";
import { GateSlot, GateSlotContext } from "./gate-parts";
import { type Catalogue, Panel, ScoreBadge } from "./shared";
import { BriefView } from "./brief-view";
import { FitView } from "./fit-view";
import { MeetingView } from "./meeting-view";
import { PrepView } from "./prep-view";
import { QUOTE_STATUS, QuoteView } from "./quote-view";
import { RehearsalView } from "./rehearsal-view";
import { ScheduleCard } from "./schedule-card";
import { meetingTopic } from "@/lib/calendar";
import { IntakeView } from "./stage-views";
import { WriteView } from "./write-view";
import { StartWriting, WriteSteps, stepsBeforeDraft } from "./forward-options";
import { GoogleLogo } from "@/components/flowhub/google-logo";

const STAGES: { key: StageKey; label: string; gate: string }[] = [
  { key: "intake", label: "Intake", gate: "Gate A" },
  { key: "research", label: "Research", gate: "Gate B" },
  { key: "fit", label: "Fit and pricing", gate: "Gate C" },
  { key: "write", label: "Write and review", gate: "Gate D" },
];
/** Steps E, F and G after Gate D (PRD 7.24, 7.25, 7.20; ADR-0016 D2, ADR-0019): no gate and no queued stage. */
const AFTER = [
  { key: "prep", label: "Pitch prep", letter: "E" },
  { key: "meeting", label: "Follow-up", letter: "F" },
  { key: "quote", label: "Quote", letter: "G" },
] as const;
/** The stage row reads as one flow in three phases, so it is clear what happens before, at and after the meeting. */
const PHASES: { label: string; steps: readonly Step[] }[] = [
  { label: "Build the proposal", steps: ["intake", "research", "fit", "write"] },
  { label: "Meet the buyer", steps: ["prep", "meeting"] },
  { label: "Close the deal", steps: ["quote"] },
];
type AfterKey = (typeof AFTER)[number]["key"];
type Step = StageKey | AfterKey;
const isAfter = (step: Step): step is AfterKey => step === "prep" || step === "meeting" || step === "quote";
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
  isOwner,
  seller,
  inviteFrom,
  titles,
  versions,
}: {
  workspaceId: string;
  initial: Opportunity;
  initialRuns: Record<string, Run>;
  catalogue: Catalogue;
  canEdit: boolean;
  isOwner: boolean;
  seller: string;
  /** The sales inbox invites go out from, when the Gmail script is connected (ADR-0020 D7). */
  inviteFrom: string | null;
  titles: Record<string, string>;
  versions: { runId: string; url: string; publishedAt: string; by: string | null }[];
}) {
  const oppPath = `workspaces/${workspaceId}/opportunities/${initial.id}`;
  const { data: live, status } = useLiveDoc<Opportunity>(oppPath, initial);
  const opp = live ?? initial;
  // FR-WRI-11: with Gate C passed and nothing written yet, Write and review is where the person goes next.
  const writeReady = opp.stages.fit.state === "approved" && opp.stages.write.state === "idle";
  const active = STAGES.find(({ key }) => ["running", "waiting", "failed"].includes(opp.stages[key].state))?.key ?? (writeReady ? "write" : undefined) ?? [...STAGES].reverse().find(({ key }) => opp.stages[key].state !== "idle")?.key ?? "intake";
  const [chosen, setChosen] = useState<Step | null>(null);
  // Where the current stage renders its main action, in the header (GateSlot).
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const step: Step = chosen ?? active;
  const after = isAfter(step) ? step : null;
  // Behind steps E and F, the stage log and run are the proposal's.
  const selected: StageKey = after ? "write" : (step as StageKey);
  const runId = opp.stages[selected].currentRunId;
  const runPath = runId ? `${oppPath}/runs/${runId}` : null;
  const { data: run } = useLiveDoc<Run>(runPath, runId ? (initialRuns[runId] ?? null) : null);
  const events = useLiveCollection<RunEvent>(runPath ? `${runPath}/events` : null, "seq");

  // Steps E and F open once a proposal is written; pitch prep also waits for every flagged claim to be decided.
  const writeRunId = opp.stages.write.currentRunId;
  const writeRun = writeRunId ? (run?.id === writeRunId ? run : initialRuns[writeRunId]) : null;
  const written = Boolean(writeRun?.working) && ["waiting", "approved"].includes(opp.stages.write.state);
  const undecided = written ? (writeRun!.working as WriteOutput).claims.filter((claim) => claim.support === "neither" && !claim.decision).length : 0;
  const { data: prep } = useLiveDoc<PitchPrep>(written && writeRunId ? `${oppPath}/preps/${writeRunId}` : null, null);
  const meetings = useLiveCollection<Meeting>(written ? `${oppPath}/meetings` : null, "createdAt");
  const stepsDone = meetings.reduce((sum, meeting) => sum + meeting.steps.filter((item) => item.done).length, 0);
  const stepsAll = meetings.reduce((sum, meeting) => sum + meeting.steps.length, 0);
  const quotes = useLiveCollection<Quote>(written ? `${oppPath}/quotes` : null, "createdAt");
  const latestQuote = quotes.at(-1) ?? null;

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
    <GateSlotContext.Provider value={slot}>
      {/* The deal header stays in view: who it is, where it stands, and the one action that moves it on. */}
      <PageHeader label="Deal" className="gap-2.5 pb-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/opportunities" aria-label="Back to opportunities" title="Back to opportunities" className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">{opp.prospect?.name ?? "New opportunity"}</h1>
              {opp.score !== null && opp.recommendation ? <ScoreBadge value={opp.score} band={opp.recommendation} /> : null}
            </div>
            {status === "paused" ? <span className="pl-9.5 text-[13px] text-attention">Live updates paused. Reload to refresh.</span> : null}
          </div>
          {/* The current stage puts its main action here (GateSlot). */}
          <div ref={setSlot} className="flex flex-wrap items-center justify-end gap-2" />
          <details data-menu className="relative">
            <summary aria-label="Who did what" title="Who did what" className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border-2 border-border bg-card text-muted-foreground hover:border-ink hover:text-foreground [&::-webkit-details-marker]:hidden">
              <HelpCircle aria-hidden="true" className="size-4" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 flex w-56 flex-col items-start gap-2.5 rounded-xl border-2 border-ink bg-card p-3.5 shadow-comic">
              <AiMarker>Drafted by an agent</AiMarker>
              <CalcMarker>Calculated by code</CalcMarker>
              <PersonMarker name="A person">Decided by a person</PersonMarker>
            </div>
          </details>
          {/* Everything else about the deal: who it is with, where it came from, the proposal's Docs, and the record actions. Each row is an icon and words. */}
          <details data-menu className="relative">
            <summary aria-label="More about this deal" title="More about this deal" className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border-2 border-border bg-card hover:border-ink [&::-webkit-details-marker]:hidden">
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 flex w-[min(92vw,20rem)] flex-col gap-1 rounded-xl border-2 border-ink bg-card p-2 text-sm shadow-comic">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-2.5 pt-1.5 pb-2 text-[13px]">
                {opp.contact ? (
                  <>
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="truncate">
                      {opp.contact.name}
                      {opp.contact.role ? `, ${opp.contact.role}` : ""}
                    </dd>
                  </>
                ) : null}
                {opp.nextMeeting ? (
                  <>
                    <dt className="text-muted-foreground">Meeting</dt>
                    <dd className="truncate">{opp.nextMeeting}</dd>
                  </>
                ) : null}
                {opp.prospect?.website ? (
                  <>
                    <dt className="text-muted-foreground">Website</dt>
                    <dd className="truncate">{opp.prospect.website}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{opp.status.replace("_", " ")}</dd>
                <dt className="text-muted-foreground">Added by</dt>
                <dd className="truncate">{opp.createdBy}</dd>
              </dl>
              {opp.latestDoc || opp.inboxItemId || versions.length > 1 ? (
                <div className="flex flex-col border-t border-line-soft pt-1">
                  {opp.latestDoc ? (
                    <a href={opp.latestDoc.url} target="_blank" rel="noopener noreferrer" className={MENU_ITEM}>
                      <GoogleLogo product="docs" />
                      Proposal in Google Docs
                      <ExternalLink aria-hidden="true" className="ml-auto" />
                    </a>
                  ) : null}
                  {versions.length > 1 ? <EarlierVersions versions={versions.filter((version) => version.url !== opp.latestDoc?.url)} /> : null}
                  {opp.inboxItemId ? (
                    <Link href={`/inbox/${opp.inboxItemId}`} className={MENU_ITEM} title={opp.intakeType === "web_form" ? (opp.createdBy.startsWith("FlowHub") ? "Started by FlowHub from the website form" : "Opened from a website form answer") : opp.createdBy === "FlowHub from Gmail" ? "Started by FlowHub from Gmail" : "Opened from an email in Gmail"}>
                      <GoogleLogo product={opp.intakeType === "web_form" ? "forms" : "gmail"} />
                      {opp.intakeType === "web_form" ? "The website form answer" : "The email it came from"}
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {canEdit ? (
                <div className="flex flex-col border-t border-line-soft pt-1">
                  <DealStatus opp={opp} offerings={catalogue.offerings} />
                </div>
              ) : null}
            </div>
          </details>
        </div>

        {recordOnly ? null : (
          <StageRow
            current={step}
            items={[
            ...STAGES.map(({ key, label, gate }, index) => {
              const stage = opp.stages[key];
              const stageRun = stage.currentRunId ? (stage.currentRunId === runId ? run : initialRuns[stage.currentRunId]) : null;
              const took = stageRun?.metrics?.ms && stage.state !== "running" ? ` · ${duration(stageRun.metrics.ms)}` : "";
              const hint =
                stage.state === "running"
                  ? "Agents working"
                  : stage.state === "waiting"
                    ? `Your turn: ${gate}${took}`
                    : stage.state === "approved"
                      ? `${gate} passed${stageRun?.approvedBy ? ` by ${stageRun.approvedBy}` : ""}${took}`
                      : stage.state === "failed"
                        ? "Failed, can be retried"
                        : stage.state === "stale"
                          ? "Out of date: an earlier stage changed"
                          : "Not started";
              const sub = stage.state === "running" ? "Working…" : stage.state === "waiting" ? "Your turn" : stage.state === "failed" ? "Failed" : stage.state === "stale" ? "Out of date" : null;
              return {
                key: key as Step,
                lit: stage.state !== "idle",
                node: (
                  <StepButton label={label} sub={sub} subTone={stage.state === "failed" ? "text-destructive" : stage.state === "running" ? "text-ai" : "text-attention"} hint={hint} current={step === key} disabled={stage.state === "idle" && !(key === "write" && writeReady)} onClick={() => setChosen(key)}>
                    <StageIcon state={stage.state} index={index + 1} />
                  </StepButton>
                ),
              };
            }),
            ...AFTER.map(({ key, label, letter }) => {
              const ready = written && (key === "meeting" || undecided === 0);
              const hasContent = key === "prep" ? Boolean(prep) : key === "quote" ? latestQuote?.status === "approved" : meetings.length > 0;
              const hint = !ready
                ? written
                  ? "Decide on every flagged claim at Gate D first."
                  : "Opens once the proposal is written at Gate D."
                : key === "prep"
                  ? prep
                    ? "Ready: questions and practice"
                    : "Get ready for the meeting"
                  : key === "quote"
                    ? latestQuote
                      ? `${latestQuote.number} · ${QUOTE_STATUS[latestQuote.status]}`
                      : "Turn the pricing into a quote"
                    : meetings.length
                      ? `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"} · ${stepsDone} of ${stepsAll} steps done`
                      : "Paste your meeting notes";
              return {
                key: key as Step,
                lit: ready,
                node: (
                  <StepButton label={label} sub={null} subTone="" hint={hint} current={step === key} disabled={!ready} onClick={() => setChosen(key)}>
                    <StageIcon state={hasContent ? "approved" : "idle"} index={letter === "E" ? 5 : letter === "F" ? 6 : 7} />
                  </StepButton>
                ),
              };
            }),
            ]}
          />
        )}
      </PageHeader>

      {opp.outcome ? <OutcomeBanner outcome={opp.outcome} value={opp.value} recordOnly={recordOnly} /> : null}
      {recordOnly ? null : (
        <>

      {after === "prep" && writeRun ? (
        <div className="flex flex-col gap-5">
          <PrepView opp={opp} run={writeRun} canEdit={canEdit} />
          <ScheduleCard opp={opp} run={writeRun} prep={prep ?? null} seller={seller} topic={meetingTopic(opp.interestedOfferingIds.map((id) => catalogue.offerings[id]).filter(Boolean))} privateNames={catalogue.privateNames} inviteFrom={inviteFrom} canEdit={canEdit} />
          <RehearsalView opp={opp} run={writeRun} canEdit={canEdit} />
        </div>
      ) : after === "meeting" ? (
        <MeetingView opp={opp} canEdit={canEdit} />
      ) : after === "quote" && writeRun ? (
        <QuoteView opp={opp} run={writeRun} quotes={quotes} canEdit={canEdit} isOwner={isOwner} />
      ) : run?.state === "running" ? (
        // While the agents work, the log is the main thing to watch. Writing keeps the choice of what to send above it (FR-WRI-11).
        <>
        {selected === "write" ? <WriteSteps cards={stepsBeforeDraft(true)} chosen="proposal" onChoose={() => undefined} /> : null}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <StagePanel opp={opp} stage={selected} run={run} catalogue={catalogue} canEdit={canEdit} draft={draft} />
          <ProgressLog events={events} running />
        </div>
        </>
      ) : (
        // Once it's your turn, the stage gets the full width and the log folds away.
        <>
          {/* FR-RES-8, FR-FIT-9: Research and Fit open "How this was made" from a button under their boxes; the other stages keep the folded strip. */}
          <StagePanel opp={opp} stage={selected} run={run} catalogue={catalogue} canEdit={canEdit} draft={draft} made={events.length ? <MadeSteps events={events} run={run} /> : null} />
          {events.length && !((selected === "research" || selected === "fit" || selected === "write") && run?.working) ? <MadeStrip events={events} run={run} /> : null}
        </>
      )}
        </>
      )}
    </GateSlotContext.Provider>
  );
}

/**
 * The header's stage row: one continuous line of steps, grouped into phases.
 * Each phase is named over its steps, the current phase in ink and the others
 * muted; the line joining the steps runs on across the phases.
 */
function StageRow({ items, current }: { items: { key: Step; lit: boolean; node: React.ReactNode }[]; current: Step }) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  return (
    // Each phase is a box with its name on the top border, like a fieldset; a short line joins the boxes.
    <nav aria-label="Deal room stages" className="flex flex-wrap items-center gap-y-4 pt-2">
      {PHASES.map((phase, phaseIndex) => {
        const here = phase.steps.includes(current);
        return (
          <Fragment key={phase.label}>
            {phaseIndex > 0 ? <span aria-hidden="true" className={cn("h-0.5 w-3 shrink-0", byKey.get(phase.steps[0])?.lit ? "bg-fit-strong" : "bg-border")} /> : null}
            <div role="group" aria-label={phase.label} className={cn("relative rounded-xl border-2 px-2 pt-3 pb-2", here ? "border-ink" : "border-border")}>
              <span className={cn("absolute -top-2 left-2.5 bg-background px-1.5 text-[10px] leading-4 font-bold tracking-[0.1em] whitespace-nowrap uppercase", here ? "text-foreground" : "text-muted-foreground")}>{phase.label}</span>
              {/* An invisible copy of the label keeps the box at least as wide as its name, so a one-step phase never lets it overhang. */}
              <span aria-hidden="true" className="invisible block h-0 overflow-hidden pr-1 pl-2.5 text-[10px] font-bold tracking-[0.1em] whitespace-nowrap uppercase">
                {phase.label}
              </span>
              <div className="flex items-center">
                {phase.steps.map((key, index) => {
                  const item = byKey.get(key);
                  if (!item) return null;
                  return (
                    <Fragment key={key}>
                      {index > 0 ? <span aria-hidden="true" className={cn("h-0.5 w-3 shrink-0", item.lit ? "bg-fit-strong" : "bg-border")} /> : null}
                      {item.node}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** One step in the header's stage row. The detail (who passed the gate, how long it took) is in its tooltip. */
function StepButton({ label, sub, subTone, hint, current, disabled, onClick, children }: { label: string; sub: string | null; subTone: string; hint: string; current: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "step" : undefined}
      disabled={disabled}
      title={hint}
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg border-2 border-transparent px-2 text-left text-[13px] font-semibold transition-colors hover:bg-card disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent",
        // Flat, like the phase box around it: an ink outline and a white fill that stands off the cream page, no shadow.
        current && "border-ink bg-card",
      )}
    >
      {children}
      <span className="flex flex-col leading-tight">
        {label}
        {sub ? <span className={cn("text-[11px] leading-none font-bold", subTone)}>{sub}</span> : null}
      </span>
    </button>
  );
}

/** FR-WRI-9: earlier finalised proposals for this deal, each still a working Doc link. */
function EarlierVersions({ versions }: { versions: { runId: string; url: string; publishedAt: string; by: string | null }[] }) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  // A row of the ⋯ menu that folds open to list the earlier Docs.
  return (
    <details className="group">
      <summary className={cn(MENU_ITEM, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        <History aria-hidden="true" />
        {versions.length} earlier {versions.length === 1 ? "version" : "versions"}
        <ChevronDown aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <ol className="flex flex-col gap-1 pt-0.5 pb-1.5 pl-9 text-[13px]">
        {versions.map((version) => (
          <li key={version.runId}>
            <a href={version.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              {date.format(new Date(version.publishedAt))}
              {version.by ? `, by ${version.by}` : ""} ↗
            </a>
          </li>
        ))}
      </ol>
    </details>
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
    <section aria-label="Outcome" className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-card shadow-comic px-4 py-3.5">
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

/** How this stage was made: each step the agents and the code took, in order, from the run's own progress events. The full log folds away. */
function madeCounts(events: RunEvent[], run: Run | null) {
  const steps = events.filter((event) => event.kind === "step");
  const ai = steps.filter((event) => event.actor.kind === "ai").length;
  return `${ai} by AI · ${steps.length - ai} by code${run?.metrics?.ms ? ` · ${duration(run.metrics.ms)}` : ""}${run?.metrics?.groundedQueries ? ` · ${run.metrics.groundedQueries} Google searches` : ""}`;
}

function MadeStrip({ events, run }: { events: RunEvent[]; run: Run | null }) {
  return (
    // Folded by default at the foot of the stage: the counts stay in one line, the steps and the log open on a click.
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl px-4 py-2.5 hover:bg-subtle [&::-webkit-details-marker]:hidden">
        <h2 className="font-sans text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">How this was made</h2>
        <span className="text-xs text-muted-foreground">{madeCounts(events, run)}</span>
        <ChevronDown aria-hidden="true" className="ml-auto size-4 self-center text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-3">
        <MadeList events={events} columns="grid gap-x-5 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-4" />
      </div>
    </details>
  );
}

/** The same steps for a side drawer (FR-RES-8): the counts, every step in one column, then the full log. */
function MadeSteps({ events, run }: { events: RunEvent[]; run: Run | null }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{madeCounts(events, run)}</p>
      <MadeList events={events} columns="flex flex-col gap-2 text-[13.5px]" limit={40} />
    </div>
  );
}

function MadeList({ events, columns, limit = 8 }: { events: RunEvent[]; columns: string; limit?: number }) {
  const shown = events.filter((event) => event.kind === "step").slice(0, limit);
  return (
      <div className="flex flex-col gap-2.5">
      {shown.length ? (
        <ol className={columns}>
          {shown.map((event) => (
            <li key={event.seq} className="flex items-start gap-1.5">
              {event.actor.kind === "ai" ? (
                <GoogleLogo product="gemini" className="mt-0.5 size-3.5" label="By Gemini" />
              ) : (
                <Calculator aria-label="Calculated by code" className="mt-0.5 size-3.5 shrink-0 text-calc" />
              )}
              {event.message}
            </li>
          ))}
        </ol>
      ) : null}
      <details className="text-xs">
        <summary className="w-fit cursor-pointer list-none text-link hover:underline [&::-webkit-details-marker]:hidden">Full log · {events.length} entries</summary>
        <div className="mt-2 rounded-lg border">
          <LogList events={events} />
        </div>
      </details>
      </div>
  );
}

function StagePanel({ opp, stage, run, catalogue, canEdit, draft, made }: { opp: Opportunity; stage: StageKey; run: Run | null; catalogue: Catalogue; canEdit: boolean; draft: DraftContext | null; made?: React.ReactNode }) {
  if (!run) {
    if (stage === "write" && opp.stages.fit.state === "approved") return <StartWriting opp={opp} canEdit={canEdit} />;
    return <Panel>{stage === "write" ? "Approve the fit map at Gate C to write the proposal." : "This stage hasn't started yet."}</Panel>;
  }
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
  // A run built on something that changed upstream is shown, but its gate can't be passed (FR-DR-4).
  const editable = canEdit && run.state === "waiting" && opp.stages[stage].state === "waiting";
  const actions = canEdit ? <StageActions opp={opp} stage={stage} /> : null;
  const view =
    stage === "intake" ? (
      <IntakeView opp={opp} run={run} working={run.working as IntakeOutput} editable={editable} />
    ) : stage === "research" ? (
      <BriefView opp={opp} run={run} working={run.working as BriefOutput} editable={editable} made={made} />
    ) : stage === "fit" ? (
      <FitView opp={opp} run={run} working={run.working as FitOutput} catalogue={catalogue} editable={editable} made={made} />
    ) : stage === "write" && draft ? (
      <WriteView opp={opp} run={run} working={run.working as WriteOutput} context={draft} editable={editable} canEdit={canEdit} made={made} />
    ) : (
      <Panel>The earlier stages behind this draft are no longer available. Re-run fit to write again.</Panel>
    );
  return (
    <>
      {actions}
      {view}
    </>
  );
}

/**
 * FR-DR-4: go back to a stage. Reopening a gate costs no AI run; re-running
 * calls the agents again. Either way, later stages become out of date (kept as
 * history), and the person confirms first.
 */
function StageActions({ opp, stage }: { opp: Opportunity; stage: StageKey }) {
  const [confirming, setConfirming] = useState<"reopen" | "rerun" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const state = opp.stages[stage].state;
  const index = STAGES.findIndex(({ key }) => key === stage);
  const { label, gate } = STAGES[index];
  const busy = STAGES.some(({ key }) => opp.stages[key].state === "running");
  const upstreamReady = STAGES.slice(0, index).every(({ key }) => opp.stages[key].state === "approved");
  if (busy || !["approved", "waiting", "stale"].includes(state)) return null;
  const later = STAGES.slice(index + 1).filter(({ key }) => ["waiting", "approved"].includes(opp.stages[key].state));
  const laterText = later.length ? `${later.map((item) => item.label).join(" and ")} will be marked out of date and kept as history.` : "Nothing after it has run yet.";

  const go = (kind: "reopen" | "rerun") =>
    startTransition(async () => {
      const result = kind === "reopen" ? await reopenGate(opp.id, stage) : await retryStage(opp.id, stage);
      setError(result.error ?? null);
      if (!result.error) setConfirming(null);
    });

  const confirmBox = confirming ? (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-attention/40 bg-attention-soft/40 px-3 py-2 text-sm", state !== "stale" && "absolute top-full right-0 z-30 mt-2 w-[min(92vw,26rem)] rounded-xl border-2 border-ink bg-card shadow-comic")}>
      <span className="min-w-0 flex-1">
        {confirming === "reopen" ? (
          <>
            <b>Reopen {gate}?</b> You can change it again, with no new AI run.{" "}
          </>
        ) : (
          <>
            <b>Re-run {label.toLowerCase()}?</b> The agents start again{stage === "research" ? ", using one of today's research runs" : ", using one of today's AI runs"}.{" "}
          </>
        )}
        {laterText}
      </span>
      <Button type="button" size="sm" disabled={pending} onClick={() => go(confirming)}>
        {pending ? "Starting…" : confirming === "reopen" ? `Reopen ${gate}` : "Re-run"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
        Cancel
      </Button>
    </div>
  ) : null;

  // A passed gate: two quiet buttons in the header, beside who approved it. A gate still waiting can be re-run from there too.
  if (state !== "stale")
    return (
      <GateSlot>
        <div className="relative flex items-center gap-0.5 border-l border-line-soft pl-1.5">
          {state === "approved" ? (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming("reopen")} title={`Reopen ${gate} to change it, with no new AI run`}>
              <LockOpen aria-hidden="true" />
              Reopen
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" disabled={pending || !upstreamReady} onClick={() => setConfirming("rerun")}>
            <RotateCw aria-hidden="true" />
            Re-run
          </Button>
          {confirmBox}
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
        </div>
      </GateSlot>
    );

  return (
    <section aria-label={`Go back to ${label}`} className="flex flex-col gap-2 rounded-xl border border-attention/40 bg-attention-soft/30 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-attention" />
          <span>
            <b>Out of date.</b> An earlier stage changed after this ran.{upstreamReady ? "" : " Approve the earlier stage first."}
          </span>
        </span>
        <Button type="button" size="sm" disabled={pending || !upstreamReady} onClick={() => setConfirming("rerun")}>
          <RotateCw aria-hidden="true" />
          Re-run {label.toLowerCase()}
        </Button>
      </div>
      {confirmBox}
      {error ? <span className="text-destructive">{error}</span> : null}
    </section>
  );
}

function Running({ opp, stage, run, canEdit }: { opp: Opportunity; stage: StageKey; run: Run; canEdit: boolean }) {
  // The clock starts after hydration, so the server and the browser render the same first frame.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const started = new Date(run.startedAt).getTime();
  const stalled = now !== null && now - new Date(run.lastEventAt).getTime() > STALL_MS;
  return (
    <Panel>
      <span className="flex items-center gap-2 font-semibold">
        {stalled ? <AlertTriangle aria-hidden="true" className="size-4 text-attention" /> : <Loader2 aria-hidden="true" className="size-4 animate-spin text-ai" />}
        {stalled ? "No progress for 3 minutes. The run may have stalled." : "The agents are working. You can leave this page; the run carries on."}
      </span>
      <span className="text-sm text-muted-foreground">{now === null ? "Running" : `Running for ${duration(Math.max(1000, now - started))}`}</span>
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
    <section aria-labelledby="log" className="flex flex-col rounded-xl border-2 border-ink bg-card shadow-comic">
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
                  <GoogleLogo product="gemini" className="mt-0.5 size-3.5" label="By Gemini" />
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

