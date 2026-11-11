"use client";

import { AlertTriangle, Check, Keyboard, Mic, PhoneOff, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LoadingChip } from "@/components/flowhub/loading";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { REHEARSAL_LIMITS, buyerOf } from "@/lib/deal-room/rehearsal";
import { clientAuth } from "@/lib/firebase/client";
import { useLiveCollection } from "@/lib/firebase/live";
import { type VoiceState, VoiceRehearsal } from "@/lib/live/voice-client";
import type { Opportunity, Rehearsal, RehearsalMode, RehearsalMood, RehearsalNotes, RehearsalPush, RehearsalVoice, Run } from "@/lib/schema";
import { cn } from "cn";
import { beginRehearsal, coachMyRehearsal, sayInRehearsal } from "./after-actions";
import { Card } from "./gate-parts";
import { TeacherMark } from "./prep-view";

/**
 * Rehearsal, inside step E (PRD 7.26, ADR-0017). The person rehearses the
 * meeting with the buyer, played by Gemini: out loud through FlowHub's relay,
 * or typed. The transcript arrives through a Firestore listener (invariant 9);
 * the coaching is checked in code, and a wrong amount caps the mark.
 */

const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? "";
const PUSH: { key: RehearsalPush; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "fit", label: "Fit and gaps" },
  { key: "timing", label: "Timing" },
];
const MOODS: { key: RehearsalMood; label: string }[] = [
  { key: "sceptical", label: "Sceptical" },
  { key: "busy", label: "Busy" },
  { key: "friendly", label: "Friendly" },
];

const VOICES: { key: RehearsalVoice; label: string }[] = [
  { key: "female", label: "Female voice" },
  { key: "male", label: "Male voice" },
];

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, "0")}`;

export function RehearsalView({ opp, run, canEdit }: { opp: Opportunity; run: Run; canEdit: boolean }) {
  const path = `workspaces/${opp.workspaceId}/opportunities/${opp.id}/rehearsals`;
  const all = useLiveCollection<Rehearsal>(path, "startedAt");
  const mine = useMemo(() => all.filter((item) => item.writeRunId === run.id), [all, run.id]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = mine.find((item) => item.id === openId) ?? mine.at(-1) ?? null;
  const [setup, setSetup] = useState(false);
  const showSetup = setup || !open;

  return (
    <Card
      title="Rehearse the meeting"
      id="rehearse"
      marker={
        <>
          <AiMarker>The buyer is played by Gemini</AiMarker>
          <CalcMarker>Amounts checked by code</CalcMarker>
        </>
      }
      action={
        // A voice rehearsal that never connected stays `ready`; let the person start another.
        open && !showSetup && canEdit && open.status !== "live" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setSetup(true)}>
            New rehearsal
          </Button>
        ) : null
      }
    >
      {showSetup ? (
        <Setup
          opp={opp}
          run={run}
          canEdit={canEdit}
          onStarted={(id) => {
            setOpenId(id);
            setSetup(false);
          }}
          onCancel={open ? () => setSetup(false) : undefined}
        />
      ) : open ? (
        <Session key={open.id} opp={opp} run={run} rehearsal={open} />
      ) : null}
      {mine.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-5 py-2.5 text-xs text-muted-foreground">
          Earlier rehearsals:
          {mine
            .slice(0, -1)
            .reverse()
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOpenId(item.id);
                  setSetup(false);
                }}
                className={cn("rounded-full border px-2 py-0.5 hover:bg-muted", item.id === open?.id && "border-ink font-semibold text-foreground")}
              >
                {new Date(item.startedAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {item.mode}
                {item.coaching ? ` · ${item.coaching.mark}/10` : ""}
              </button>
            ))}
        </div>
      ) : null}
    </Card>
  );
}

function Setup({ opp, run, canEdit, onStarted, onCancel }: { opp: Opportunity; run: Run; canEdit: boolean; onStarted: (id: string) => void; onCancel?: () => void }) {
  const buyer = buyerOf(opp.contact);
  const [pushOn, setPushOn] = useState<RehearsalPush[]>(["price", "fit", "timing"]);
  const [mood, setMood] = useState<RehearsalMood>("sceptical");
  const [voice, setVoice] = useState<RehearsalVoice>("female");
  const [own, setOwn] = useState("");
  const [pending, startTransition] = useTransition();
  const [starting, setStarting] = useState<RehearsalMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (mode: RehearsalMode) => {
    setStarting(mode);
    startTransition(async () => {
      const result = await beginRehearsal(opp.id, run.id, { mode, pushOn, mood, voice, own });
      setError(result.error ?? null);
      if (result.id) onStarted(result.id);
    });
  };

  return (
    <div className="grid gap-5 px-5 py-4 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="fh-hand flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ai-soft text-lg">
            {opp.contact?.name?.trim()
              ? buyer.name
                  .split(/\s+/)
                  .filter((part) => /^[A-Z]/.test(part))
                  .slice(-2)
                  .map((part) => part[0])
                  .join("") || "?"
              : "?"}
          </span>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-muted-foreground">You&apos;re pitching to</span>
            <p className="font-bold">{buyer.name}</p>
            <p className="text-xs text-muted-foreground">
              {buyer.role}, {opp.prospect?.name ?? "the prospect"}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground">
          The buyer knows only what your approved proposal says: its claims, its prices, the needs you can&apos;t meet and who covers them, and the questions research left open. Never your costs or private results.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold">They push back on</legend>
          <div className="flex flex-wrap gap-2">
            {PUSH.map((item) => {
              const on = pushOn.includes(item.key);
              return (
                <label key={item.key} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold", on ? "border-ink bg-primary/30" : "border-ink/20")}>
                  <input type="checkbox" className="accent-ink" checked={on} onChange={() => setPushOn((list) => (on ? list.filter((key) => key !== item.key) : [...list, item.key]))} />
                  {item.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold">Their mood</legend>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((item) => (
              <label key={item.key} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold", mood === item.key ? "border-ink bg-primary/30" : "border-ink/20")}>
                <input type="radio" name="rehearsal-mood" className="accent-ink" checked={mood === item.key} onChange={() => setMood(item.key)} />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        {LIVE_URL ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-semibold">Their voice, when you rehearse out loud</legend>
            <div className="flex flex-wrap gap-2">
              {VOICES.map((item) => (
                <label key={item.key} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold", voice === item.key ? "border-ink bg-primary/30" : "border-ink/20")}>
                  <input type="radio" name="rehearsal-voice" className="accent-ink" checked={voice === item.key} onChange={() => setVoice(item.key)} />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold">
            Your own notes <span className="font-normal text-muted-foreground">(optional, kept beside you during the rehearsal)</span>
          </span>
          <textarea
            value={own}
            onChange={(event) => setOwn(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything you'd have on paper: names to mention, a story to tell, what not to promise…"
            className="rounded-lg border border-input bg-card px-3 py-2 leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            {LIVE_URL ? (
              <Button type="button" disabled={pending} onClick={() => start("voice")}>
                <Mic aria-hidden="true" />
                {pending && starting === "voice" ? "Setting up…" : "Rehearse out loud"}
              </Button>
            ) : null}
            <Button type="button" variant={LIVE_URL ? "outline" : "default"} disabled={pending} onClick={() => start("text")}>
              <Keyboard aria-hidden="true" />
              {pending && starting === "text" ? "Setting up…" : "Rehearse by typing"}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground">An editor can rehearse.</p>
        )}
        <p className="text-xs text-muted-foreground">Up to 10 minutes. Uses one of today&apos;s AI runs, coaching included.{LIVE_URL ? " Out loud needs your microphone." : ""}</p>
        {pending ? <LoadingChip label="Briefing the buyer" /> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function Session({ opp, run, rehearsal }: { opp: Opportunity; run: Run; rehearsal: Rehearsal }) {
  const [voiceState, setVoiceState] = useState<VoiceState | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const voice = useRef<VoiceRehearsal | null>(null);
  const transcript = useRef<HTMLOListElement | null>(null);
  const coachAsked = useRef(false);
  const live = rehearsal.status === "live" || rehearsal.status === "ready";
  const stale = rehearsal.rev !== run.rev;

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [rehearsal.turns.length]);

  useEffect(() => () => voice.current?.end(), []);

  const coach = () =>
    startTransition(async () => {
      const result = await coachMyRehearsal(opp.id, rehearsal.id);
      setError(result.error ?? null);
    });

  // When a voice call ends (by the person, the cap or a dropped line), ask for coaching once.
  useEffect(() => {
    if (rehearsal.status === "ended" && rehearsal.mode === "voice" && !coachAsked.current && rehearsal.turns.some((turn) => turn.who === "seller")) {
      coachAsked.current = true;
      coach();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rehearsal.status]);

  const connect = async () => {
    const user = clientAuth().currentUser;
    if (!user) return setError("Sign in again first.");
    setError(null);
    setVoiceState("connecting");
    const session = new VoiceRehearsal({
      onState: (state, message) => {
        setVoiceState(state);
        setVoiceMessage(state === "error" ? (message ?? null) : null);
      },
      onLevel: setLevel,
    });
    voice.current = session;
    await session.start(LIVE_URL, { idToken: await user.getIdToken(), workspaceId: opp.workspaceId, opportunityId: opp.id, rehearsalId: rehearsal.id });
  };

  const end = () => {
    if (rehearsal.mode === "voice" && voice.current) {
      voice.current.end();
      return;
    }
    coach();
  };

  const send = () => {
    const said = text.trim();
    if (!said) return;
    startTransition(async () => {
      const result = await sayInRehearsal(opp.id, rehearsal.id, said);
      setError(result.error ?? null);
      if (!result.error) setText("");
    });
  };

  const elapsed = Math.max(0, Math.round((now - Date.parse(rehearsal.startedAt)) / 1000));
  const left = Math.max(0, REHEARSAL_LIMITS.seconds - elapsed);
  const sellerTurns = rehearsal.turns.filter((turn) => turn.who === "seller").length;
  const speaking = voiceState === "live";

  return (
    <div className="flex flex-col gap-4 px-5 py-4 text-sm">
      {stale ? (
        <p className="flex items-center gap-2 rounded-xl border border-attention/40 bg-attention-soft/30 px-4 py-2.5">
          <AlertTriangle aria-hidden="true" className="size-4 text-attention" />
          The proposal changed after this rehearsal. Start a new one to rehearse the latest version.
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,19rem)]">
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-ink/30 bg-muted/30 px-4 py-5 text-center">
          <span
            aria-hidden="true"
            className={cn("flex size-24 items-center justify-center rounded-full border-[3px] border-ink shadow-comic transition-[background-color] motion-reduce:transition-none", speaking ? "bg-primary" : "bg-primary/25")}
          >
            <span className="flex items-center gap-1">
              {[0.6, 1, 0.8, 1, 0.6].map((weight, index) => (
                <span key={index} className="w-1.5 rounded-full bg-ink" style={{ height: `${10 + (speaking ? level * 40 * weight : 0)}px` }} />
              ))}
            </span>
          </span>
          <span className="font-mono text-xl font-semibold tabular-nums">{live ? clock(left) : clock(Math.min(REHEARSAL_LIMITS.seconds, rehearsal.turns.at(-1)?.at ?? 0))}</span>
          <span className="text-xs text-muted-foreground">
            {rehearsal.buyer.name}, {rehearsal.buyer.role}
            <br />
            {rehearsal.mood} · pushes on {rehearsal.pushOn.join(", ") || "anything"}
          </span>
          {live && rehearsal.mode === "voice" ? (
            voiceState === "live" || voiceState === "connecting" ? (
              <Button type="button" variant="outline" onClick={end} disabled={voiceState === "connecting"}>
                <PhoneOff aria-hidden="true" />
                {voiceState === "connecting" ? "Connecting…" : "End and get coaching"}
              </Button>
            ) : (
              <Button type="button" onClick={connect}>
                <Mic aria-hidden="true" />
                {voiceState === "error" ? "Try again" : "Start talking"}
              </Button>
            )
          ) : null}
          {live && rehearsal.mode === "text" ? (
            <Button type="button" variant="outline" disabled={pending || sellerTurns === 0} onClick={end}>
              <PhoneOff aria-hidden="true" />
              End and get coaching
            </Button>
          ) : null}
          {rehearsal.status === "ended" ? (
            <Button type="button" disabled={pending} onClick={coach}>
              <Sparkles aria-hidden="true" />
              {pending ? "Coaching…" : "Get coaching"}
            </Button>
          ) : null}
          {rehearsal.mode === "voice" && live && !voiceState ? <p className="text-xs text-muted-foreground">The buyer speaks first. Talk naturally; you can interrupt.</p> : null}
          {voiceMessage ? <p className="text-xs text-destructive">{voiceMessage}</p> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <ol ref={transcript} aria-live="polite" className="flex max-h-96 min-h-40 flex-col gap-2 overflow-y-auto pr-1">
            {rehearsal.turns.length === 0 ? (
              <li className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground">
                {rehearsal.mode === "voice" ? "The transcript appears here as you talk." : "The buyer is getting ready…"}
              </li>
            ) : null}
            {rehearsal.turns.map((turn, index) => {
              const flag = rehearsal.coaching?.amountFlags.find((item) => item.turn === index);
              return (
                <li
                  key={index}
                  className={cn("flex max-w-[85%] flex-col gap-0.5 rounded-xl border-2 px-3 py-2", turn.who === "buyer" ? "self-start border-ai/40 bg-ai-soft" : "self-end border-ink/30 bg-primary/15")}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    {turn.who === "buyer" ? rehearsal.buyer.name : "You"}
                    <span className="font-mono">{clock(turn.at)}</span>
                  </span>
                  <span>{turn.text}</span>
                  {flag ? (
                    <span className="flex items-start gap-1 text-xs font-semibold text-destructive">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      &ldquo;{flag.raw}&rdquo; isn&apos;t an approved price.
                    </span>
                  ) : null}
                </li>
              );
            })}
            {pending && rehearsal.mode === "text" && live ? (
              <li className="self-start">
                <LoadingChip label={`${rehearsal.buyer.name} is thinking`} />
              </li>
            ) : null}
          </ol>
          {live && rehearsal.mode === "text" ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <label htmlFor="rehearsal-say" className="sr-only">
                What you say
              </label>
              <input
                id="rehearsal-say"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={REHEARSAL_LIMITS.turnChars}
                placeholder="Answer as you would in the meeting…"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button type="submit" disabled={pending || !text.trim()}>
                <Send aria-hidden="true" />
                Say it
              </Button>
            </form>
          ) : null}
          {live && rehearsal.mode === "text" ? (
            <p className="text-xs text-muted-foreground">
              {sellerTurns} of {REHEARSAL_LIMITS.sellerTurns} turns · type it the way you&apos;d say it
            </p>
          ) : null}
          {rehearsal.status === "failed" && rehearsal.error ? <p className="text-sm text-destructive">{rehearsal.error}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        {rehearsal.notes ? <Notes notes={rehearsal.notes} /> : null}
      </div>

      {pending && !live ? <LoadingChip label="The Coach is reading the transcript" /> : null}
      {rehearsal.coaching ? <Coaching rehearsal={rehearsal} /> : null}
    </div>
  );
}

/** FR-REH-7: notes at hand, like paper notes in a real meeting. Built by code; the buyer never sees them. */
function Notes({ notes }: { notes: RehearsalNotes }) {
  const section = "flex flex-col gap-1 border-t border-dashed border-ink/20 pt-2 first:border-t-0 first:pt-0";
  const heading = "text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase";
  return (
    <aside aria-label="Your notes" className="flex flex-col gap-2.5 rounded-xl border-2 border-ink/25 bg-primary/10 px-3.5 py-3 lg:col-span-2 xl:col-span-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <h4 className="fh-hand text-xl leading-none">Your notes</h4>
        <CalcMarker>From your deal</CalcMarker>
      </div>
      <div className="flex max-h-96 flex-col gap-2.5 overflow-y-auto pr-1 text-[13px] leading-snug">
        {notes.opener ? (
          <div className={section}>
            <span className={heading}>Open with</span>
            <p>&ldquo;{notes.opener}&rdquo;</p>
          </div>
        ) : null}
        {notes.points.length ? (
          <div className={section}>
            <span className={heading}>Points to land</span>
            <ol className="flex list-decimal flex-col gap-0.5 pl-4">
              {notes.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {notes.numbers.length ? (
          <div className={section}>
            <span className={heading}>Numbers to know</span>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5">
              {notes.numbers.map((number) => (
                <div key={number.label} className="contents">
                  <dt className="text-muted-foreground">{number.label}</dt>
                  <dd className={cn("text-right", number.money && "font-mono font-semibold")}>{number.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {notes.probes.length ? (
          <div className={section}>
            <span className={heading}>If they probe</span>
            <ul className="flex flex-col gap-1.5">
              {notes.probes.map((probe) => (
                <li key={probe.need}>
                  <b>{probe.need}</b>
                  <span className="text-muted-foreground"> · {probe.kind === "outside" ? "we don't do this" : "partly covered"}</span>
                  <br />→ {probe.answer}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {notes.own ? (
          <div className={section}>
            <span className={heading}>My notes</span>
            <p className="whitespace-pre-line">{notes.own}</p>
          </div>
        ) : null}
        {!notes.opener && !notes.points.length ? <p className="text-xs text-muted-foreground">Write the pitch prep above to add an opening line and points to land.</p> : null}
      </div>
    </aside>
  );
}

function Coaching({ rehearsal }: { rehearsal: Rehearsal }) {
  const coaching = rehearsal.coaching!;
  return (
    <section aria-label="Coaching" className="flex flex-col gap-3 rounded-xl border-2 border-ink bg-card px-4 py-4">
      <div className="relative flex flex-col gap-1 pr-20">
        <TeacherMark mark={coaching.mark} capped={coaching.mark < coaching.modelMark} />
        <h4 className="fh-hand text-2xl leading-tight">Coaching after your rehearsal</h4>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {Math.round((rehearsal.turns.at(-1)?.at ?? 0) / 60) || "Under 1"} min with {rehearsal.buyer.name} · <AiMarker>Coach&apos;s feedback</AiMarker>
          <CalcMarker>Amounts checked by code</CalcMarker>
        </p>
      </div>
      {coaching.amountFlags.map((flag) => (
        <div key={flag.raw} className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-destructive">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            Code check: at {clock(flag.at)} you said &ldquo;{flag.raw}&rdquo;, which isn&apos;t one of your approved prices.
            {coaching.mark < coaching.modelMark ? ` The mark is capped at ${coaching.mark}.` : ""}
          </span>
          {flag.approved.length ? <span className="text-muted-foreground">The proposal says: {flag.approved.join(" · ")}</span> : <span className="text-muted-foreground">The proposal has no priced lines. Say the pricing is in the proposal.</span>}
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fit-strong">What landed</span>
          <ul className="flex flex-col gap-1">
            {coaching.landed.map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-fit-strong" />
                {item}
              </li>
            ))}
            {coaching.landed.length ? null : <li className="text-muted-foreground">Nothing stood out yet.</li>}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-attention">What to fix</span>
          <ul className="flex flex-col gap-1">
            {coaching.fix.map((item) => (
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
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Questions you weren&apos;t ready for</span>
          <ul className="flex flex-col gap-1">
            {coaching.unready.map((item) => (
              <li key={item} className="italic">
                &ldquo;{item}&rdquo;
              </li>
            ))}
            {coaching.unready.length ? null : <li className="text-muted-foreground">None. Well handled.</li>}
          </ul>
        </div>
      </div>
      {coaching.tip ? <p className="fh-hand text-lg text-destructive">{coaching.tip}</p> : null}
      {coaching.dropped ? <p className="text-xs text-muted-foreground">Code dropped {coaching.dropped} coaching {coaching.dropped === 1 ? "item" : "items"} that stated an amount or named a private result.</p> : null}
    </section>
  );
}
