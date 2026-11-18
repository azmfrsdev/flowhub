"use client";

import { AlertTriangle, ArrowRight, Calculator, Check, ChevronRight, GraduationCap, History, Mic, RotateCw, Settings2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { GoogleLogo } from "@/components/flowhub/google-logo";
import { LoadingChip } from "@/components/flowhub/loading";
import { Button } from "@/components/ui/button";
import { sampleAnswers } from "@/lib/deal-room/prep";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { Opportunity, PitchPrep, PracticeAttempt, PracticeSample, Rehearsal, Run } from "@/lib/schema";
import { cn } from "cn";
import { practise, writePrep } from "./after-actions";
import { GateSlot } from "./gate-parts";
import { Coaching, RehearsalSetupForm, RehearsalStage, RehearseSummary, useRehearsalSetup, useRehearsals } from "./rehearsal-view";
import { MeetingAction, MeetingForm, MeetingSummary, useMeetingPlan } from "./schedule-card";
import { Box, BoxTag, SideDrawer } from "./stage-box";
import { SmallMark, TeacherMark } from "./teacher-mark";

type Likely = PitchPrep["likely"][number];
type Drawer = "pitch" | "gaps" | "meeting" | "likely" | "ask" | "practise" | "setup" | "coaching" | "history" | "made";
const DRAWER_TITLE: Record<Drawer, string> = {
  pitch: "Pitch on a page",
  gaps: "Gaps they'll probe",
  meeting: "Meeting",
  likely: "They'll likely ask",
  ask: "Ask them",
  practise: "Practise",
  setup: "Set up the rehearsal",
  coaching: "Coaching",
  history: "Practice and rehearsals",
  made: "How this was made",
};

/** How many lines each fixed-size box shows; the rest are in its drawer. */
const GAP_ROWS = 5;
const LIKELY_ROWS = 8;
const ASK_ROWS = 7;
const ROW1 = "h-[15rem]";
const ROW2 = "h-[19rem]";
const COLUMNS = "grid gap-x-5 gap-y-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.95fr)]";

export const LINE = "grid h-8 w-full items-center gap-2 rounded-lg border-b border-dashed border-line-soft px-2 text-left text-[13.5px] transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
export const POP = "absolute inset-x-1 z-30 flex flex-col gap-2 rounded-lg border-2 border-ink bg-card p-3 text-[13px] leading-relaxed shadow-comic";
export const KICKER = "text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase";
const NUM = "grid h-[18px] place-items-center rounded-[5px] bg-ink text-[10.5px] font-bold text-background";
export const PILL = "justify-self-end rounded-full px-2 text-[10.5px] leading-[17px] font-bold whitespace-nowrap";
const BASIS = {
  research: { short: "Research", long: "From research", tone: "bg-link/10 text-link" },
  gap: { short: "Fit gap", long: "From the fit map", tone: "bg-fit-partial-soft text-fit-partial" },
  brief: { short: "Brief", long: "Left open by the brief", tone: "bg-muted text-muted-foreground" },
} as const;
const PROBE = { outside: { label: "Outside", tone: "border-[1.5px] border-fit-cannot text-fit-cannot", from: "Fit map: Cannot meet" }, partial: { label: "Partial", tone: "border-[1.5px] border-fit-partial text-fit-partial", from: "Fit map: a partial match" } } as const;
const number = (index: number) => String(index + 1).padStart(2, "0");
const claims = (count: number) => (count ? `Restates ${count} proposal ${count === 1 ? "claim" : "claims"}` : "Restates the proposal");

/**
 * Step E, Pitch prep (PRD 7.24, FR-PREP-6): six boxes of a fixed size, one line per item.
 * Top: the pitch on a page, the gaps they'll probe and the meeting (PRD 7.28). Below: the
 * questions they'll likely ask, the ones to ask them, and the rehearsal (PRD 7.26). The long
 * forms are in a side drawer; the header carries the one action that moves the step on.
 * The model restates the proposal; code supplies the numbers and the gaps, and checks every
 * amount said in practice.
 */
export function PrepStep({ opp, run, canEdit, seller, topic, privateNames, inviteFrom, onFollowUp }: { opp: Opportunity; run: Run; canEdit: boolean; seller: string; topic: string; privateNames: string[]; inviteFrom: string | null; onFollowUp: () => void }) {
  const base = `workspaces/${opp.workspaceId}/opportunities/${opp.id}/preps/${run.id}`;
  const { data: prep } = useLiveDoc<PitchPrep>(base, null);
  const attempts = useLiveCollection<PracticeAttempt>(prep ? `${base}/attempts` : null, "createdAt");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const stale = prep ? prep.rev !== run.rev : false;
  const meeting = useMeetingPlan({ opp, run, prep: prep ?? null, seller, topic, privateNames, inviteFrom, canEdit });
  const rehearsals = useRehearsals(opp, run);

  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [coachingId, setCoachingId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDialogElement>(null);
  const openDrawer = (kind: Drawer) => {
    setOpenId(null);
    setDrawer(kind);
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  const openStage = (id: string) => {
    dialog.current?.close();
    setStageId(id);
    if (!stage.current?.open) stage.current?.showModal();
  };
  const setup = useRehearsalSetup(opp, run, openStage);
  const practiseQuestion = (id: string) => {
    setQuestionId(id);
    openDrawer("practise");
  };
  const showCoaching = (id: string) => {
    setCoachingId(id);
    openDrawer("coaching");
  };

  // A click outside an open line closes it.
  useEffect(() => {
    if (!openId) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-prep-line]")) setOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openId]);

  const write = () =>
    startTransition(async () => {
      const result = await writePrep(opp.id, run.id);
      setError(result.error ?? null);
    });

  const best = (id: string) => attempts.filter((attempt) => attempt.questionId === id).reduce<PracticeAttempt | null>((top, attempt) => (top === null || attempt.mark > top.mark ? attempt : top), null);
  const line = { openId, setOpenId };
  const latest = rehearsals.at(-1) ?? null;
  const practised = prep ? prep.likely.filter((item) => attempts.some((attempt) => attempt.questionId === item.id)).length : 0;
  const question = prep ? (prep.likely.find((item) => item.id === questionId) ?? prep.likely[0] ?? null) : null;
  const main = "h-10 px-4 text-[15px] font-bold shadow-comic";

  return (
    <>
      {/* FR-PREP-6: the header's one action moves on: write the prep, send the invite, then Follow-up. */}
      <GateSlot>
        <div className="order-last flex flex-wrap items-center justify-end gap-2">
          {stale && canEdit ? (
            <span className="flex items-center gap-1.5 text-xs text-attention">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              The proposal changed
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={write}>
                <RotateCw aria-hidden="true" />
                {pending ? "Writing…" : "Write again"}
              </Button>
            </span>
          ) : null}
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
          {!prep ? (
            canEdit ? (
              <Button type="button" disabled={pending} onClick={write} className={main} title="About half a minute. Uses one of today's AI runs.">
                <GraduationCap aria-hidden="true" />
                {pending ? "Writing the prep…" : "Write the pitch prep"}
              </Button>
            ) : null
          ) : !meeting.booked && canEdit ? (
            <MeetingAction plan={meeting} />
          ) : (
            <Button type="button" onClick={onFollowUp} className={main}>
              Follow-up
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </GateSlot>

      <div className="flex flex-col gap-7 pt-2" onKeyDown={(event) => event.code === "Escape" && setOpenId(null)}>
        <div className={COLUMNS}>
          <Box
            title="Pitch on a page"
            marker={
              <>
                <BoxTag kind="ai" title="The Coach restates the approved proposal.">Coach</BoxTag>
                <BoxTag kind="calc" title="Copied by code from the approved pricing and the fit map.">Numbers by code</BoxTag>
              </>
            }
            onMore={prep ? () => openDrawer("pitch") : undefined}
            className={ROW1}
          >
            {prep ? <PitchLines prep={prep} {...line} /> : <Waiting text="An opening line, three points and the numbers to know" pending={pending} />}
          </Box>
          <Box title="Gaps they'll probe" marker={<BoxTag kind="calc" title="Built by code from Cannot meet and the partial matches.">From the fit map</BoxTag>} onMore={prep ? () => openDrawer("gaps") : undefined} className={ROW1}>
            {prep ? <GapLines prep={prep} onMore={() => openDrawer("gaps")} {...line} /> : <Waiting text="Built by code when the prep is written" />}
          </Box>
          <Box title="Meeting" marker={<BoxTag kind="calc" title={meeting.edited ? "You rewrote the agenda." : "Code builds the agenda and checks every line."}>{meeting.edited ? "Agenda: your words" : "Agenda by code"}</BoxTag>} onMore={() => openDrawer("meeting")} moreLabel={canEdit ? "Edit" : "View all"} className={ROW1}>
            <MeetingSummary plan={meeting} onAgenda={() => openDrawer("meeting")} />
          </Box>
        </div>

        <div className={COLUMNS}>
          <Box
            title="They'll likely ask"
            marker={
              <>
                <BoxTag kind="ai" title="Each suggested answer restates proposal claims.">Coach</BoxTag>
                <BoxTag kind="calc" title="Code drops an answer with no claim behind it, an amount that isn't an approved price, or a private result.">Answers checked by code</BoxTag>
              </>
            }
            onMore={prep ? () => openDrawer("likely") : undefined}
            className={ROW2}
          >
            {prep ? <LikelyLines prep={prep} best={best} canEdit={canEdit} onPractise={practiseQuestion} onMore={() => openDrawer("likely")} {...line} /> : <Waiting text="Six to eight questions, each with an answer to practise" />}
          </Box>
          <Box title="Ask them" marker={<><BoxTag kind="ai">Coach</BoxTag><BoxTag kind="calc" title="Code keeps only questions whose research finding, fit gap or brief question exists.">Each tied to a source</BoxTag></>} onMore={prep ? () => openDrawer("ask") : undefined} className={ROW2}>
            {prep ? <AskLines prep={prep} onMore={() => openDrawer("ask")} {...line} /> : <Waiting text="Four to six, each from research, a gap or the brief" />}
          </Box>
          <Box title="Rehearse" marker={<BoxTag kind="ai" title="The buyer knows only your approved proposal.">Buyer played by Gemini</BoxTag>} onMore={() => openDrawer("setup")} moreLabel="Set up" className={ROW2}>
            <RehearseSummary opp={opp} setup={setup} latest={latest} canEdit={canEdit} onSetup={() => openDrawer("setup")} onOpen={openStage} onCoaching={showCoaching} />
          </Box>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {prep ? <DockButton onClick={() => openDrawer("made")} icon={<Settings2 />} label="How this was made" /> : null}
        {rehearsals.length || attempts.length ? <DockButton onClick={() => openDrawer("history")} icon={<History />} label={`Practice and rehearsals (${rehearsals.length + practised})`} /> : null}
      </div>

      <SideDrawer ref={dialog} title={drawer ? DRAWER_TITLE[drawer] : null} onClose={() => setDrawer(null)}>
        {drawer === "meeting" ? (
          <MeetingForm plan={meeting} />
        ) : drawer === "setup" ? (
          <RehearsalSetupForm setup={setup} canEdit={canEdit} />
        ) : drawer === "coaching" ? (
          <CoachingDrawer rehearsal={rehearsals.find((item) => item.id === coachingId) ?? null} onOpen={openStage} />
        ) : drawer === "history" ? (
          <HistoryDrawer rehearsals={rehearsals} prep={prep ?? null} attempts={attempts} onOpen={openStage} onCoaching={showCoaching} onPractise={practiseQuestion} />
        ) : !prep ? null : drawer === "pitch" ? (
          <PitchDrawer prep={prep} canEdit={canEdit} pending={pending} error={error} onWrite={write} stale={stale} />
        ) : drawer === "gaps" ? (
          <GapsDrawer prep={prep} />
        ) : drawer === "likely" ? (
          <LikelyDrawer prep={prep} best={best} canEdit={canEdit} onPractise={practiseQuestion} />
        ) : drawer === "ask" ? (
          <AskDrawer prep={prep} />
        ) : drawer === "practise" && question ? (
          <Practice key={question.id} opp={opp} run={run} prep={prep} question={question} attempts={attempts.filter((attempt) => attempt.questionId === question.id)} canEdit={canEdit} onPick={setQuestionId} />
        ) : drawer === "made" ? (
          <MadeDrawer prep={prep} />
        ) : null}
      </SideDrawer>

      <RehearsalStage ref={stage} opp={opp} run={run} rehearsal={rehearsals.find((item) => item.id === stageId) ?? null} onClose={() => setStageId(null)} />
    </>
  );
}

export function DockButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-ink bg-card px-3.5 text-sm font-bold whitespace-nowrap shadow-comic-sm hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4">
      {icon}
      {label}
    </button>
  );
}

/** FR-PREP-6: before the prep is written, its boxes keep their size and say what they will hold. */
export function Waiting({ text, pending = false, pendingLabel = "Reading the proposal" }: { text: string; pending?: boolean; pendingLabel?: string }) {
  return (
    <div className="relative flex-1">
      <div aria-hidden="true" className="flex flex-col gap-3 px-4 pt-3">
        {[88, 72, 80, 64].map((width) => (
          <span key={width} className="h-2.5 rounded-full bg-muted" style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="absolute inset-x-3 bottom-4 flex flex-col items-center gap-2 text-center text-[12.5px] text-muted-foreground">
        {pending ? <LoadingChip label={pendingLabel} /> : null}
        <span>{text}</span>
      </div>
    </div>
  );
}

export type LineState = { openId: string | null; setOpenId: (id: string | null) => void };

/** One line with its popup: the button toggles it, a click elsewhere or Escape closes it. */
export function Line({ id, openId, setOpenId, className, label, up = false, before, children, detail }: LineState & { id: string; className: string; label: string; up?: boolean; before?: React.ReactNode; children: React.ReactNode; detail: React.ReactNode }) {
  const open = openId === id;
  return (
    <li data-prep-line className={cn("relative", before ? "flex items-center gap-1" : null)}>
      {before}
      <button type="button" aria-expanded={open} aria-label={label} onClick={() => setOpenId(open ? null : id)} className={cn(LINE, className, open && "bg-attention-soft")}>
        {children}
        <ChevronRight aria-hidden="true" className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div role="dialog" aria-label={label} className={cn(POP, up ? "bottom-full mb-0.5" : "top-full mt-0.5")}>
          {detail}
        </div>
      ) : null}
    </li>
  );
}

export function More({ count, onMore }: { count: number; onMore: () => void }) {
  return (
    <li className="px-2 pt-1.5 text-xs text-muted-foreground">
      and {count} more in{" "}
      <button type="button" onClick={onMore} className="text-link hover:underline">
        View all
      </button>
    </li>
  );
}

/** FR-PREP-1: the opening line as a speech bubble, the three points, and the numbers to know. */
function PitchLines({ prep, ...line }: { prep: PitchPrep } & LineState) {
  return (
    <div className="flex flex-col px-3 pt-1.5">
      <ul className="flex flex-col">
        {prep.opener ? (
          <Line id="opener" label="Open with" className="mb-1 h-9 grid-cols-[minmax(0,1fr)_0.875rem] rounded-xl border-2 border-b-2 border-solid border-ink bg-primary/15 hover:bg-primary/25" {...line} detail={<><span className={KICKER}>Open with</span><p>&ldquo;{prep.opener.text}&rdquo;</p><span className="text-xs text-muted-foreground">{claims(prep.opener.claimIds.length)}</span></>}>
            <span className="truncate">&ldquo;{prep.opener.text}&rdquo;</span>
          </Line>
        ) : null}
        {prep.points.slice(0, 3).map((point, index) => (
          <Line key={index} id={`point-${index}`} label={`Point ${index + 1}`} className="grid-cols-[1.375rem_minmax(0,1fr)_0.875rem]" {...line} detail={<><span className={KICKER}>Point {index + 1} to land</span><p>{point.text}</p><span className="text-xs text-muted-foreground">{claims(point.claimIds.length)}</span></>}>
            <span className={NUM}>{number(index)}</span>
            <span className="truncate">{point.text}</span>
          </Line>
        ))}
      </ul>
      {prep.numbers.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {prep.numbers.slice(0, 4).map((item) => (
            <div key={item.label} title={`${item.label}: ${item.value}`} className={cn("flex min-w-0 flex-col rounded-lg px-2.5 py-1", item.money ? "bg-fit-strong-soft" : "bg-muted/70")}>
              <span className="truncate text-[10.5px] text-muted-foreground">{item.label}</span>
              <b className={cn("truncate text-[13px]", item.money && "font-mono text-fit-strong")}>{item.value}</b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** FR-PREP-1: the gaps, one line each with an Outside or Partial pill that never wraps. */
function GapLines({ prep, onMore, ...line }: { prep: PitchPrep; onMore: () => void } & LineState) {
  if (!prep.probes.length) return <p className="px-4 pt-2 text-sm text-muted-foreground">No gaps: the fit map meets every need.</p>;
  const shown = prep.probes.length > GAP_ROWS ? GAP_ROWS - 1 : GAP_ROWS;
  return (
    <ul className="flex flex-col px-2.5 pt-1.5">
      {prep.probes.slice(0, shown).map((probe, index) => (
        <Line key={index} id={`gap-${index}`} label={probe.need} className="grid-cols-[minmax(0,1fr)_4.25rem_0.875rem]" {...line} detail={<><span className={KICKER}>If they ask</span><p>{probe.answer}</p><span className="text-xs text-muted-foreground">{PROBE[probe.kind].from}: {probe.need}</span></>}>
          <span className="truncate">{probe.need}</span>
          <span className={cn(PILL, "bg-card", PROBE[probe.kind].tone)}>{PROBE[probe.kind].label}</span>
        </Line>
      ))}
      {prep.probes.length > shown ? <More count={prep.probes.length - shown} onMore={onMore} /> : null}
    </ul>
  );
}

/** FR-PREP-2: the likely questions, one line each with the best practice mark. The popup has the answer and Practise this. */
function LikelyLines({ prep, best, canEdit, onPractise, onMore, ...line }: { prep: PitchPrep; best: (id: string) => PracticeAttempt | null; canEdit: boolean; onPractise: (id: string) => void; onMore: () => void } & LineState) {
  if (!prep.likely.length) return <p className="px-4 pt-2 text-sm text-muted-foreground">No questions survived code&apos;s checks. Write the prep again.</p>;
  const shown = prep.likely.length > LIKELY_ROWS ? LIKELY_ROWS - 1 : LIKELY_ROWS;
  return (
    <ul className="flex flex-col px-2.5 pt-1.5">
      {prep.likely.slice(0, shown).map((item, index) => {
        const top = best(item.id);
        return (
          <Line
            key={item.id}
            id={item.id}
            label={item.question}
            up={index >= 4}
            className="grid-cols-[1.5rem_minmax(0,1fr)_auto_0.875rem]"
            {...line}
            detail={
              <>
                <span className={KICKER}>Why they&apos;d ask</span>
                <p className="text-muted-foreground">{item.why}</p>
                <span className={KICKER}>Suggested answer</span>
                <p>{item.answer}</p>
                {item.watch ? (
                  <p className="flex items-start gap-1.5 rounded-md bg-attention-soft/50 px-2 py-1 text-xs text-attention">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    {item.watch}
                  </p>
                ) : null}
                {canEdit ? (
                  <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => onPractise(item.id)}>
                    <Mic aria-hidden="true" />
                    Practise this
                  </Button>
                ) : null}
              </>
            }
          >
            <span className={NUM}>{number(index)}</span>
            <span className="truncate">{item.question}</span>
            {top ? <SmallMark mark={top.mark} capped={top.mark < top.modelMark} /> : <span />}
          </Line>
        );
      })}
      {prep.likely.length > shown ? <More count={prep.likely.length - shown} onMore={onMore} /> : null}
    </ul>
  );
}

/** FR-PREP-3: the questions to ask, one line each with where it came from. */
function AskLines({ prep, onMore, ...line }: { prep: PitchPrep; onMore: () => void } & LineState) {
  if (!prep.ask.length) return <p className="px-4 pt-2 text-sm text-muted-foreground">No questions kept: none had a source.</p>;
  const shown = prep.ask.length > ASK_ROWS ? ASK_ROWS - 1 : ASK_ROWS;
  return (
    <ul className="flex flex-col px-2.5 pt-1.5">
      {prep.ask.slice(0, shown).map((item, index) => (
        <Line
          key={item.id}
          id={item.id}
          label={item.question}
          up={index >= 4}
          className="grid-cols-[minmax(0,1fr)_4.75rem_0.875rem]"
          {...line}
          detail={
            <>
              <p className="font-semibold">{item.question}</p>
              <span className={KICKER}>Why ask</span>
              <p className="text-muted-foreground">{item.why}</p>
              <span className={KICKER}>{BASIS[item.basis].long}</span>
              <q className="text-muted-foreground italic">{item.basisText}</q>
            </>
          }
        >
          <span className="truncate">{item.question}</span>
          <span className={cn(PILL, BASIS[item.basis].tone)}>{BASIS[item.basis].short}</span>
        </Line>
      ))}
      {prep.ask.length > shown ? <More count={prep.ask.length - shown} onMore={onMore} /> : null}
    </ul>
  );
}

const CARD = "flex flex-col gap-1.5 rounded-xl border-2 border-ink bg-card px-3.5 py-2.5";

function PitchDrawer({ prep, canEdit, pending, error, onWrite, stale }: { prep: PitchPrep; canEdit: boolean; pending: boolean; error: string | null; onWrite: () => void; stale: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {stale ? <p className="flex items-center gap-2 text-xs text-attention"><AlertTriangle aria-hidden="true" className="size-3.5" />The proposal changed after this prep was written. Write it again to match.</p> : null}
      <p className="text-xs text-muted-foreground">The Coach restates the approved proposal. Code copies the numbers from your pricing and the fit map.</p>
      {prep.opener ? (
        <div className={cn(CARD, "bg-primary/15")}>
          <span className={KICKER}>Open with</span>
          <p className="text-base leading-snug">&ldquo;{prep.opener.text}&rdquo;</p>
        </div>
      ) : null}
      {prep.points.length ? (
        <div className={CARD}>
          <span className={KICKER}>Points to land</span>
          <ol className="flex flex-col gap-1.5">
            {prep.points.map((point, index) => (
              <li key={index} className="flex gap-2">
                <span className={cn(NUM, "mt-0.5 w-6 shrink-0")}>{number(index)}</span>
                {point.text}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className={CARD}>
        <span className="flex items-center gap-1.5">
          <span className={KICKER}>Numbers to know</span>
          <BoxTag kind="calc">By code</BoxTag>
        </span>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
          {prep.numbers.map((item) => (
            <div key={item.label} className="contents">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className={cn("text-right", item.money && "font-mono font-semibold text-fit-strong")}>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onWrite}>
            <RotateCw aria-hidden="true" />
            {pending ? "Writing…" : "Write again"}
          </Button>
          <span className="text-xs text-muted-foreground">Uses one of today&apos;s AI runs.</span>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function GapsDrawer({ prep }: { prep: PitchPrep }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Built by code from the fit map&apos;s Cannot meet and partial matches, with the partner or alternative the hub records.</p>
      {prep.probes.map((probe, index) => (
        <div key={index} className={CARD}>
          <span className="flex items-start gap-2">
            <b className="min-w-0 flex-1">{probe.need}</b>
            <span className={cn(PILL, "bg-card", PROBE[probe.kind].tone)}>{PROBE[probe.kind].label}</span>
          </span>
          <p>→ {probe.answer}</p>
        </div>
      ))}
      {prep.probes.length ? null : <p className="text-muted-foreground">No gaps: the fit map meets every need.</p>}
    </div>
  );
}

function LikelyDrawer({ prep, best, canEdit, onPractise }: { prep: PitchPrep; best: (id: string) => PracticeAttempt | null; canEdit: boolean; onPractise: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Every answer restates a proposal claim.
        {prep.dropped ? ` Code dropped ${prep.dropped} ${prep.dropped === 1 ? "item" : "items"} with no claim behind ${prep.dropped === 1 ? "it" : "them"}, an amount that isn't an approved price, or a private result.` : ""}
      </p>
      {prep.likely.map((item, index) => {
        const top = best(item.id);
        return (
          <div key={item.id} className={CARD}>
            <span className="flex items-start gap-2">
              <span className={cn(NUM, "mt-0.5 w-6 shrink-0")}>{number(index)}</span>
              <b className="min-w-0 flex-1">{item.question}</b>
              {top ? <SmallMark mark={top.mark} capped={top.mark < top.modelMark} /> : null}
            </span>
            <p className="text-xs text-muted-foreground">{item.why}</p>
            <p>{item.answer}</p>
            {item.watch ? (
              <p className="flex items-start gap-1.5 text-xs text-attention">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {item.watch}
              </p>
            ) : null}
            {canEdit ? (
              <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => onPractise(item.id)}>
                <Mic aria-hidden="true" />
                Practise
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AskDrawer({ prep }: { prep: PitchPrep }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Code keeps only questions whose research finding, fit gap or brief question exists.</p>
      {prep.ask.map((item) => (
        <div key={item.id} className={CARD}>
          <b>{item.question}</b>
          <p className="text-xs text-muted-foreground">{item.why}</p>
          <p className="flex flex-wrap items-baseline gap-1.5 text-xs">
            <span className={cn(PILL, BASIS[item.basis].tone)}>{BASIS[item.basis].short}</span>
            <q className="text-muted-foreground italic">{item.basisText}</q>
          </p>
        </div>
      ))}
    </div>
  );
}

function CoachingDrawer({ rehearsal, onOpen }: { rehearsal: Rehearsal | null; onOpen: (id: string) => void }) {
  if (!rehearsal?.coaching) return <p className="text-muted-foreground">No coaching yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <Coaching rehearsal={rehearsal} />
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onOpen(rehearsal.id)}>
        Read the transcript
      </Button>
    </div>
  );
}

/** FR-REH-6, FR-PREP-4: every rehearsal and practised question, newest first. */
function HistoryDrawer({ rehearsals, prep, attempts, onOpen, onCoaching, onPractise }: { rehearsals: Rehearsal[]; prep: PitchPrep | null; attempts: PracticeAttempt[]; onOpen: (id: string) => void; onCoaching: (id: string) => void; onPractise: (id: string) => void }) {
  const row = "flex w-full items-center gap-2.5 rounded-xl border-2 border-ink bg-card px-3 py-2 text-left text-sm hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const questions = prep ? prep.likely.map((item) => ({ item, tries: attempts.filter((attempt) => attempt.questionId === item.id) })).filter((entry) => entry.tries.length) : [];
  return (
    <div className="flex flex-col gap-2">
      {rehearsals.length ? <span className={KICKER}>Rehearsals</span> : null}
      {[...rehearsals].reverse().map((item) => (
        <button key={item.id} type="button" onClick={() => (item.coaching ? onCoaching(item.id) : onOpen(item.id))} className={row}>
          {item.coaching ? <SmallMark mark={item.coaching.mark} capped={item.coaching.mark < item.coaching.modelMark} /> : <span className="min-w-9 text-center text-xs text-muted-foreground">—</span>}
          <span className="flex-1">
            {new Date(item.startedAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {item.mode === "voice" ? "out loud" : "typed"}
          </span>
          <span className="text-xs text-muted-foreground">{item.coaching ? "Coaching" : item.status === "failed" ? "Didn't start" : "Transcript"}</span>
        </button>
      ))}
      {questions.length ? <span className={cn(KICKER, "mt-2")}>Practice answers</span> : null}
      {questions.map(({ item, tries }) => {
        const top = tries.reduce((a, b) => (b.mark > a.mark ? b : a));
        return (
          <button key={item.id} type="button" onClick={() => onPractise(item.id)} className={row}>
            <SmallMark mark={top.mark} capped={top.mark < top.modelMark} />
            <span className="min-w-0 flex-1 truncate">{item.question}</span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {tries.length} {tries.length === 1 ? "try" : "tries"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "How this was made", built by code from the prep: what code loaded, what the Coach wrote, and what code kept. */
function MadeDrawer({ prep }: { prep: PitchPrep }) {
  const steps: { ai: boolean; text: string }[] = [
    { ai: false, text: "Loaded the approved proposal, its prices and the fit map. No costs and no private results." },
    { ai: true, text: `The Coach wrote ${prep.opener ? "an opening line, " : ""}${prep.points.length} points to land, ${prep.likely.length} likely questions with answers and ${prep.ask.length} questions to ask, restating the proposal.` },
    ...(prep.dropped ? [{ ai: false, text: `Dropped ${prep.dropped} ${prep.dropped === 1 ? "item" : "items"} with no proposal claim or source behind ${prep.dropped === 1 ? "it" : "them"}, an amount, or a private result.` }] : []),
    { ai: false, text: `Copied ${prep.numbers.length} numbers to know from the pricing and fit map, and built ${prep.probes.length} ${prep.probes.length === 1 ? "gap" : "gaps"} from Cannot meet and the partial matches.` },
    { ai: false, text: "Built the meeting agenda from the points and the questions to ask, with no amounts and no private results." },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Written {new Date(prep.createdAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} by {prep.createdBy}. One AI run.
      </p>
      <ol className="flex flex-col gap-2 text-[13.5px]">
        {steps.map((step) => (
          <li key={step.text} className="flex items-start gap-1.5">
            {step.ai ? <GoogleLogo product="gemini" className="mt-0.5 size-3.5" label="By Gemini" /> : <Calculator aria-label="Calculated by code" className="mt-0.5 size-3.5 shrink-0 text-calc" />}
            {step.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** FR-PREP-4: practise one likely question in the drawer, and get a teacher's mark. */
function Practice({ opp, run, prep, question, attempts, canEdit, onPick }: { opp: Opportunity; run: Run; prep: PitchPrep; question: Likely; attempts: PracticeAttempt[]; canEdit: boolean; onPick: (id: string) => void }) {
  const [answer, setAnswer] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const latest = attempts.at(-1) ?? null;
  // FR-PREP-4, ADR-0016 D5: demo answers built by code, for people trying practice without one in mind.
  const samples = useMemo(() => sampleAnswers(prep, question), [prep, question]);
  const inBox = (Object.keys(samples) as PracticeSample[]).find((key) => samples[key].trim() === answer.trim()) ?? null;

  const submit = () =>
    startTransition(async () => {
      const result = await practise(opp.id, run.id, question.id, answer);
      setError(result.error ?? null);
    });

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">Question</span>
        <select value={question.id} onChange={(event) => onPick(event.target.value)} className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
          {prep.likely.map((item, index) => (
            <option key={item.id} value={item.id}>
              {number(index)} · {item.question}
            </option>
          ))}
        </select>
      </label>
      <div className="fh-bubble rounded-xl border-2 border-ink bg-ai-soft px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground">{opp.contact?.name ?? opp.prospect?.name ?? "The client"} asks</span>
        <p className="text-base leading-snug">&ldquo;{question.question}&rdquo;</p>
      </div>
      {canEdit ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Your answer, as you&apos;d say it</span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={5}
              maxLength={3000}
              placeholder="Type your answer…"
              className="rounded-lg border border-input bg-card px-3 py-2 leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <p className="-mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-full border border-dashed border-muted-foreground/60 px-1.5 text-[10px] font-semibold">Demo</span>
            Try a sample:
            <button type="button" onClick={() => setAnswer(samples.strong)} className="text-link underline-offset-2 hover:underline">
              strong
            </button>
            ·
            <button type="button" onClick={() => setAnswer(samples.weak)} className="text-link underline-offset-2 hover:underline">
              weak
            </button>
            {inBox ? <span className="w-full">This is the {inBox} sample answer. Get feedback as it is, or edit it first.</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending || answer.trim().length < 15} onClick={submit}>
              <Sparkles aria-hidden="true" />
              {pending ? "Marking…" : "Get feedback"}
            </Button>
            <span className="text-xs text-muted-foreground">One AI run · code checks every amount against your prices</span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </>
      ) : null}

      {latest ? (
        <div className="relative flex flex-col gap-2 rounded-xl border-2 border-ink bg-card px-3.5 py-3 pr-20">
          <TeacherMark mark={latest.mark} capped={latest.mark < latest.modelMark} />
          {latest.sample ? <span className="w-fit rounded-full border border-dashed border-muted-foreground/60 px-2 text-[11px] font-semibold text-muted-foreground">Demo: the {latest.sample} sample answer</span> : null}
          {latest.amountFlags.map((flag) => (
            <div key={flag.raw} className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-destructive">
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                Code check: &ldquo;{flag.raw}&rdquo; isn&apos;t one of your approved prices.
              </span>
              {flag.approved.length ? <span className="text-muted-foreground">The proposal says: {flag.approved.join(" · ")}</span> : <span className="text-muted-foreground">The proposal has no priced lines. Say the pricing is in the proposal.</span>}
            </div>
          ))}
          {latest.landed.length ? (
            <ul className="flex flex-col gap-1">
              {latest.landed.map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-fit-strong" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {latest.add.length ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted-foreground">Add or fix</span>
              <ul className="flex flex-col gap-1">
                {latest.add.map((item) => (
                  <li key={item.text} className="flex items-start gap-1.5">
                    <span aria-hidden="true" className="text-attention">→</span>
                    <span>
                      {item.text}
                      {item.claimIds.length ? <span className="ml-1 text-[11px] text-muted-foreground">(from the proposal)</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {latest.tip ? <p className="fh-hand text-base text-destructive">{latest.tip}</p> : null}
          {attempts.length > 1 ? <p className="text-xs text-muted-foreground">Earlier tries: {attempts.slice(0, -1).map((attempt) => `${attempt.mark}/10${attempt.sample ? ` (${attempt.sample} sample)` : ""}`).join(", ")}</p> : null}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-muted-foreground">Answer the question, then get a mark out of 10, what landed, and what to add.</p>
      )}
    </div>
  );
}
