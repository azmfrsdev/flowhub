"use client";

import { AlertTriangle, ClipboardList, FileText, Hourglass, Mail, NotebookPen, Plus } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { GmailButton } from "@/components/flowhub/gmail-button";
import { LoadingChip } from "@/components/flowhub/loading";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { EXAMPLE_LABEL } from "@/lib/deal-room/meeting-examples";
import { waitingForNotes } from "@/lib/drive-notes";
import { useLiveCollection } from "@/lib/firebase/live";
import { type CalendarInvite, type DriveNotes, MEETING_EXAMPLES, type Meeting, type MeetingExample, type MeetingStep, NOTES_FOLDER, type Opportunity } from "@/lib/schema";
import { cn } from "cn";
import { type AfterResult, exampleMeetingNotes, planFromDriveNotes, planNextSteps, setMeetingStepDone } from "./after-actions";
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
const arrived = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
const longDate = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/**
 * Step F, After the meeting (PRD 7.25, ADR-0016 D4): pasted notes become
 * what they said and the next steps, checked against the hub. A quiet line
 * offers example notes built from this deal, for people without a meeting.
 *
 * Notes can also arrive from Google Drive (PRD 7.29, ADR-0021): after a
 * meeting FlowHub sent the invite for, the Gmail script finds its notes Doc
 * and sends it. The Planner starts on its own, unless a person already pasted
 * notes for that meeting; then the notes wait here with "Use these".
 */
export function MeetingView({ opp, canEdit }: { opp: Opportunity; canEdit: boolean }) {
  const meetings = [...useLiveCollection<Meeting>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/meetings`, "createdAt")].reverse();
  const driveNotes = useLiveCollection<DriveNotes>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/driveNotes`, "receivedAt");
  const invites = useLiveCollection<CalendarInvite>(`workspaces/${opp.workspaceId}/invites`, "createdAt").filter((invite) => invite.opportunityId === opp.id);
  const now = useMinute();
  const [writing, setWriting] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const shown = meetings.find((meeting) => meeting.id === chosenId) ?? meetings[0] ?? null;
  const open = driveNotes.filter((notes) => notes.status !== "planned").reverse();
  const waiting = now ? invites.filter((invite) => waitingForNotes(invite, now)).at(-1) : undefined;
  // While notes are on their way from Drive, the paste box waits behind "Paste notes" instead of opening on its own.
  const showForm = canEdit && (writing || (meetings.length === 0 && !waiting && open.length === 0));

  return (
    <div className="flex flex-col gap-5">
      {open.map((notes) => (
        <DriveNotesCard key={notes.id} opp={opp} notes={notes} canEdit={canEdit} />
      ))}
      {waiting && !showForm ? <WaitingForNotes opp={opp} invite={waiting} canPaste={canEdit && meetings.length === 0} onPaste={() => setWriting(true)} /> : null}
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
      {!showForm && meetings.length === 0 && !waiting && open.length === 0 ? (
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

/** The time to the minute, set after hydration so the server and browser render the same first frame. */
function useMinute(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** FR-NOTES-6: a quiet line while a meeting FlowHub sent the invite for waits for its notes in Drive. */
function WaitingForNotes({ opp, invite, canPaste, onPaste }: { opp: Opportunity; invite: CalendarInvite; canPaste: boolean; onPaste: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border-2 border-dashed border-ink/40 bg-card px-4 py-3 text-sm">
      <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <b>Waiting for notes in Drive</b>
        <p className="text-muted-foreground">
          After the meeting on {invite.label}, the Gmail script looks for its notes for three days: a Google Doc attached to the Calendar event, such as Gemini&apos;s &ldquo;Take notes for me&rdquo;, or a Doc in the Drive folder <b className="text-foreground">{NOTES_FOLDER}</b> with {opp.prospect?.name ? <>&ldquo;{opp.prospect.name}&rdquo; or </> : null}the meeting&apos;s title in its name. FlowHub then plans the next steps, and they wait here for you.
        </p>
      </div>
      {canPaste ? (
        <Button type="button" size="sm" variant="outline" onClick={onPaste}>
          <NotebookPen aria-hidden="true" />
          Paste notes
        </Button>
      ) : null}
    </div>
  );
}

/** FR-NOTES-4, FR-NOTES-5: notes from Drive being planned, or waiting for a person with "Use these". */
function DriveNotesCard({ opp, notes, canEdit }: { opp: Opportunity; notes: DriveNotes; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const planning = notes.status === "planning" || pending;
  const use = () =>
    startTransition(async () => {
      const result = await planFromDriveNotes(opp.id, notes.id);
      setError(result.error ?? null);
    });

  return (
    <Card title="Notes found in Drive" marker={planning ? <AiMarker waiting>Planning the next steps</AiMarker> : <CalcMarker>From the Gmail script</CalcMarker>}>
      <div className="flex flex-col gap-2 px-5 py-4 text-sm">
        <DriveSource source={notes} />
        <p className="text-xs text-muted-foreground">
          For the meeting on <b className="text-foreground">{longDate(notes.heldOn)}</b>, found {notes.foundIn === "calendar" ? "attached to the Calendar event" : `in the Drive folder ${NOTES_FOLDER}`}
          {notes.truncated ? ", cut at 20,000 characters" : ""}.
        </p>
        {planning ? (
          <LoadingChip label="Gemini reads the notes, then code checks every quote and step" />
        ) : notes.status === "waiting" ? (
          <p>You had already pasted notes for this meeting, so FlowHub didn&apos;t plan from these. Use these instead and the next steps are planned again; the plan from your pasted notes stays under Meeting.</p>
        ) : (
          <p className="text-destructive">{notes.error ?? "FlowHub couldn't plan from these notes."}</p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-link">Show the notes</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg border bg-background/60 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">{notes.text}</pre>
        </details>
        {canEdit && !planning ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={use}>
              <ClipboardList aria-hidden="true" />
              Use these
            </Button>
            <span className="text-xs text-muted-foreground">Uses one of today&apos;s AI runs.</span>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Card>
  );
}

/** "From Google Drive · <Doc title>", linked, and when it arrived. */
function DriveSource({ source }: { source: { docTitle: string; docUrl: string; receivedAt: string } }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <FileText aria-hidden="true" className="size-3.5" />
      From Google Drive ·{" "}
      <a href={source.docUrl} target="_blank" rel="noreferrer" className="font-semibold text-link underline-offset-2 hover:underline">
        {source.docTitle}
      </a>
      <span>· arrived {arrived(source.receivedAt)}</span>
    </p>
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
  const yours = meeting.source ? "the notes" : "your notes";
  const done = meeting.steps.filter((step) => step.done).length;
  const dropped = [
    meeting.dropped.points ? `${meeting.dropped.points} ${meeting.dropped.points === 1 ? "point" : "points"} whose words weren't in ${yours}` : null,
    meeting.dropped.steps ? `${meeting.dropped.steps} ${meeting.dropped.steps === 1 ? "step" : "steps"} with nothing in the notes behind ${meeting.dropped.steps === 1 ? "it" : "them"}` : null,
    meeting.dropped.sentences ? `${meeting.dropped.sentences} email ${meeting.dropped.sentences === 1 ? "sentence" : "sentences"} with an amount that isn't in ${yours} or prices` : null,
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
            {meeting.source ? null : <span>· notes from {meeting.createdBy}</span>}
          </p>
          {meeting.source ? <DriveSource source={meeting.source} /> : null}
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
        <Card title="What they said" marker={<CalcMarker>{`Every quote found in ${yours}`}</CalcMarker>}>
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
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">{meeting.source ? "The notes from Drive" : "Your notes"}</summary>
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
        {from.length ? <p className="text-xs text-muted-foreground">From {meeting.source ? "the notes" : "your notes"}: <q className="italic">{from[0].quote}</q></p> : null}
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
