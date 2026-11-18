"use client";

import { AlertTriangle, ArrowRight, Calculator, ClipboardList, Hourglass, Loader2, NotebookPen, Settings2, History, Users } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { GmailButton, openTab, signedInEmail } from "@/components/flowhub/gmail-button";
import { GoogleLogo } from "@/components/flowhub/google-logo";
import { LoadingChip } from "@/components/flowhub/loading";
import { PersonMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { EXAMPLE_LABEL } from "@/lib/deal-room/meeting-examples";
import { waitingForNotes } from "@/lib/drive-notes";
import { useLiveCollection } from "@/lib/firebase/live";
import { gmailComposeUrl } from "@/lib/gmail";
import { type CalendarInvite, type DriveNotes, MEETING_EXAMPLES, type Meeting, type MeetingExample, type MeetingStep, NOTES_FOLDER, NOTES_WINDOW_MS, type Opportunity } from "@/lib/schema";
import { cn } from "cn";
import { type AfterResult, exampleMeetingNotes, planFromDriveNotes, planNextSteps, setMeetingStepDone } from "./after-actions";
import { GateSlot } from "./gate-parts";
import { DockButton, KICKER, type LineState, Line, More, PILL, Waiting } from "./prep-view";
import { Box, BoxTag, SideDrawer } from "./stage-box";

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

type Drawer = "paste" | "notes" | "steps" | "said" | "meetings" | "made";
const DRAWER_TITLE: Record<Drawer, string> = {
  paste: "Paste notes",
  notes: "The notes",
  steps: "Next steps",
  said: "What they said",
  meetings: "Meetings",
  made: "How this was made",
};

/** How many lines each fixed-size box shows; the rest are in its drawer. */
const STEP_ROWS = 7;
const SAID_ROWS = 6;
const EMAIL_ROWS = 4;
const ROW1 = "h-[19rem]";
const ROW2 = "h-[14rem]";
const main = "h-10 px-4 text-[15px] font-bold shadow-comic";
const INFO = "flex h-8 items-center gap-2 border-b border-dashed border-line-soft text-[13.5px] whitespace-nowrap [&>svg]:size-4 [&>svg]:shrink-0";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const arrived = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
const longDate = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const shortDay = (ms: number) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(ms));
const emailTo = (step: MeetingStep) => step.email?.toName ?? (step.kind === "supplier" ? "the supplier" : "the client");

/**
 * Step F, Follow-up (PRD 7.25, FR-MEET-6): five boxes of a fixed size, one line per item.
 * Top: the next steps, checked against the hub, and what they said, each quoting the notes.
 * Below: the meeting (the invite from step E), the notes and the emails for Gmail. Pasting
 * notes, the full notes and the history are in a side drawer; the header carries the one
 * action that moves the step on.
 *
 * Notes can also arrive from Google Drive (PRD 7.29, ADR-0021): after a meeting FlowHub sent
 * the invite for, the Gmail script finds its notes Doc and sends it. The Planner starts on its
 * own, unless a person already pasted notes for that meeting; then the notes wait with "Use these".
 */
export function MeetingView({ opp, canEdit, onQuote }: { opp: Opportunity; canEdit: boolean; onQuote?: () => void }) {
  const meetings = [...useLiveCollection<Meeting>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/meetings`, "createdAt")].reverse();
  const driveNotes = useLiveCollection<DriveNotes>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/driveNotes`, "receivedAt");
  const invites = useLiveCollection<CalendarInvite>(`workspaces/${opp.workspaceId}/invites`, "createdAt").filter((invite) => invite.opportunityId === opp.id);
  const now = useMinute();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const shown = meetings.find((meeting) => meeting.id === chosenId) ?? meetings[0] ?? null;
  const open = driveNotes.filter((notes) => notes.status !== "planned").reverse();
  const planningDrive = open.find((notes) => notes.status === "planning") ?? null;
  const waitingDrive = open.find((notes) => notes.status !== "planning") ?? null;
  const waiting = now ? invites.filter((invite) => waitingForNotes(invite, now)).at(-1) : undefined;
  const invite = invites.filter((item) => item.status !== "failed").at(-1) ?? null;

  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const openDrawer = (kind: Drawer) => {
    setOpenId(null);
    setDrawer(kind);
    if (!dialog.current?.open) dialog.current?.showModal();
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

  // The pasted notes live here, so closing the drawer keeps what was typed.
  const [notes, setNotes] = useState("");
  const [example, setExample] = useState<{ style: MeetingExample; text: string } | null>(null);
  const [examples, setExamples] = useState<Record<MeetingExample, string> | null>(null);
  const [loadingExample, startLoading] = useTransition();
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [state, plan, planning] = useActionState<AfterResult, FormData>(async (previous, formData) => {
    const result = await planNextSteps(opp.id, previous, formData);
    if (result.ok) {
      dialog.current?.close();
      setChosenId(null);
      setNotes("");
      setExample(null);
    }
    return result;
  }, {});

  const pickExample = (style: MeetingExample) => {
    if (!dialog.current?.open || drawer !== "paste") openDrawer("paste");
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
  };

  const [using, startUsing] = useTransition();
  const [useError, setUseError] = useState<string | null>(null);
  const planFromDrive = (notesId: string) =>
    startUsing(async () => {
      const result = await planFromDriveNotes(opp.id, notesId);
      setUseError(result.error ?? null);
    });

  const busy = planning || using || Boolean(planningDrive);
  const nextEmail = shown?.steps.find((step) => step.email && !step.done) ?? null;
  const line = { openId, setOpenId };
  const toggle = (meeting: Meeting, step: MeetingStep, value: boolean) => setMeetingStepDone(opp.id, meeting.id, step.id, value);

  return (
    <>
      {/* FR-MEET-6: the header's one action moves on: Paste notes, planning, Use these, the next email, then Quote. */}
      <GateSlot>
        <div className="order-last flex flex-wrap items-center justify-end gap-2">
          {useError ? <span className="text-sm text-destructive">{useError}</span> : null}
          {busy ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ai-soft px-3 text-sm font-bold whitespace-nowrap text-ai">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              Planning the next steps · about half a minute
            </span>
          ) : waitingDrive && canEdit ? (
            <>
              <span className="hidden text-xs text-muted-foreground xl:inline">{waitingDrive.status === "failed" ? "Planning from Drive didn't run" : "Notes found in Drive"}</span>
              <Button type="button" onClick={() => planFromDrive(waitingDrive.id)} className={main} title="Plans the next steps from the notes in Drive. Uses one of today's AI runs.">
                <ClipboardList aria-hidden="true" />
                Use these
              </Button>
            </>
          ) : !shown ? (
            canEdit ? (
              <>
                {waiting && now ? (
                  <span className="hidden items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-muted-foreground/60 px-2.5 text-xs leading-6 font-bold whitespace-nowrap text-muted-foreground lg:inline-flex">
                    <Hourglass aria-hidden="true" className="size-3.5" />
                    Waiting for notes in Drive · until {shortDay(Date.parse(waiting.end) + NOTES_WINDOW_MS)}
                  </span>
                ) : null}
                <Button type="button" onClick={() => openDrawer("paste")} className={main}>
                  <NotebookPen aria-hidden="true" />
                  Paste notes
                </Button>
              </>
            ) : null
          ) : nextEmail?.email && canEdit ? (
            <>
              <span className="hidden text-xs whitespace-nowrap text-muted-foreground xl:inline">
                {shown.steps.filter((step) => step.done).length} of {shown.steps.length} done
              </span>
              <Button type="button" onClick={() => openTab(gmailComposeUrl({ to: nextEmail.email!.to, subject: nextEmail.email!.subject, body: nextEmail.email!.body }, signedInEmail()))} className={main} title="Opens a filled-in draft in Gmail. You check it and press Send there.">
                <GoogleLogo product="gmail" />
                <span className="max-w-56 truncate">Email {emailTo(nextEmail)}</span>
              </Button>
            </>
          ) : onQuote ? (
            <Button type="button" onClick={onQuote} className={main}>
              Quote
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </GateSlot>

      <div className="flex flex-col gap-7 pt-2" onKeyDown={(event) => event.code === "Escape" && setOpenId(null)}>
        <div className="grid gap-x-5 gap-y-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Box
            title="Next steps"
            marker={
              <>
                <BoxTag kind="ai" title="The Planner reads the notes and plans the next steps.">Planner</BoxTag>
                <BoxTag kind="calc" title="Code checks every offering, partner and selling rule a step names against your confirmed hub.">Checked against your hub</BoxTag>
              </>
            }
            onMore={shown ? () => openDrawer("steps") : undefined}
            className={ROW1}
          >
            {shown ? (
              <StepLines meeting={shown} canEdit={canEdit} onToggle={toggle} onMore={() => openDrawer("steps")} {...line} />
            ) : (
              <Waiting text="Client, supplier, demo, approval, tender and proposal steps, each checked against your hub" pending={busy} pendingLabel="Gemini reads the notes, then code checks every step" />
            )}
          </Box>
          <Box
            title="What they said"
            marker={
              <>
                <BoxTag kind="ai">Planner</BoxTag>
                <BoxTag kind="calc" title="Code keeps a point only if its quote is in the notes word for word.">Every quote found in the notes</BoxTag>
              </>
            }
            onMore={shown ? () => openDrawer("said") : undefined}
            className={ROW1}
          >
            {shown ? <SaidLines meeting={shown} onMore={() => openDrawer("said")} {...line} /> : <Waiting text="Asks, concerns, decisions and dates, each quoting the notes word for word" />}
          </Box>
        </div>

        <div className="grid gap-x-5 gap-y-7 lg:grid-cols-3">
          <Box title="Meeting" marker={<BoxTag kind="calc" title="From the invite FlowHub sent in Pitch prep.">{invite ? "From the invite" : "From the notes"}</BoxTag>} className={ROW2}>
            <MeetingLines opp={opp} invite={invite} meeting={shown} waiting={Boolean(waiting) && !shown} until={waiting ? Date.parse(waiting.end) + NOTES_WINDOW_MS : null} />
          </Box>
          <Box
            title="Notes"
            marker={shown || planningDrive || waitingDrive ? <BoxTag kind="calc">{notesTag(shown, planningDrive ?? waitingDrive)}</BoxTag> : undefined}
            onMore={shown || planningDrive || waitingDrive ? () => openDrawer("notes") : undefined}
            className={ROW2}
          >
            <NotesLines opp={opp} meeting={shown} drive={planningDrive ?? waitingDrive} canEdit={canEdit} onPaste={() => openDrawer("paste")} onExample={pickExample} />
          </Box>
          <Box
            title="Emails"
            marker={
              <>
                <BoxTag kind="ai">Planner</BoxTag>
                <BoxTag kind="calc" title="An amount stays only if it is in the notes or your approved prices. No costs.">Amounts checked by code</BoxTag>
              </>
            }
            className={ROW2}
          >
            {shown ? <EmailLines meeting={shown} onMore={() => openDrawer("steps")} {...line} /> : <Waiting text="A short email for each client and supplier step, opened in Gmail" />}
          </Box>
        </div>
      </div>

      {shown ? (
        <div className="flex flex-wrap items-center gap-3">
          <DockButton onClick={() => openDrawer("made")} icon={<Settings2 />} label="How this was made" />
          {canEdit ? <DockButton onClick={() => openDrawer("paste")} icon={<NotebookPen />} label="Notes from another meeting" /> : null}
          {meetings.length > 1 ? <DockButton onClick={() => openDrawer("meetings")} icon={<History />} label={`Meetings (${meetings.length})`} /> : null}
        </div>
      ) : null}

      <SideDrawer ref={dialog} title={drawer ? DRAWER_TITLE[drawer] : null} onClose={() => setDrawer(null)}>
        {drawer === "paste" ? (
          <NotesForm
            opp={opp}
            canEdit={canEdit}
            notes={notes}
            setNotes={setNotes}
            example={example}
            onExample={pickExample}
            loadingExample={loadingExample}
            exampleError={exampleError}
            action={plan}
            pending={planning}
            error={state.error ?? null}
          />
        ) : drawer === "notes" ? (
          <NotesDrawer meeting={shown} drive={planningDrive ?? waitingDrive} canEdit={canEdit} using={using} onUse={planFromDrive} />
        ) : drawer === "meetings" ? (
          <MeetingsDrawer meetings={meetings} shownId={shown?.id ?? null} onShow={(id) => {
            setChosenId(id);
            dialog.current?.close();
          }} />
        ) : !shown ? null : drawer === "steps" ? (
          <StepsDrawer meeting={shown} canEdit={canEdit} onToggle={toggle} />
        ) : drawer === "said" ? (
          <SaidDrawer meeting={shown} />
        ) : drawer === "made" ? (
          <MadeDrawer meeting={shown} />
        ) : null}
      </SideDrawer>
    </>
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

function notesTag(meeting: Meeting | null, drive: DriveNotes | null): string {
  if (drive && !meeting) return "From the Gmail script";
  if (!meeting) return "";
  if (meeting.source) return "From the Gmail script";
  if (meeting.example) return "Example notes";
  return `Pasted by ${meeting.createdBy}`;
}

/** A step's kind as a pill that never wraps. */
function KindPill({ kind }: { kind: MeetingStep["kind"] }) {
  return <span className={cn(PILL, "justify-self-start", STEP_KIND[kind].tone)}>{STEP_KIND[kind].label}</span>;
}

/** FR-MEET-3, FR-MEET-6: each step on one line, ticked off on the line; the popup has the rest. */
function StepLines({ meeting, canEdit, onToggle, onMore, ...line }: { meeting: Meeting; canEdit: boolean; onToggle: (meeting: Meeting, step: MeetingStep, value: boolean) => Promise<AfterResult>; onMore: () => void } & LineState) {
  const done = meeting.steps.filter((step) => step.done).length;
  if (!meeting.steps.length) return <p className="px-4 pt-2 text-sm text-muted-foreground">No next steps came out of these notes.</p>;
  const shown = meeting.steps.length > STEP_ROWS ? STEP_ROWS - 1 : STEP_ROWS;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2.5 pt-1.5">
      <ul className="flex flex-col">
        {meeting.steps.slice(0, shown).map((step, index) => (
          <Line
            key={step.id}
            id={step.id}
            label={step.title}
            up={index >= 3}
            before={<StepTick meeting={meeting} step={step} canEdit={canEdit} onToggle={onToggle} />}
            className="min-w-0 flex-1 grid-cols-[4.75rem_minmax(0,1fr)_auto_1rem_0.875rem]"
            {...line}
            detail={<StepDetail meeting={meeting} step={step} />}
          >
            <KindPill kind={step.kind} />
            <span className={cn("truncate", step.done && "text-muted-foreground line-through")}>{step.title}</span>
            <span className="text-[11.5px] whitespace-nowrap text-muted-foreground">{step.due ?? ""}</span>
            {step.email ? <GoogleLogo product="gmail" className="size-3.5" label="Has an email" /> : <span />}
          </Line>
        ))}
        {meeting.steps.length > shown ? <More count={meeting.steps.length - shown} onMore={onMore} /> : null}
      </ul>
      <p className="mt-auto truncate px-2 pb-2.5 text-[11.5px] text-muted-foreground">
        {done} of {meeting.steps.length} done
        {meeting.dropped.steps ? ` · Code dropped ${meeting.dropped.steps} ${meeting.dropped.steps === 1 ? "step" : "steps"} with nothing in the notes behind ${meeting.dropped.steps === 1 ? "it" : "them"}` : ""}
      </p>
    </div>
  );
}

/** FR-MEET-4: ticking a step off is a server action, recorded in the audit trail. */
function StepTick({ meeting, step, canEdit, onToggle }: { meeting: Meeting; step: MeetingStep; canEdit: boolean; onToggle: (meeting: Meeting, step: MeetingStep, value: boolean) => Promise<AfterResult> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <input
      type="checkbox"
      aria-label={`Done: ${step.title}`}
      title={error ?? (step.done ? `Done, ticked by ${step.done.by}` : "Tick when it's done")}
      checked={Boolean(step.done)}
      disabled={!canEdit || pending}
      onChange={(event) => {
        const value = event.target.checked;
        startTransition(async () => {
          const result = await onToggle(meeting, step, value);
          setError(result.error ?? null);
        });
      }}
      className={cn("ml-1.5 size-4 shrink-0 accent-ink", error && "outline-2 outline-destructive")}
    />
  );
}

/** The full step: detail, owner, due date, hub references, the quote behind it and its email. */
function StepDetail({ meeting, step, inDrawer = false }: { meeting: Meeting; step: MeetingStep; inDrawer?: boolean }) {
  const quote = step.pointIds.map((id) => meeting.points.find((point) => point.id === id)).find(Boolean)?.quote;
  const meta = [step.owner ? `Owner ${step.owner}` : null, step.due ? `Due ${step.due}` : null].filter(Boolean).join(" · ");
  return (
    <>
      {inDrawer ? null : <span className={KICKER}>{STEP_KIND[step.kind].label} step</span>}
      <p>{step.detail}</p>
      {meta || step.refs.length ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {meta ? <span>{meta}</span> : null}
          {step.refs.map((ref) => (
            <span key={`${ref.kind}-${ref.id}`} className="rounded-full border px-2 leading-5 whitespace-nowrap" title={ref.kind === "rule" ? "Selling rule" : ref.kind === "scope" ? "Not included" : ref.kind === "partner" ? "Partner in your hub" : "Offering in your hub"}>
              {ref.kind === "rule" ? "Rule: " : ref.kind === "scope" ? "Not included: " : ref.kind === "partner" ? "Partner: " : "Offering: "}
              {ref.name}
            </span>
          ))}
        </span>
      ) : null}
      {step.noPartner ? (
        <span className="flex items-center gap-1.5 rounded-md bg-attention-soft/50 px-2 py-1 text-xs text-attention">
          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          No partner in your hub covers this. Find a supplier, or add one under Partners.
        </span>
      ) : null}
      {quote ? (
        <span className="text-xs text-muted-foreground">
          From the notes: <q className="italic">{quote}</q>
        </span>
      ) : null}
      {step.email ? <EmailDetail step={step} /> : null}
      {step.done ? <PersonMarker name={step.done.by} className="self-start">{`Done, ticked by ${step.done.by}`}</PersonMarker> : null}
    </>
  );
}

/** FR-MEET-4: the email, opened as a filled-in Gmail draft the person sends. */
function EmailDetail({ step }: { step: MeetingStep }) {
  if (!step.email) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-background/60 px-3 py-2 text-xs">
      <p>
        <span className="text-muted-foreground">To:</span> {step.email.toName ?? "—"}
        {step.email.to ? ` <${step.email.to}>` : ""}
      </p>
      <p>
        <span className="text-muted-foreground">Subject:</span> <b>{step.email.subject}</b>
      </p>
      <p className="max-h-32 overflow-y-auto leading-relaxed whitespace-pre-wrap">{step.email.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <GmailButton draft={{ to: step.email.to, subject: step.email.subject, body: step.email.body }} label="Open in Gmail" />
        <span className="text-muted-foreground">You check it and press Send in Gmail.</span>
      </div>
    </div>
  );
}

/** FR-MEET-2: the summary first, then each point with its kind; the popup quotes the notes. */
function SaidLines({ meeting, onMore, ...line }: { meeting: Meeting; onMore: () => void } & LineState) {
  const shown = meeting.points.length > SAID_ROWS ? SAID_ROWS - 1 : SAID_ROWS;
  return (
    <div className="flex flex-col px-2.5 pt-1.5">
      <ul className="flex flex-col">
        {meeting.summary ? (
          <Line id="summary" label="In short" className="mb-1 h-9 grid-cols-[minmax(0,1fr)_0.875rem] rounded-xl border-2 border-b-2 border-solid border-ink bg-primary/15 hover:bg-primary/25" {...line} detail={<><span className={KICKER}>In short</span><p>{meeting.summary}</p><span className="text-xs text-muted-foreground">The Planner&apos;s summary of the notes</span></>}>
            <span className="truncate">{meeting.summary}</span>
          </Line>
        ) : null}
        {meeting.points.slice(0, shown).map((point, index) => (
          <Line key={point.id} id={point.id} label={point.text} up={index >= 3} className="grid-cols-[5.5rem_minmax(0,1fr)_0.875rem]" {...line} detail={<><span className={KICKER}>{point.kind}</span><p>{point.text}</p><span className="text-xs text-muted-foreground">From the notes: <q className="italic">{point.quote}</q></span></>}>
            <span className={cn(PILL, "justify-self-start border-[1.5px] border-line-soft bg-card text-muted-foreground capitalize")}>{point.kind}</span>
            <span className="truncate">{point.text}</span>
          </Line>
        ))}
        {meeting.points.length > shown ? <More count={meeting.points.length - shown} onMore={onMore} /> : null}
        {meeting.points.length === 0 ? <li className="px-2 pt-1 text-sm text-muted-foreground">No points survived code&apos;s checks.</li> : null}
      </ul>
    </div>
  );
}

/** FR-MEET-6: the invite FlowHub sent from step E, and whether notes are on their way from Drive. */
function MeetingLines({ opp, invite, meeting, waiting, until }: { opp: Opportunity; invite: CalendarInvite | null; meeting: Meeting | null; waiting: boolean; until: number | null }) {
  const contact = opp.contact;
  const who = invite ? (invite.guests.length === 1 && contact?.email && invite.guests[0].toLowerCase() === contact.email.toLowerCase() ? `${contact.name}, the deal's contact` : invite.guests.join(", ")) : null;
  const pill = "inline-flex items-center gap-1 rounded-full px-2 text-[11.5px] leading-5 font-bold whitespace-nowrap [&_svg]:size-3";
  return (
    <div className="flex flex-col px-4 pt-1.5">
      <div className={INFO}>
        <GoogleLogo product="calendar" />
        <b className="truncate">{invite ? invite.label : meeting ? longDate(meeting.heldOn) : (opp.nextMeeting ?? "No meeting booked from FlowHub")}</b>
        {invite ? <span className="text-[11.5px] text-muted-foreground">Malaysia time</span> : null}
      </div>
      {invite ? (
        <>
          <div className={INFO}>
            <GoogleLogo product="meet" />
            {invite.meetUrl ? (
              <a href={invite.meetUrl} target="_blank" rel="noopener noreferrer" className="truncate text-link hover:underline">
                {invite.meetUrl.replace(/^https:\/\//, "")}
              </a>
            ) : (
              <span className="truncate text-muted-foreground">Google Meet, added by Calendar</span>
            )}
          </div>
          <div className={cn(INFO, "border-b-0")}>
            <Users aria-hidden="true" className="text-muted-foreground" />
            <span className="truncate">
              {who}
              {invite.organiser ? ` · from ${invite.organiser}` : ""}
            </span>
          </div>
        </>
      ) : (
        <p className="pt-2 text-xs leading-relaxed text-muted-foreground">Book the meeting in Pitch prep with Send invite, and its notes can come back from Google Drive on their own.</p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {waiting && until ? (
          <span className={cn(pill, "border-[1.5px] border-dashed border-muted-foreground/60 text-muted-foreground")}>
            <Hourglass aria-hidden="true" />
            Notes awaited in Drive until {shortDay(until)}
          </span>
        ) : meeting ? (
          <span className={cn(pill, "bg-fit-strong-soft text-fit-strong")}>Notes in · {longDate(meeting.heldOn)}</span>
        ) : invite?.status === "sent" ? (
          <span className={cn(pill, "bg-muted text-muted-foreground")}>Invite sent</span>
        ) : null}
      </div>
    </div>
  );
}

/** FR-MEET-1, FR-NOTES-4, FR-NOTES-5: three ways in before any notes, then the notes' source and first lines. */
function NotesLines({ opp, meeting, drive, canEdit, onPaste, onExample }: { opp: Opportunity; meeting: Meeting | null; drive: DriveNotes | null; canEdit: boolean; onPaste: () => void; onExample: (style: MeetingExample) => void }) {
  const way = "grid grid-cols-[1.125rem_minmax(0,1fr)] items-start gap-2 border-b border-dashed border-line-soft py-1.5 text-[13px] leading-snug [&_svg]:mt-0.5 [&_svg]:size-4";
  if (!meeting && !drive) {
    return (
      <div className="flex flex-col px-4 pt-1">
        <div className={way}>
          <GoogleLogo product="drive" />
          <span>
            <b>From Google Drive, on their own</b>
            <small className="block text-[11.5px] text-muted-foreground">A notes Doc on the Calendar event, or in the folder &ldquo;{NOTES_FOLDER}&rdquo;{opp.prospect?.name ? ` named for ${opp.prospect.name}` : ""}</small>
          </span>
        </div>
        {canEdit ? (
          <>
            <div className={way}>
              <NotebookPen aria-hidden="true" className="text-muted-foreground" />
              <span>
                <button type="button" onClick={onPaste} className="font-bold text-link underline-offset-2 hover:underline">
                  Paste them
                </button>
                <small className="block text-[11.5px] text-muted-foreground">Rough is fine, up to 20,000 characters</small>
              </span>
            </div>
            <div className={cn(way, "border-b-0")}>
              <ClipboardList aria-hidden="true" className="text-muted-foreground" />
              <span>
                No meeting? Try an example:{" "}
                {MEETING_EXAMPLES.map((style, index) => (
                  <span key={style}>
                    {index ? " · " : ""}
                    <button type="button" onClick={() => onExample(style)} className="text-link underline-offset-2 hover:underline">
                      {EXAMPLE_LABEL[style].toLowerCase()}
                    </button>
                  </span>
                ))}
              </span>
            </div>
          </>
        ) : (
          <p className="pt-2 text-sm text-muted-foreground">No meeting notes yet. An editor can paste them here after the meeting.</p>
        )}
      </div>
    );
  }
  // Drive notes waiting behind pasted ones (FR-NOTES-5) show on top of the plan's own notes.
  const waitingBehind = drive && meeting && drive.status !== "planning";
  return (
    <div className="flex min-h-0 flex-col px-3.5 pt-1.5">
      {waitingBehind ? (
        <div className="mb-1 flex items-center gap-2 rounded-lg border-2 border-ink bg-primary/15 px-2 py-1 text-xs leading-snug">
          <GoogleLogo product="drive" className="size-3.5 shrink-0" />
          <span className="min-w-0">
            <b>Notes found in Drive</b> {drive.status === "failed" ? `couldn't be planned: ${drive.error ?? "try again"}.` : "after you pasted yours."} Use these from the header.
          </span>
        </div>
      ) : null}
      {meeting && !waitingBehind ? <Source meeting={meeting} /> : drive && !meeting ? <DriveSource drive={drive} /> : meeting ? <Source meeting={meeting} /> : null}
      <pre className="mt-1.5 max-h-24 overflow-hidden rounded-lg bg-muted/50 px-2.5 py-1.5 font-mono text-[11.5px] leading-normal whitespace-pre-wrap text-muted-foreground [mask-image:linear-gradient(#000_55%,transparent)]">{(meeting && !waitingBehind ? meeting.notes : (drive?.text ?? meeting?.notes ?? "")).slice(0, 600)}</pre>
    </div>
  );
}

function Source({ meeting }: { meeting: Meeting }) {
  if (meeting.source) {
    return (
      <p className="flex h-6 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        <GoogleLogo product="drive" className="size-3.5 shrink-0" />
        <a href={meeting.source.docUrl} target="_blank" rel="noreferrer" className="truncate font-semibold text-link underline-offset-2 hover:underline">
          {meeting.source.docTitle}
        </a>
        <span>· arrived {arrived(meeting.source.receivedAt)}</span>
      </p>
    );
  }
  return (
    <p className="flex h-6 items-center gap-1.5 truncate text-xs whitespace-nowrap text-muted-foreground">
      <NotebookPen aria-hidden="true" className="size-3.5 shrink-0" />
      {meeting.example ? `Example notes for ${longDate(meeting.heldOn)}, built from the proposal` : `Pasted by ${meeting.createdBy} · ${longDate(meeting.heldOn)}`}
    </p>
  );
}

function DriveSource({ drive }: { drive: DriveNotes }) {
  return (
    <p className="flex h-6 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
      <GoogleLogo product="drive" className="size-3.5 shrink-0" />
      <a href={drive.docUrl} target="_blank" rel="noreferrer" className="truncate font-semibold text-link underline-offset-2 hover:underline">
        {drive.docTitle}
      </a>
      <span>· arrived {arrived(drive.receivedAt)}</span>
    </p>
  );
}

/** FR-MEET-4: one line per client or supplier email; the popup has the email and Open in Gmail. */
function EmailLines({ meeting, onMore, ...line }: { meeting: Meeting; onMore: () => void } & LineState) {
  const steps = meeting.steps.filter((step) => step.email);
  if (!steps.length) return <p className="px-4 pt-2 text-sm text-muted-foreground">No client or supplier step needed an email.</p>;
  const shown = steps.length > EMAIL_ROWS ? EMAIL_ROWS - 1 : EMAIL_ROWS;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2.5 pt-1.5">
      <ul className="flex flex-col">
        {steps.slice(0, shown).map((step, index) => (
          <Line key={step.id} id={`email-${step.id}`} label={`Email to ${emailTo(step)}`} up={index >= 2} className="grid-cols-[1rem_minmax(0,1fr)_0.875rem]" {...line} detail={<EmailDetail step={step} />}>
            <GoogleLogo product="gmail" className="size-3.5" />
            <span className={cn("truncate", step.done && "text-muted-foreground")}>
              <b>{step.email!.toName ?? STEP_KIND[step.kind].label}</b> · {step.email!.subject}
            </span>
          </Line>
        ))}
        {steps.length > shown ? <More count={steps.length - shown} onMore={onMore} /> : null}
      </ul>
      <p className="mt-auto px-2 pb-2.5 text-[11.5px] leading-snug text-muted-foreground">
        Gmail opens a filled-in draft; you press Send.
        {meeting.dropped.sentences ? ` Code removed ${meeting.dropped.sentences} ${meeting.dropped.sentences === 1 ? "sentence" : "sentences"} with an amount that isn't in the notes or your prices.` : ""}
      </p>
    </div>
  );
}

/** FR-MEET-1: the paste form, in the drawer. Its text lives in the step, so closing the drawer keeps it. */
function NotesForm({
  opp,
  canEdit,
  notes,
  setNotes,
  example,
  onExample,
  loadingExample,
  exampleError,
  action,
  pending,
  error,
}: {
  opp: Opportunity;
  canEdit: boolean;
  notes: string;
  setNotes: (value: string) => void;
  example: { style: MeetingExample; text: string } | null;
  onExample: (style: MeetingExample) => void;
  loadingExample: boolean;
  exampleError: string | null;
  action: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
}) {
  if (!canEdit) return <p className="text-muted-foreground">Only editors can paste meeting notes.</p>;
  const isExample = example !== null && example.text === notes;
  return (
    <form action={action} className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Paste your notes from the meeting with {opp.contact?.name ?? opp.prospect?.name ?? "the client"}, as rough as they are. FlowHub lists what they said, quoting your notes, and plans the next steps against what you sell: suppliers to ask, approvals to get, demos, tenders and emails.
      </p>
      <label className="flex w-48 flex-col gap-1">
        <span className="text-xs font-semibold">Meeting date</span>
        <input type="date" name="heldOn" defaultValue={today()} max={today()} required className="h-9 rounded-lg border border-input bg-card px-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">Your notes</span>
        <textarea
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={12}
          maxLength={20000}
          required
          placeholder={"mtg w/ their IT lead + finance\n- liked the proposal, want a demo next week\n- asked about payment terms…"}
          className="min-h-56 rounded-lg border border-input bg-card px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <input type="hidden" name="example" value={isExample ? example.style : ""} />
      <p className="text-xs text-muted-foreground">
        No notes to hand? Try an example:{" "}
        {MEETING_EXAMPLES.map((style, index) => (
          <span key={style}>
            {index ? " · " : ""}
            <button type="button" disabled={loadingExample} onClick={() => onExample(style)} className="text-link underline-offset-2 hover:underline disabled:opacity-60">
              {EXAMPLE_LABEL[style]}
            </button>
          </span>
        ))}
        {loadingExample ? " …" : ""}
        {isExample ? <span className="ml-1 rounded-full bg-muted px-2 py-px font-semibold whitespace-nowrap">Example notes for {opp.prospect?.name ?? "this deal"}, built from the proposal</span> : null}
      </p>
      {exampleError ? <p className="text-xs text-destructive">{exampleError}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ClipboardList aria-hidden="true" />}
          {pending ? "Planning the next steps…" : "Plan the next steps"}
        </Button>
        <span className="text-xs text-muted-foreground">{pending ? "About half a minute. Gemini reads the notes, then code checks every quote and step." : "About half a minute · one of today's AI runs"}</span>
      </div>
      {pending ? <LoadingChip label="Reading your notes" /> : null}
      <p className="text-xs text-muted-foreground">Notes from Drive still come in on their own; if they arrive after you paste yours, they wait for you with Use these.</p>
    </form>
  );
}

/** The full notes: the plan's, or notes from Drive being planned or waiting (FR-NOTES-5). */
function NotesDrawer({ meeting, drive, canEdit, using, onUse }: { meeting: Meeting | null; drive: DriveNotes | null; canEdit: boolean; using: boolean; onUse: (id: string) => void }) {
  const pre = "max-h-[60vh] overflow-auto rounded-lg border-2 border-ink bg-card px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap";
  return (
    <div className="flex flex-col gap-4">
      {drive ? (
        <section className="flex flex-col gap-2">
          <span className={KICKER}>Found in Drive</span>
          <DriveSource drive={drive} />
          <p className="text-xs text-muted-foreground">
            For the meeting on <b className="text-foreground">{longDate(drive.heldOn)}</b>, found {drive.foundIn === "calendar" ? "attached to the Calendar event" : `in the Drive folder ${NOTES_FOLDER}`}
            {drive.truncated ? ", cut at 20,000 characters" : ""}.
          </p>
          {drive.status === "planning" ? (
            <LoadingChip label="Gemini reads the notes, then code checks every quote and step" />
          ) : drive.status === "failed" ? (
            <p className="text-sm text-destructive">{drive.error ?? "FlowHub couldn't plan from these notes."}</p>
          ) : (
            <p className="text-sm">You had already pasted notes for this meeting, so FlowHub didn&apos;t plan from these. Use these and the next steps are planned again; the plan from your pasted notes stays under Meetings.</p>
          )}
          {canEdit && drive.status !== "planning" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={using} onClick={() => onUse(drive.id)}>
                <ClipboardList aria-hidden="true" />
                Use these
              </Button>
              <span className="text-xs text-muted-foreground">Uses one of today&apos;s AI runs.</span>
            </div>
          ) : null}
          <pre className={pre}>{drive.text}</pre>
        </section>
      ) : null}
      {meeting ? (
        <section className="flex flex-col gap-2">
          {drive ? <span className={KICKER}>The plan&apos;s notes</span> : null}
          <Source meeting={meeting} />
          <pre className={pre}>{meeting.notes}</pre>
        </section>
      ) : null}
    </div>
  );
}

/** Every step in full, ticked off here too. */
function StepsDrawer({ meeting, canEdit, onToggle }: { meeting: Meeting; canEdit: boolean; onToggle: (meeting: Meeting, step: MeetingStep, value: boolean) => Promise<AfterResult> }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-muted-foreground">
        Each step comes from points in the notes. Code checked every offering, partner and selling rule it names against your confirmed hub
        {meeting.dropped.steps ? `, and dropped ${meeting.dropped.steps} ${meeting.dropped.steps === 1 ? "step" : "steps"} with nothing behind ${meeting.dropped.steps === 1 ? "it" : "them"}` : ""}.
      </p>
      {meeting.steps.map((step) => (
        <div key={step.id} className={cn("flex flex-col gap-1.5 rounded-xl border-2 border-ink bg-card px-3 py-2.5 text-[13.5px]", step.done && "bg-muted/30")}>
          <span className="flex items-center gap-2">
            <StepTick meeting={meeting} step={step} canEdit={canEdit} onToggle={onToggle} />
            <KindPill kind={step.kind} />
            <b className={cn("min-w-0 flex-1", step.done && "text-muted-foreground line-through")}>{step.title}</b>
          </span>
          <StepDetail meeting={meeting} step={step} inDrawer />
        </div>
      ))}
    </div>
  );
}

function SaidDrawer({ meeting }: { meeting: Meeting }) {
  return (
    <div className="flex flex-col gap-2.5">
      {meeting.summary ? (
        <div className="flex flex-col gap-1 rounded-xl border-2 border-ink bg-primary/15 px-3 py-2.5">
          <span className={KICKER}>In short</span>
          <p>{meeting.summary}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Every point quotes the notes word for word.
        {meeting.dropped.points ? ` Code dropped ${meeting.dropped.points} ${meeting.dropped.points === 1 ? "point" : "points"} whose words weren't in the notes.` : " Code checked each quote."}
      </p>
      {meeting.points.map((point) => (
        <div key={point.id} className="flex flex-col gap-1 rounded-xl border-2 border-ink bg-card px-3 py-2.5">
          <span className="flex items-start gap-2">
            <span className={cn(PILL, "border-[1.5px] border-line-soft text-muted-foreground capitalize")}>{point.kind}</span>
            <b className="min-w-0 flex-1">{point.text}</b>
          </span>
          <q className="text-xs text-muted-foreground italic">{point.quote}</q>
        </div>
      ))}
    </div>
  );
}

/** FR-MEET-5: every meeting's plan, newest first. */
function MeetingsDrawer({ meetings, shownId, onShow }: { meetings: Meeting[]; shownId: string | null; onShow: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Every meeting&apos;s plan is kept, newest first. Pick one to show it in the boxes.</p>
      {meetings.map((meeting) => (
        <button
          key={meeting.id}
          type="button"
          onClick={() => onShow(meeting.id)}
          className={cn("flex w-full items-center gap-2.5 rounded-xl border-2 border-ink px-3 py-2 text-left text-sm hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", meeting.id === shownId ? "bg-primary/15" : "bg-card")}
        >
          <b className="flex-1">{longDate(meeting.heldOn)}</b>
          <span className="text-xs text-muted-foreground">
            {meeting.source ? "From Google Drive" : meeting.example ? "Example notes" : `Pasted by ${meeting.createdBy}`} · {meeting.steps.length} {meeting.steps.length === 1 ? "step" : "steps"}, {meeting.steps.filter((step) => step.done).length} done
          </span>
          {meeting.id === shownId ? <span className="rounded-full bg-muted px-2 text-[11px] font-bold">Showing</span> : null}
        </button>
      ))}
    </div>
  );
}

/** "How this was made", built by code from the plan: what code loaded, what the Planner wrote, and what code kept. */
function MadeDrawer({ meeting }: { meeting: Meeting }) {
  const emails = meeting.steps.filter((step) => step.email).length;
  const refs = new Set(meeting.steps.flatMap((step) => step.refs.map((ref) => ref.name)));
  const steps: { ai: boolean; text: string }[] = [
    { ai: false, text: `Loaded the notes (${meeting.source ? `from Google Drive, “${meeting.source.docTitle}”` : meeting.example ? "example notes built from the proposal" : `pasted by ${meeting.createdBy}`}), the approved proposal and your confirmed offerings, partners and selling rules. No costs and no results marked not public.` },
    { ai: true, text: `The Planner listed ${meeting.points.length + meeting.dropped.points} points and ${meeting.steps.length + meeting.dropped.steps} next steps, with ${emails} ${emails === 1 ? "email" : "emails"}.` },
    { ai: false, text: `Kept each point whose quote is in the notes word for word (${meeting.points.length} of ${meeting.points.length + meeting.dropped.points}).` },
    ...(meeting.dropped.steps ? [{ ai: false, text: `Dropped ${meeting.dropped.steps} ${meeting.dropped.steps === 1 ? "step" : "steps"} with no point behind ${meeting.dropped.steps === 1 ? "it" : "them"}.` }] : []),
    ...(refs.size ? [{ ai: false, text: `Checked every hub reference against confirmed entities: ${[...refs].join(", ")}.` }] : []),
    { ai: false, text: meeting.dropped.sentences ? `Removed ${meeting.dropped.sentences} email ${meeting.dropped.sentences === 1 ? "sentence" : "sentences"} with an amount that isn't in the notes or the approved prices.` : "Checked the emails: no amount outside the notes or the approved prices." },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Planned {new Date(meeting.createdAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. One AI run.
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
