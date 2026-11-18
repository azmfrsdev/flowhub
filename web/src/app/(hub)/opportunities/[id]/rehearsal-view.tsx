"use client";

import { AlertTriangle, Check, ChevronRight, Keyboard, Mic, PhoneOff, Send, Sparkles, X } from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { BoxTag } from "./stage-box";
import { SmallMark, TeacherMark } from "./teacher-mark";

/**
 * Rehearsal, inside step E (PRD 7.26, ADR-0017). The person rehearses the
 * meeting with the buyer, played by Gemini: out loud through FlowHub's relay,
 * or typed. The transcript arrives through a Firestore listener (invariant 9);
 * the coaching is checked in code, and a wrong amount caps the mark.
 * FR-PREP-6: a Rehearse box on the step, the set-up in a drawer, and the
 * rehearsal itself in a focus view over the page.
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
const startedAt = (rehearsal: Rehearsal) => new Date(rehearsal.startedAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const length = (rehearsal: Rehearsal) => `${Math.max(1, Math.round((rehearsal.turns.at(-1)?.at ?? 0) / 60))} min`;
const initials = (opp: Opportunity) =>
  opp.contact?.name?.trim()
    ? buyerOf(opp.contact)
        .name.split(/\s+/)
        .filter((part) => /^[A-Z]/.test(part))
        .slice(-2)
        .map((part) => part[0])
        .join("") || "?"
    : "?";

/** This proposal's rehearsals, oldest first (FR-REH-6). */
export function useRehearsals(opp: Opportunity, run: Run) {
  const all = useLiveCollection<Rehearsal>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/rehearsals`, "startedAt");
  return useMemo(() => all.filter((item) => item.writeRunId === run.id), [all, run.id]);
}

export type RehearsalSetup = ReturnType<typeof useRehearsalSetup>;

/** FR-REH-1, FR-REH-8: what the buyer pushes on, their mood and voice, and the person's own notes; shared by the box and the drawer. */
export function useRehearsalSetup(opp: Opportunity, run: Run, onStarted: (id: string) => void) {
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
  const togglePush = (key: RehearsalPush) => setPushOn((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));
  return { pushOn, togglePush, mood, setMood, voice, setVoice, own, setOwn, pending, starting, error, start };
}

function StartButtons({ setup, size }: { setup: RehearsalSetup; size?: "sm" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {LIVE_URL ? (
        <Button type="button" variant="outline" size={size} disabled={setup.pending} onClick={() => setup.start("voice")}>
          <Mic aria-hidden="true" />
          {setup.pending && setup.starting === "voice" ? "Setting up…" : "Rehearse out loud"}
        </Button>
      ) : null}
      <Button type="button" variant="outline" size={size} disabled={setup.pending} onClick={() => setup.start("text")}>
        <Keyboard aria-hidden="true" />
        {setup.pending && setup.starting === "text" ? "Setting up…" : LIVE_URL ? "Type instead" : "Rehearse by typing"}
      </Button>
    </div>
  );
}

/** FR-PREP-6: the Rehearse box: who they pitch to, the set-up on one line, start, and the last result. */
export function RehearseSummary({ opp, setup, latest, canEdit, onSetup, onOpen, onCoaching }: { opp: Opportunity; setup: RehearsalSetup; latest: Rehearsal | null; canEdit: boolean; onSetup: () => void; onOpen: (id: string) => void; onCoaching: (id: string) => void }) {
  const buyer = buyerOf(opp.contact);
  const chip = "rounded-full bg-muted px-2 text-[11.5px] leading-5 whitespace-nowrap";
  const pushes = setup.pushOn.length ? `Pushes on ${PUSH.filter((item) => setup.pushOn.includes(item.key)).map((item) => item.label.toLowerCase()).join(", ")}` : "Pushes on anything";
  const result = "flex w-full items-center gap-2.5 border-t border-dashed border-line-soft pt-2.5 text-left text-[13px] hover:text-link focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  return (
    <div className="flex flex-col gap-3 px-4 pt-2.5 text-sm">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="fh-hand grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-ai-soft text-lg">
          {initials(opp)}
        </span>
        <span className="flex min-w-0 flex-col">
          <b className="truncate">{buyer.name}</b>
          <span className="truncate text-xs text-muted-foreground">
            {buyer.role}, {opp.prospect?.name ?? "the prospect"}
          </span>
        </span>
      </div>
      <button type="button" onClick={onSetup} title="Change the set-up" className="flex gap-1.5 overflow-hidden rounded-full text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className={cn(chip, "capitalize")}>{setup.mood}</span>
        <span className={chip}>{pushes}</span>
        {LIVE_URL ? <span className={chip}>{setup.voice === "female" ? "Female voice" : "Male voice"}</span> : null}
      </button>
      {canEdit ? <StartButtons setup={setup} size="sm" /> : <p className="text-muted-foreground">An editor can rehearse.</p>}
      {setup.error ? <p className="text-xs text-destructive">{setup.error}</p> : null}
      {latest && (latest.status === "live" || latest.status === "ready") ? (
        <button type="button" onClick={() => onOpen(latest.id)} className={result}>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
          <span className="flex-1 font-semibold">Rehearsal in progress · rejoin</span>
          <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </button>
      ) : latest?.coaching ? (
        <button type="button" onClick={() => onCoaching(latest.id)} className={result}>
          <SmallMark mark={latest.coaching.mark} capped={latest.coaching.mark < latest.coaching.modelMark} className="h-7 min-w-11 text-lg" />
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="truncate">
              Last: {startedAt(latest)} · {latest.mode === "voice" ? "out loud" : "typed"} · {length(latest)}
            </b>
            <span className={cn("truncate text-xs", latest.coaching.mark < latest.coaching.modelMark ? "text-destructive" : "text-muted-foreground")}>{latest.coaching.mark < latest.coaching.modelMark ? "Capped by code: a wrong amount" : "See the coaching"}</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </button>
      ) : latest?.status === "ended" ? (
        <button type="button" onClick={() => onOpen(latest.id)} className={result}>
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-ai" />
          <span className="flex-1 font-semibold">Last rehearsal ended · get coaching</span>
          <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Up to 10 minutes · one AI run · your notes stay beside you · amounts checked by code</p>
      )}
    </div>
  );
}

/** FR-REH-1, FR-REH-2, FR-REH-8: the set-up, in the drawer. */
export function RehearsalSetupForm({ setup, canEdit }: { setup: RehearsalSetup; canEdit: boolean }) {
  const pill = (on: boolean) => cn("flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold whitespace-nowrap", on ? "border-ink bg-primary/30" : "border-ink/20");
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">The buyer knows only your approved proposal: its claims, its prices, the needs you can&apos;t meet and who covers them, and the questions research left open. Never your costs or private results.</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold">They push back on</legend>
        <div className="flex flex-wrap gap-2">
          {PUSH.map((item) => (
            <label key={item.key} className={pill(setup.pushOn.includes(item.key))}>
              <input type="checkbox" className="accent-ink" checked={setup.pushOn.includes(item.key)} onChange={() => setup.togglePush(item.key)} />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold">Their mood</legend>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((item) => (
            <label key={item.key} className={pill(setup.mood === item.key)}>
              <input type="radio" name="rehearsal-mood" className="accent-ink" checked={setup.mood === item.key} onChange={() => setup.setMood(item.key)} />
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
              <label key={item.key} className={pill(setup.voice === item.key)}>
                <input type="radio" name="rehearsal-voice" className="accent-ink" checked={setup.voice === item.key} onChange={() => setup.setVoice(item.key)} />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">
          Your own notes <span className="font-normal text-muted-foreground">(optional, kept beside you)</span>
        </span>
        <textarea
          value={setup.own}
          onChange={(event) => setup.setOwn(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Names to mention, a story to tell, what not to promise…"
          className="rounded-lg border border-input bg-card px-3 py-2 leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {canEdit ? <StartButtons setup={setup} /> : <p className="text-muted-foreground">An editor can rehearse.</p>}
      <p className="text-xs text-muted-foreground">Up to 10 minutes. Uses one of today&apos;s AI runs, coaching included.{LIVE_URL ? " Out loud needs your microphone." : ""}</p>
      {setup.pending ? <LoadingChip label="Briefing the buyer" /> : null}
      {setup.error ? <p className="text-sm text-destructive">{setup.error}</p> : null}
    </div>
  );
}

/**
 * FR-PREP-6: the rehearsal in a focus view over the page, on a native dialog. Leaving
 * unmounts the session, which ends a voice call; a typed one can be rejoined.
 */
export const RehearsalStage = forwardRef<HTMLDialogElement, { opp: Opportunity; run: Run; rehearsal: Rehearsal | null; onClose: () => void }>(function RehearsalStage({ opp, run, rehearsal, onClose }, ref) {
  const close = () => (ref && typeof ref === "object" ? ref.current?.close() : undefined);
  return (
    <dialog ref={ref} aria-labelledby="rehearsal-stage-title" onClose={onClose} className="fixed inset-0 m-auto h-[min(94dvh,56rem)] max-h-none w-[min(96vw,84rem)] max-w-none rounded-2xl border-2 border-ink bg-background p-0 text-foreground shadow-comic backdrop:bg-black/45">
      {rehearsal ? (
        <div className="flex h-full flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b-2 border-ink px-5 py-3">
            <h2 id="rehearsal-stage-title" className="text-2xl">
              {rehearsal.status === "live" || rehearsal.status === "ready" ? "Rehearsing with" : "Rehearsal with"} {rehearsal.buyer.name}
            </h2>
            <BoxTag kind="ai">Buyer played by Gemini</BoxTag>
            <BoxTag kind="calc">Amounts checked by code</BoxTag>
            <span className="flex-1" />
            <Button type="button" variant="ghost" size="sm" onClick={close} title={rehearsal.mode === "voice" && rehearsal.status === "live" ? "Leaving ends the call" : "Close"}>
              <X aria-hidden="true" />
              {rehearsal.status === "live" || rehearsal.status === "ready" ? "Leave" : "Close"}
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Session key={rehearsal.id} opp={opp} run={run} rehearsal={rehearsal} />
          </div>
        </div>
      ) : null}
    </dialog>
  );
});

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

export function Coaching({ rehearsal }: { rehearsal: Rehearsal }) {
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
