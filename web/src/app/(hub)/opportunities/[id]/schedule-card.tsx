"use client";

import { AlertTriangle, Check, ExternalLink, Loader2, RotateCcw, Send, Users } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { openTab, signedInEmail } from "@/components/flowhub/gmail-button";
import { GoogleLogo } from "@/components/flowhub/google-logo";
import { Button } from "@/components/ui/button";
import { AGENDA_MAX, MEETING_MINUTES, WORKSPACE_TIME_ZONE, agendaAmounts, calendarTemplateUrl, checkAgendaEdit, meetingAgenda, meetingTitle, parseGuests, zonedTime } from "@/lib/calendar";
import { duplicateInvite } from "@/lib/invites";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { CalendarInvite, ClientDeck, Opportunity, PitchPrep, Run, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { recordPlannedMeeting, sendMeetingInvite } from "./after-actions";

/** The next working day in the workspace's zone, as YYYY-MM-DD. */
function nextWorkingDay(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: WORKSPACE_TIME_ZONE }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

const field = "rounded-lg border border-input bg-card px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: WORKSPACE_TIME_ZONE });
const clockFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: WORKSPACE_TIME_ZONE });
const lengthLabel = (value: number) => (value < 60 ? `${value} min` : value % 60 ? `${Math.floor(value / 60)} h ${value % 60} min` : `${value / 60} h`);

export type MeetingPlan = ReturnType<typeof useMeetingPlan>;

/**
 * Step E, Schedule the meeting (PRD 7.28), as state shared by the Meeting box, its drawer
 * and the header's Send invite (FR-PREP-6).
 * - With the Gmail script connected (ADR-0020 D7), "Send invite" queues it, and the script
 *   sends it from the sales inbox's own Calendar, with Google Meet.
 * - Otherwise, or by choice, it opens a filled-in Google Calendar event the person saves
 *   (ADR-0016 D7). No Calendar permission either way.
 * - Editors may rewrite the agenda (FR-CAL-9). Sending locks while it runs, and stays off for
 *   a meeting already sent to the same guests (FR-CAL-10).
 */
export function useMeetingPlan({ opp, run, prep, seller, topic, privateNames, inviteFrom, canEdit }: { opp: Opportunity; run: Run; prep: PitchPrep | null; seller: string; topic: string; privateNames: string[]; inviteFrom: string | null; canEdit: boolean }) {
  const { data: deck } = useLiveDoc<ClientDeck>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/decks/${run.id}`, null);
  const invites = useLiveCollection<CalendarInvite>(`workspaces/${opp.workspaceId}/invites`, "createdAt").filter((invite) => invite.opportunityId === opp.id);
  const [day, setDay] = useState(nextWorkingDay);
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState<number>(60);
  const [guestText, setGuestText] = useState(opp.contact?.email ?? "");
  const [save, setSave] = useState(true);
  const [inviteMe, setInviteMe] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);
  const sending = useRef(false);
  const [pending, startTransition] = useTransition();

  const prospect = opp.prospect?.name ?? "the client";
  const guests = parseGuests(guestText);
  const doc = (run.working as WriteOutput).doc ?? opp.latestDoc;
  const agenda = useMemo(() => {
    // FR-CAL-3: links added by code, never by a model.
    const links = [
      ...(doc ? [{ label: "The proposal (Google Doc)", url: doc.url }] : []),
      ...(deck?.slides ? [{ label: "The slides (Google Slides)", url: deck.slides.url }] : []),
    ];
    return meetingAgenda(prep, links, privateNames);
  }, [prep, doc, deck, privateNames]);
  const title = meetingTitle(seller, prospect, topic);
  // FR-CAL-9: the person's wording, once they change it; FlowHub's agenda until then.
  const text = draft ?? agenda.text;
  const edited = draft !== null && draft.trim() !== agenda.text.trim();
  const problem = edited ? checkAgendaEdit(text, privateNames) : null;
  const amounts = edited ? agendaAmounts(text) : 0;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time);
  const start = valid ? zonedTime(day, time, WORKSPACE_TIME_ZONE) : null;
  const url = start ? calendarTemplateUrl({ title, start, minutes, details: text, guests, timeZone: WORKSPACE_TIME_ZONE }, signedInEmail()) : null;
  const typedGuests = guestText.split(/[\s,;]+/).filter(Boolean).length;
  const canSend = Boolean(inviteFrom) && canEdit;
  const me = signedInEmail();
  const sendTo = inviteMe && me && me.toLowerCase() !== inviteFrom?.toLowerCase() ? parseGuests([...guests, me].join(",")) : guests;
  // FR-CAL-10: the same meeting to the same guests goes once.
  const sendKey = start ? `${start.toISOString()}|${sendTo.map((guest) => guest.toLowerCase()).sort().join(",")}` : null;
  const already = start ? duplicateInvite(invites, start.toISOString(), sendTo) : null;
  const sentNow = Boolean(already) || (sendKey !== null && justSent === sendKey);
  const latest = invites.at(-1) ?? null;
  // FR-PREP-6: once a meeting is on its way (or saved as the next meeting), the header moves on to Follow-up.
  const booked = invites.some((invite) => invite.status !== "failed") || sentNow || (!canSend && Boolean(opp.nextMeeting));
  const sendDisabled = !valid || guests.length === 0 || pending || sentNow || Boolean(problem);

  function open() {
    if (!url) return;
    setNotice(null);
    setError(null);
    setBlockedUrl(openTab(url) ? null : url);
    if (canEdit && save && !canSend) void recordPlannedMeeting(opp.id, day, time, minutes).then((result) => setNotice(result.error ?? "Saved as the next meeting on this deal."));
  }

  function send() {
    // A ref, not state: a double click lands before React re-renders the button.
    if (sending.current || sentNow || problem) return;
    sending.current = true;
    setNotice(null);
    setError(null);
    const key = sendKey;
    startTransition(async () => {
      try {
        const result = await sendMeetingInvite(opp.id, run.id, day, time, minutes, sendTo, edited ? text : null);
        if (result.error) setError(result.error);
        else {
          setJustSent(key);
          setNotice(`Sent to the Gmail script. ${inviteFrom} sends it from Google Calendar within a minute.`);
        }
      } finally {
        sending.current = false;
      }
    });
  }

  return {
    opp, day, setDay, time, setTime, minutes, setMinutes, guestText, setGuestText, save, setSave, inviteMe, setInviteMe,
    notice, error, blockedUrl, text, setDraft, edited, problem, amounts, valid, start, url, title, guests, typedGuests,
    canSend, canEdit, inviteFrom, sentNow, pending, send, open, invites, latest, booked, sendDisabled, agendaDropped: agenda.dropped,
  };
}

/** "Thu 19 Nov · 10:00–11:00" in the workspace's zone. */
function when(start: Date, minutes: number) {
  return `${dayFormat.format(start)} · ${clockFormat.format(start)}–${clockFormat.format(new Date(start.getTime() + minutes * 60_000))}`;
}

/** FR-PREP-6: the header's one action for the meeting: Send invite, or Open in Google Calendar without the Gmail script. */
export function MeetingAction({ plan }: { plan: MeetingPlan }) {
  const main = "h-10 px-4 text-[15px] font-bold shadow-comic";
  return (
    <>
      {plan.error ? <span className="text-sm text-destructive">{plan.error}</span> : null}
      {plan.start ? <span className="hidden text-xs text-muted-foreground xl:inline">{dayFormat.format(plan.start)}, {clockFormat.format(plan.start)}</span> : null}
      {plan.canSend ? (
        <Button type="button" disabled={plan.sendDisabled} onClick={plan.send} className={main} title={plan.guests.length ? `FlowHub's Gmail script creates the event with Google Meet in ${plan.inviteFrom}'s Calendar and emails the guests.` : "Add a guest in Meeting › Edit first."}>
          {plan.pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <GoogleLogo product="calendar" />}
          {plan.pending ? "Sending…" : "Send invite"}
        </Button>
      ) : (
        <Button type="button" disabled={!plan.url} onClick={plan.open} className={main} title="Opens a filled-in event in Google Calendar. You check it and press Save there.">
          <GoogleLogo product="calendar" />
          Open in Google Calendar
        </Button>
      )}
    </>
  );
}

/** FR-PREP-6: the Meeting box, one line each: when, who, from where, Meet, and where it stands. */
export function MeetingSummary({ plan, onAgenda }: { plan: MeetingPlan; onAgenda: () => void }) {
  const latest = plan.latest && plan.latest.status !== "failed" ? plan.latest : null;
  const start = latest ? new Date(latest.start) : plan.start;
  const minutes = latest ? Math.round((Date.parse(latest.end) - Date.parse(latest.start)) / 60_000) || plan.minutes : plan.minutes;
  const guests = latest ? latest.guests : plan.guests;
  const contact = plan.opp.contact;
  const who = guests.length
    ? guests.length === 1 && contact?.email && guests[0].toLowerCase() === contact.email.toLowerCase()
      ? `${contact.name}, the deal's contact`
      : guests.join(", ")
    : "No guest yet";
  const line = "flex h-8 items-center gap-2 border-b border-dashed border-line-soft text-[13.5px] whitespace-nowrap [&>svg]:size-4 [&>svg]:shrink-0";
  return (
    <div className="flex flex-col px-4 pt-1.5">
      <div className={line}>
        <GoogleLogo product="calendar" />
        <b className="truncate">{start ? when(start, minutes) : "Pick a date and time"}</b>
        <span className="text-[11.5px] text-muted-foreground">Malaysia time</span>
      </div>
      <div className={line}>
        <Users aria-hidden="true" className="text-muted-foreground" />
        <span className="truncate">{who}</span>
      </div>
      <div className={line}>
        {plan.canSend ? <GoogleLogo product="gmail" /> : <GoogleLogo product="calendar" />}
        <span className="truncate">{plan.canSend ? `From ${plan.inviteFrom}` : "You save it in Google Calendar"}</span>
      </div>
      <div className={cn(line, "border-b-0")}>
        <GoogleLogo product="meet" />
        {latest?.meetUrl ? (
          <a href={latest.meetUrl} target="_blank" rel="noopener noreferrer" className="truncate text-link hover:underline">
            {latest.meetUrl.replace(/^https:\/\//, "")}
          </a>
        ) : (
          <span className="truncate">Google Meet, added by Calendar</span>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <InviteStatus plan={plan} />
        <span className="flex-1" />
        <button type="button" onClick={onAgenda} className="text-xs whitespace-nowrap text-link underline-offset-2 hover:underline">
          What the guests see
        </button>
      </div>
    </div>
  );
}

function InviteStatus({ plan }: { plan: MeetingPlan }) {
  const pill = "inline-flex items-center gap-1 rounded-full px-2 text-[11.5px] leading-5 font-bold whitespace-nowrap [&_svg]:size-3";
  const latest = plan.latest;
  if (latest?.status === "sent") return <span className={cn(pill, "bg-fit-strong-soft text-fit-strong")}><Check aria-hidden="true" />Sent · Calendar emailed the guests</span>;
  if (latest && latest.status !== "failed") return <span className={cn(pill, "bg-ai-soft text-ai")}><Loader2 aria-hidden="true" className="animate-spin" />Waiting for the Gmail script</span>;
  if (latest?.status === "failed") return <span title={latest.error ?? undefined} className={cn(pill, "bg-destructive/10 text-destructive")}><AlertTriangle aria-hidden="true" />Not sent</span>;
  if (!plan.canSend && plan.opp.nextMeeting) return <span className={cn(pill, "bg-fit-strong-soft text-fit-strong")}><Check aria-hidden="true" />Next meeting: {plan.opp.nextMeeting}</span>;
  return <span className={cn(pill, "bg-muted text-muted-foreground")}>Not sent yet</span>;
}

/** FR-PREP-6: the Meeting drawer: date, guests, the agenda the guests see (FR-CAL-9), and the invites sent (FR-CAL-8). */
export function MeetingForm({ plan }: { plan: MeetingPlan }) {
  const { opp, canEdit } = plan;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-36 flex-[2] flex-col gap-1">
          <span className="text-xs font-semibold">Date</span>
          <input type="date" value={plan.day} disabled={!canEdit} onChange={(event) => plan.setDay(event.target.value)} className={field} />
        </label>
        <label className="flex min-w-28 flex-1 flex-col gap-1">
          <span className="text-xs font-semibold">Start</span>
          <input type="time" value={plan.time} step={900} disabled={!canEdit} onChange={(event) => plan.setTime(event.target.value)} className={field} />
        </label>
        <label className="flex min-w-28 flex-1 flex-col gap-1">
          <span className="text-xs font-semibold">Length</span>
          <select value={plan.minutes} disabled={!canEdit} onChange={(event) => plan.setMinutes(Number(event.target.value))} className={field}>
            {MEETING_MINUTES.map((value) => (
              <option key={value} value={value}>
                {lengthLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="-mt-1.5 text-[11px] text-muted-foreground">Malaysia time ({WORKSPACE_TIME_ZONE})</span>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">Guests</span>
        <input type="text" value={plan.guestText} disabled={!canEdit} onChange={(event) => plan.setGuestText(event.target.value)} placeholder="name@company.com, another@company.com" className={field} />
        <span className="text-[11px] text-muted-foreground">
          {plan.typedGuests > plan.guests.length ? `${plan.typedGuests - plan.guests.length} not an email address, left out. ` : ""}
          {opp.contact?.email ? `From the deal's contact, ${opp.contact.name}.` : "No contact email on this deal yet."}
        </span>
      </label>
      {plan.canSend ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={plan.inviteMe} onChange={(event) => plan.setInviteMe(event.target.checked)} />
          Invite me too
        </label>
      ) : canEdit ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={plan.save} onChange={(event) => plan.setSave(event.target.checked)} />
          Save the time as this deal&apos;s next meeting
        </label>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t border-dashed border-line-soft pt-3">
        <span className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
          <span>What the guests see{canEdit ? " (you can edit it)" : ""}</span>
          {plan.edited ? (
            <button type="button" onClick={() => plan.setDraft(null)} className="inline-flex items-center gap-1 font-normal text-link hover:underline">
              <RotateCcw aria-hidden="true" className="size-3" />
              Back to FlowHub&apos;s agenda
            </button>
          ) : null}
        </span>
        <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-3 py-2.5">
          <b>{plan.title}</b>
          {canEdit ? (
            <textarea
              value={plan.text}
              onChange={(event) => plan.setDraft(event.target.value)}
              maxLength={AGENDA_MAX}
              rows={Math.min(20, Math.max(9, plan.text.split("\n").length + 1))}
              aria-label="The invite's text"
              className="-mx-1.5 resize-y rounded-md border border-dashed border-input bg-transparent px-1.5 py-1 font-sans text-xs leading-relaxed text-muted-foreground outline-none focus-visible:border-solid focus-visible:border-ring focus-visible:bg-card focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ) : (
            <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">{plan.text}</pre>
          )}
        </div>
        {plan.problem ? <span className="text-xs text-destructive">{plan.problem}</span> : null}
        {plan.amounts ? <span className="text-xs text-fit-partial">Your text mentions {plan.amounts === 1 ? "an amount" : `${plan.amounts} amounts`}. Check the guests should see {plan.amounts === 1 ? "it" : "them"}.</span> : null}
        <span className="text-[11px] text-muted-foreground">
          {plan.edited ? "Your wording. FlowHub still blocks results not marked public and price placeholders." : `No amounts, no private results and none of the prep's notes: code checks every line.${plan.agendaDropped ? ` It left out ${plan.agendaDropped} ${plan.agendaDropped === 1 ? "line" : "lines"}.` : ""}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line-soft pt-3">
        {plan.canSend ? (
          <>
            <Button type="button" disabled={plan.sendDisabled} onClick={plan.send}>
              {plan.pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : plan.sentNow ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}
              {plan.pending ? "Sending…" : plan.sentNow ? "Invite sent" : "Send invite"}
            </Button>
            <button type="button" disabled={!plan.url} onClick={plan.open} className="text-xs text-link underline-offset-2 hover:underline">
              Open in Google Calendar instead
            </button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={!plan.url} onClick={plan.open}>
              <GoogleLogo product="calendar" />
              Open in Google Calendar
            </Button>
            <span className="text-xs text-muted-foreground">Nothing is booked until you save it there. Check Calendar added a Meet link.</span>
          </>
        )}
      </div>
      {plan.sentNow && !plan.pending ? <p className="text-xs text-muted-foreground">Already sent to these guests for this time. To send another, change the time or the guests.</p> : null}
      {!plan.canSend && canEdit ? <p className="text-xs text-muted-foreground">To send invites from FlowHub, connect the Gmail script in Settings › Inbox.</p> : null}
      {plan.blockedUrl ? (
        <a href={plan.blockedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-link hover:underline">
          The browser blocked the new tab. Open the event <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      ) : null}
      {plan.notice ? <p className="text-xs text-muted-foreground">{plan.notice}</p> : null}
      {plan.error ? <p className="text-sm text-destructive">{plan.error}</p> : null}
      {plan.invites.length ? <InviteList invites={plan.invites.slice(-3).reverse()} /> : null}
    </div>
  );
}

/** FR-CAL-8: the invites sent from this deal, live, as the script reports back. */
function InviteList({ invites }: { invites: CalendarInvite[] }) {
  return (
    <ul className="flex flex-col gap-1.5 border-t pt-3">
      {invites.map((invite) => (
        <li key={invite.id} className="flex flex-col gap-0.5 text-xs">
          <span className="flex flex-wrap items-center gap-1.5">
            {invite.status === "sent" ? (
              <Check aria-hidden="true" className="size-3.5 text-fit-strong" />
            ) : invite.status === "failed" ? (
              <AlertTriangle aria-hidden="true" className="size-3.5 text-destructive" />
            ) : (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" />
            )}
            <b>{invite.label}</b>
            <span className="text-muted-foreground">
              {invite.status === "sent" ? `sent from ${invite.organiser ?? "the sales inbox"} to ${invite.guests.join(", ")}` : invite.status === "failed" ? "not sent" : `waiting for the Gmail script${invite.error ? `, trying again: ${invite.error}` : ""}`}
            </span>
          </span>
          {invite.status === "sent" && (invite.meetUrl || invite.eventUrl) ? (
            <span className="flex flex-wrap gap-3 pl-5">
              {invite.meetUrl ? (
                <a href={invite.meetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                  <GoogleLogo product="meet" className="size-3.5" />
                  {invite.meetUrl.replace(/^https:\/\//, "")}
                </a>
              ) : null}
              {invite.eventUrl ? (
                <a href={invite.eventUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                  Open in Calendar <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              ) : null}
            </span>
          ) : null}
          {invite.status === "failed" && invite.error ? <span className="pl-5 text-destructive">{invite.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}
