"use client";

import { AlertTriangle, Check, GraduationCap, MessageCircleQuestion, Mic, RotateCw, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { LoadingChip } from "@/components/flowhub/loading";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { sampleAnswers } from "@/lib/deal-room/prep";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { Opportunity, PitchPrep, PracticeAttempt, PracticeSample, Run } from "@/lib/schema";
import { cn } from "cn";
import { practise, writePrep } from "./after-actions";
import { Card } from "./gate-parts";

/**
 * Step E, Pitch prep (PRD 7.24, ADR-0016 D3): a pitch on a page, likely
 * questions with suggested answers, questions to ask, and practice with a
 * teacher's mark. The model restates the proposal; code supplies the numbers
 * and the gaps, and checks every amount said in practice.
 */
export function PrepView({ opp, run, canEdit }: { opp: Opportunity; run: Run; canEdit: boolean }) {
  const base = `workspaces/${opp.workspaceId}/opportunities/${opp.id}/preps/${run.id}`;
  const { data: prep } = useLiveDoc<PitchPrep>(base, null);
  const attempts = useLiveCollection<PracticeAttempt>(prep ? `${base}/attempts` : null, "createdAt");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [practising, setPractising] = useState<string | null>(null);
  const stale = prep ? prep.rev !== run.rev : false;

  const write = () =>
    startTransition(async () => {
      const result = await writePrep(opp.id, run.id);
      setError(result.error ?? null);
    });

  if (!prep)
    return (
      <Card title="Pitch prep" marker={<AiMarker>Restates the proposal only</AiMarker>}>
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <p className="text-muted-foreground">
            Get ready for the meeting with {opp.contact?.name ?? opp.prospect?.name ?? "the client"}: an opening line and three points to land, the numbers to know, the gaps they&apos;ll probe, the questions they&apos;re likely to ask with suggested answers, and the questions you should ask them. Then practise your answers and get marked.
          </p>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={pending} onClick={write}>
                <GraduationCap aria-hidden="true" />
                {pending ? "Writing the prep…" : "Write the pitch prep"}
              </Button>
              <span className="text-xs text-muted-foreground">{pending ? "About half a minute." : "Uses one of today's AI runs."}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">An editor can write the prep.</p>
          )}
          {pending ? <LoadingChip label="Reading the proposal" /> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </Card>
    );

  const question = prep.likely.find((item) => item.id === practising) ?? null;
  return (
    <div className="flex flex-col gap-5">
      {stale ? (
        <p className="flex items-center gap-2 rounded-xl border border-attention/40 bg-attention-soft/30 px-4 py-2.5 text-sm">
          <AlertTriangle aria-hidden="true" className="size-4 text-attention" />
          The proposal changed after this prep was written. Write it again to match.
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title="Your pitch on a page"
          marker={
            <>
              <AiMarker>Restates the proposal</AiMarker>
              <CalcMarker>Numbers and gaps by code</CalcMarker>
            </>
          }
          action={
            canEdit ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={write}>
                <RotateCw aria-hidden="true" />
                {pending ? "Writing…" : "Write again"}
              </Button>
            ) : null
          }
        >
          <div className="flex flex-col gap-4 px-5 py-4 text-sm">
            {prep.opener ? (
              <div className="fh-bubble relative rounded-xl border-2 border-ink bg-primary/15 px-4 py-3">
                <span className="text-xs font-semibold text-muted-foreground">Open with</span>
                <p className="text-base leading-snug">&ldquo;{prep.opener.text}&rdquo;</p>
              </div>
            ) : null}
            {prep.points.length ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Three points to land</span>
                <ol className="grid gap-2 sm:grid-cols-3">
                  {prep.points.map((point, index) => (
                    <li key={index} className="flex flex-col gap-1.5 rounded-lg border-2 border-ink/20 bg-card px-3 py-2.5">
                      <span className="w-fit rounded-md bg-ink px-1.5 text-[11px] font-bold text-background">{String(index + 1).padStart(2, "0")}</span>
                      <span>{point.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Numbers to know</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {prep.numbers.map((number) => (
                  <div key={number.label} className={cn("flex flex-col gap-0.5 rounded-lg px-3 py-2", number.money ? "bg-fit-strong-soft" : "bg-muted/60")}>
                    <span className="text-[11px] text-muted-foreground">{number.label}</span>
                    <b className={cn("text-sm", number.money && "font-mono text-fit-strong")}>{number.value}</b>
                  </div>
                ))}
              </div>
            </div>
            {prep.probes.length ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Gaps they&apos;ll probe</span>
                <ul className="flex flex-col gap-1.5">
                  {prep.probes.map((probe) => (
                    <li key={probe.need} className="flex flex-col gap-0.5 rounded-lg border border-attention/30 bg-attention-soft/30 px-3 py-2">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <AlertTriangle aria-hidden="true" className="size-3.5 text-attention" />
                        {probe.need}
                      </span>
                      <span className="text-muted-foreground">{probe.answer}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Questions to ask them" marker={<CalcMarker>Each tied to research or a gap</CalcMarker>}>
          <ol className="flex flex-col divide-y">
            {prep.ask.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
                <span className="flex items-start gap-2">
                  <MessageCircleQuestion aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-link" />
                  <b>{item.question}</b>
                </span>
                <span className="pl-6 text-xs text-muted-foreground">{item.why}</span>
                <span className="pl-6 text-[11px] text-muted-foreground">
                  {item.basis === "research" ? "From research: " : item.basis === "gap" ? "From the fit map: " : "Left open by the brief: "}
                  <q className="italic">{item.basisText}</q>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="Questions they'll likely ask" marker={<AiMarker>Answers restate the proposal</AiMarker>} action={<span className="text-xs text-muted-foreground">{prep.likely.length} questions</span>}>
        <ol className="flex flex-col divide-y">
          {prep.likely.map((item, index) => {
            const best = attempts.filter((attempt) => attempt.questionId === item.id).reduce<number | null>((top, attempt) => (top === null || attempt.mark > top ? attempt.mark : top), null);
            return (
              <li key={item.id} className="flex flex-col gap-1.5 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-0.5 w-fit rounded-md bg-ink px-1.5 text-[11px] font-bold text-background">{String(index + 1).padStart(2, "0")}</span>
                  <b className="min-w-0 flex-1">{item.question}</b>
                  {best !== null ? <span className="rounded-full border-2 border-destructive px-2 text-xs font-bold text-destructive fh-hand">best {best}/10</span> : null}
                  {canEdit ? (
                    <Button type="button" size="sm" variant={practising === item.id ? "default" : "outline"} onClick={() => {
                        setPractising(item.id);
                        requestAnimationFrame(() => document.getElementById("practice")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                      }}>
                      <Mic aria-hidden="true" />
                      Practise
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{item.why}</p>
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs text-link [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show a suggested answer</span>
                    <span className="hidden group-open:inline">Hide the suggested answer</span>
                  </summary>
                  <p className="mt-1.5 rounded-lg border bg-background/60 px-3 py-2">{item.answer}</p>
                  {item.watch ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-attention">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      {item.watch}
                    </p>
                  ) : null}
                </details>
              </li>
            );
          })}
        </ol>
        {prep.dropped ? <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Code dropped {prep.dropped} {prep.dropped === 1 ? "item" : "items"} with no proposal claim behind {prep.dropped === 1 ? "it" : "them"}, an amount, or a private result.</p> : null}
      </Card>

      {question ? <Practice key={question.id} opp={opp} run={run} prep={prep} question={question} attempts={attempts.filter((attempt) => attempt.questionId === question.id)} onClose={() => setPractising(null)} /> : null}
    </div>
  );
}

function Practice({ opp, run, prep, question, attempts, onClose }: { opp: Opportunity; run: Run; prep: PitchPrep; question: PitchPrep["likely"][number]; attempts: PracticeAttempt[]; onClose: () => void }) {
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
    <Card title="Practise" marker={<AiMarker>Coach&apos;s mark</AiMarker>} action={<Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>} id="practice">
      <div className="grid items-start gap-5 px-5 py-4 text-sm lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="fh-bubble rounded-xl border-2 border-ink bg-card px-4 py-3">
            <span className="text-xs font-semibold text-muted-foreground">{opp.contact?.name ?? opp.prospect?.name ?? "The client"} asks</span>
            <p className="text-base leading-snug">&ldquo;{question.question}&rdquo;</p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Your answer, as you&apos;d say it</span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={6}
              maxLength={3000}
              placeholder="Type your answer…"
              className="rounded-lg border border-input bg-card px-3 py-2 leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <p className="-mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-full border border-dashed border-muted-foreground/60 px-1.5 text-[10px] font-semibold">Demo</span>
            No answer in mind? Try a sample:
            <button type="button" onClick={() => setAnswer(samples.strong)} className="text-link underline-offset-2 hover:underline">
              strong answer
            </button>
            ·
            <button type="button" onClick={() => setAnswer(samples.weak)} className="text-link underline-offset-2 hover:underline">
              weak answer
            </button>
            {inBox ? <span className="w-full">This is the {inBox} sample answer. Get feedback as it is, or edit it first.</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending || answer.trim().length < 15} onClick={submit}>
              <Sparkles aria-hidden="true" />
              {pending ? "Marking…" : "Get feedback"}
            </Button>
            <span className="text-xs text-muted-foreground">Each answer uses one of today&apos;s AI runs. Code checks every amount you say against your prices.</span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-3">
          {latest ? (
            <>
              <div className="relative flex flex-col gap-2 pr-20">
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
              </div>
              {attempts.length > 1 ? (
                <p className="text-xs text-muted-foreground">
                  Earlier tries: {attempts.slice(0, -1).map((attempt) => `${attempt.mark}/10${attempt.sample ? ` (${attempt.sample} sample)` : ""}`).join(", ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground">Answer the question, then get a mark out of 10, what landed, and what to add.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** A red-pen mark at the top right, like a marked paper. */
function TeacherMark({ mark, capped }: { mark: number; capped: boolean }) {
  return (
    <span title={capped ? "Capped at 6 by code: an amount you said isn't an approved price" : `Marked ${mark} out of 10`} className="pointer-events-none absolute -top-1 right-0 -rotate-6 select-none">
      <span aria-hidden="true" className="flex size-16 flex-col items-center justify-center rounded-[52%_46%_55%_48%] border-[2.5px] border-destructive text-destructive">
        <span className="fh-hand text-3xl leading-none">{mark}</span>
        <span className="fh-hand -mt-0.5 text-[11px] leading-none">/10</span>
      </span>
      <span className="sr-only">Marked {mark} out of 10{capped ? ", capped by code" : ""}</span>
    </span>
  );
}
