"use client";

import { AlertTriangle, ClipboardList, Mail, NotebookPen, Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { GmailButton } from "@/components/flowhub/gmail-button";
import { LoadingChip } from "@/components/flowhub/loading";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { EXAMPLE_LABEL } from "@/lib/deal-room/meeting-examples";
import { useLiveCollection } from "@/lib/firebase/live";
import { MEETING_EXAMPLES, type Meeting, type MeetingExample, type MeetingStep, type Opportunity } from "@/lib/schema";
import { cn } from "cn";
import { type AfterResult, exampleMeetingNotes, planNextSteps, setMeetingStepDone } from "./after-actions";
import { Card } from "./gate-parts";

/** What each kind of next step is called, and its colour. */
export const STEP_KIND: Record<MeetingStep["kind"], { label: string; tone: string }> = {
  client: { label: "Client", tone: "bg-fit-strong-soft text-fit-strong" },
  supplier: { label: "Supplier", tone: "bg-claim-offering-soft text-claim-offering" },
  internal: { label: "Internal", tone: "bg-muted text-muted-foreground" },
  demo: { label: "Demo", tone: "bg-claim-research-soft text-claim-research" },
  tender: { label: "Tender", tone: "bg-ai-soft text-ai" },
  approval: { label: "Approval", tone: "bg-attention-soft text-attention" },
  proposal: { label: "Proposal", tone: "bg-calc-soft text-calc" },
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const longDate = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/**
 * Step F, After the meeting (PRD 7.25, ADR-0016 D4): pasted notes become
 * what they said and the next steps, checked against the hub. A quiet line
 * offers example notes built from this deal, for people without a meeting.
 */
export function MeetingView({ opp, canEdit }: { opp: Opportunity; canEdit: boolean }) {
  const meetings = [...useLiveCollection<Meeting>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/meetings`, "createdAt")].reverse();
  const [writing, setWriting] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const shown = meetings.find((meeting) => meeting.id === chosenId) ?? meetings[0] ?? null;
  const showForm = canEdit && (writing || meetings.length === 0);

  return (
    <div className="flex flex-col gap-5">
      {showForm ? (
        <NotesForm
          opp={opp}
          onDone={() => {
            setWriting(false);
            setChosenId(null);
          }}
          onCancel={meetings.length ? () => setWriting(false) : undefined}
        />
      ) : null}
      {!showForm && meetings.length === 0 ? (
        <Card title="After the meeting">
          <p className="px-5 py-4 text-sm text-muted-foreground">No meeting notes yet. An editor can paste them here after the meeting.</p>
        </Card>
      ) : null}
      {shown && !showForm ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {meetings.length > 1 ? (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Meeting</span>
                <select value={shown.id} onChange={(event) => setChosenId(event.target.value)} className="h-8 rounded-lg border border-input bg-card px-2 text-sm">
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {longDate(meeting.heldOn)}
                      {meeting.example ? " (example)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canEdit ? (
              <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setWriting(true)}>
                <Plus aria-hidden="true" />
                Notes from another meeting
              </Button>
            ) : null}
          </div>
          <MeetingPlan opp={opp} meeting={shown} canEdit={canEdit} />
        </>
      ) : null}
    </div>
  );
}

function NotesForm({ opp, onDone, onCancel }: { opp: Opportunity; onDone: () => void; onCancel?: () => void }) {
  const [notes, setNotes] = useState("");
  const [example, setExample] = useState<{ style: MeetingExample; text: string } | null>(null);
  const [examples, setExamples] = useState<Record<MeetingExample, string> | null>(null);
  const [loading, startLoading] = useTransition();
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<AfterResult, FormData>(async (previous, formData) => {
    const result = await planNextSteps(opp.id, previous, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  const pickExample = (style: MeetingExample) =>
    startLoading(async () => {
      let list = examples;
      if (!list) {
        const result = await exampleMeetingNotes(opp.id);
        if (result.error || !result.examples) {
          setExampleError(result.error ?? "The example notes didn't load. Try again.");
          return;
        }
        list = result.examples;
        setExamples(list);
      }
      setExampleError(null);
      setNotes(list[style]);
      setExample({ style, text: list[style] });
    });

  return (
    <Card title="After the meeting" marker={<AiMarker>Plans the next steps</AiMarker>}>
      <form action={action} className="flex flex-col gap-3 px-5 py-4 text-sm">
        <p className="text-muted-foreground">
          Paste your notes from the meeting with {opp.contact?.name ?? opp.prospect?.name ?? "the client"}, as rough as they are. FlowHub lists what they said, quoting your notes, and plans the next steps against what you sell: suppliers to ask, approvals to get, demos, tenders and emails.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Meeting date</span>
            <input type="date" name="heldOn" defaultValue={today()} max={today()} required className="h-9 rounded-lg border border-input bg-card px-2 text-sm" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold">Your notes</span>
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={10}
            maxLength={20000}
            required
            placeholder={"mtg w/ their IT lead + finance\n- liked the proposal, want a demo next week\n- asked about payment terms…"}
            className="min-h-48 rounded-lg border border-input bg-card px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <input type="hidden" name="example" value={example && example.text === notes ? example.style : ""} />
        <p className="text-xs text-muted-foreground">
          No notes to hand? Try an example:{" "}
          {MEETING_EXAMPLES.map((style, index) => (
            <span key={style}>
              {index ? " · " : ""}
              <button type="button" disabled={loading} onClick={() => pickExample(style)} className="text-link underline-offset-2 hover:underline disabled:opacity-60">
                {EXAMPLE_LABEL[style]}
              </button>
            </span>
          ))}
          {loading ? " …" : ""}
          {example && example.text === notes ? <span className="ml-1 rounded-full bg-muted px-2 py-px font-semibold">Example notes for {opp.prospect?.name ?? "this deal"}, built from the proposal</span> : null}
        </p>
        {exampleError ? <p className="text-xs text-destructive">{exampleError}</p> : null}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <PendingButton pendingLabel="Planning the next steps…">
            <ClipboardList aria-hidden="true" />
            Plan the next steps
          </PendingButton>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">{pending ? "About half a minute. Gemini reads the notes, then code checks every quote and step." : "Uses one of today's AI runs."}</span>
        </div>
        {pending ? <LoadingChip label="Reading your notes" /> : null}
      </form>
    </Card>
  );
}

function MeetingPlan({ opp, meeting, canEdit }: { opp: Opportunity; meeting: Meeting; canEdit: boolean }) {
  const points = new Map(meeting.points.map((point) => [point.id, point]));
  const done = meeting.steps.filter((step) => step.done).length;
  const dropped = [
    meeting.dropped.points ? `${meeting.dropped.points} ${meeting.dropped.points === 1 ? "point" : "points"} whose words weren't in your notes` : null,
    meeting.dropped.steps ? `${meeting.dropped.steps} ${meeting.dropped.steps === 1 ? "step" : "steps"} with nothing in the notes behind ${meeting.dropped.steps === 1 ? "it" : "them"}` : null,
    meeting.dropped.sentences ? `${meeting.dropped.sentences} email ${meeting.dropped.sentences === 1 ? "sentence" : "sentences"} with an amount that isn't in your notes or prices` : null,
  ].filter(Boolean);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card
        title="Next steps"
        marker={
          <>
            <AiMarker>AI planned</AiMarker>
            <CalcMarker>Checked against your hub</CalcMarker>
          </>
        }
        action={<span className="text-xs text-muted-foreground">{done} of {meeting.steps.length} done</span>}
      >
        <div className="flex flex-col gap-1 border-b px-5 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <NotebookPen aria-hidden="true" className="size-3.5" />
            Meeting on <b className="text-foreground">{longDate(meeting.heldOn)}</b>
            {meeting.example ? <span className="rounded-full bg-muted px-2 py-px font-semibold">Example notes</span> : null}
            <span>· notes from {meeting.createdBy}</span>
          </p>
          <p>{meeting.summary}</p>
        </div>
        {meeting.steps.length ? (
          <ol className="flex flex-col divide-y">
            {meeting.steps.map((step) => (
              <StepRow key={step.id} opp={opp} meeting={meeting} step={step} points={points} canEdit={canEdit} />
            ))}
          </ol>
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">No next steps came out of these notes.</p>
        )}
        {dropped.length ? <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Code dropped {dropped.join(", ")}.</p> : null}
      </Card>

      <div className="flex flex-col gap-5">
        <Card title="What they said" marker={<CalcMarker>Every quote found in your notes</CalcMarker>}>
          <ul className="flex flex-col divide-y">
            {meeting.points.map((point) => (
              <li key={point.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 rounded-full border px-1.5 text-[11px] font-semibold text-muted-foreground capitalize">{point.kind}</span>
                  <span className="min-w-0 flex-1">{point.text}</span>
                </span>
                <q className="pl-1 text-xs text-muted-foreground italic">{point.quote}</q>
              </li>
            ))}
          </ul>
        </Card>
        <details className="rounded-xl border-2 border-ink bg-card shadow-comic">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">Your notes</summary>
          <pre className="max-h-96 overflow-auto border-t px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{meeting.notes}</pre>
        </details>
      </div>
    </div>
  );
}

function StepRow({ opp, meeting, step, points, canEdit }: { opp: Opportunity; meeting: Meeting; step: MeetingStep; points: Map<string, Meeting["points"][number]>; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const kind = STEP_KIND[step.kind];
  const from = step.pointIds.map((id) => points.get(id)).filter((point): point is Meeting["points"][number] => Boolean(point));
  const toggle = (value: boolean) =>
    startTransition(async () => {
      const result = await setMeetingStepDone(opp.id, meeting.id, step.id, value);
      setError(result.error ?? null);
    });

  return (
    <li className={cn("flex gap-3 px-5 py-3 text-sm", step.done && "bg-muted/30")}>
      <input
        type="checkbox"
        aria-label={`Done: ${step.title}`}
        checked={Boolean(step.done)}
        disabled={!canEdit || pending}
        onChange={(event) => toggle(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-ink"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-px text-[11px] font-bold", kind.tone)}>{kind.label}</span>
          <b className={cn(step.done && "text-muted-foreground line-through")}>{step.title}</b>
        </div>
        <p className="text-muted-foreground">{step.detail}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {step.due ? (
            <span>
              Due <b className="text-foreground">{step.due}</b>
            </span>
          ) : null}
          {step.owner ? (
            <span>
              Owner <b className="text-foreground">{step.owner}</b>
            </span>
          ) : null}
          {step.refs.map((ref) => (
            <span key={`${ref.kind}-${ref.id}`} className="rounded-full border px-2 py-px" title={ref.kind === "rule" ? "Selling rule" : ref.kind === "scope" ? "Not included" : ref.kind === "partner" ? "Partner in your hub" : "Offering in your hub"}>
              {ref.kind === "rule" ? "Rule: " : ref.kind === "scope" ? "Not included: " : ""}
              {ref.name}
            </span>
          ))}
        </div>
        {step.noPartner ? (
          <p className="flex items-center gap-1.5 text-xs text-attention">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            No partner in your hub covers this. Find a supplier, or add one under Partners.
          </p>
        ) : null}
        {from.length ? <p className="text-xs text-muted-foreground">From your notes: <q className="italic">{from[0].quote}</q></p> : null}
        {step.email ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-xs [&::-webkit-details-marker]:hidden">
              <Mail aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="text-link group-open:hidden">Show the email{step.email.toName ? ` to ${step.email.toName}` : ""}</span>
              <span className="hidden text-link group-open:inline">Hide the email</span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-lg border bg-background/60 px-3 py-2.5 text-xs">
              <p>
                <span className="text-muted-foreground">To:</span> {step.email.toName ?? "—"}
                {step.email.to ? ` <${step.email.to}>` : ""} · <span className="text-muted-foreground">Subject:</span> <b>{step.email.subject}</b>
              </p>
              <p className="leading-relaxed whitespace-pre-wrap">{step.email.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                <GmailButton draft={{ to: step.email.to, subject: step.email.subject, body: step.email.body }} label="Email in Gmail" />
                <span className="text-muted-foreground">Gmail opens a filled-in draft. You check it and press Send.</span>
              </div>
            </div>
          </details>
        ) : null}
        {step.done ? <PersonMarker name={step.done.by} className="self-start">{`Done, ticked by ${step.done.by}`}</PersonMarker> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </li>
  );
}
