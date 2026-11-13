"use client";

import { AlertTriangle, CalendarPlus, Check, ExternalLink, Loader2, RotateCcw, Send, Video } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { openTab, signedInEmail } from "@/components/flowhub/gmail-button";
import { CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { AGENDA_MAX, MEETING_MINUTES, WORKSPACE_TIME_ZONE, agendaAmounts, calendarTemplateUrl, checkAgendaEdit, meetingAgenda, meetingTitle, parseGuests, zonedTime } from "@/lib/calendar";
import { duplicateInvite } from "@/lib/invites";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { CalendarInvite, ClientDeck, Opportunity, PitchPrep, Run, WriteOutput } from "@/lib/schema";
import { recordPlannedMeeting, sendMeetingInvite } from "./after-actions";
import { Card } from "./gate-parts";

/** The next working day in the workspace's zone, as YYYY-MM-DD. */
function nextWorkingDay(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: WORKSPACE_TIME_ZONE }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

const field = "rounded-lg border border-input bg-card px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Step E, Schedule the meeting (PRD 7.28): shows as soon as step E opens, with
 * the pitch prep's points once it is written.
 * - With the Gmail script connected (ADR-0020 D7), "Send invite" queues it, and
 *   the script sends it from the sales inbox's own Calendar, with Google Meet.
 * - Otherwise, or by choice, it opens a filled-in Google Calendar event the
 *   person saves (ADR-0016 D7). No Calendar permission either way.
 * - Editors may rewrite the agenda (FR-CAL-9). The button locks while it sends,
 *   and stays off for a meeting already sent to the same guests (FR-CAL-10).
 */
export function ScheduleCard({ opp, run, prep, seller, topic, privateNames, inviteFrom, canEdit }: { opp: Opportunity; run: Run; prep: PitchPrep | null; seller: string; topic: string; privateNames: string[]; inviteFrom: string | null; canEdit: boolean }) {
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

  function open() {
    if (!url) return;
    setNotice(null);
    setError(null);
    setBlockedUrl(openTab(url) ? null : url);
    if (canEdit && save && !canSend)
      void recordPlannedMeeting(opp.id, day, time, minutes).then((result) => setNotice(result.error ?? "Saved as the next meeting on this deal."));
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

  return (
    <Card title="Schedule the meeting" id="schedule" marker={edited ? <PersonMarker name="You">Agenda edited</PersonMarker> : <CalcMarker>Agenda by code</CalcMarker>}>
      <div className="grid items-start gap-5 px-5 py-4 text-sm xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-36 flex-[2] flex-col gap-1">
              <span className="text-xs font-semibold">Date</span>
              <input type="date" value={day} onChange={(event) => setDay(event.target.value)} className={field} />
            </label>
            <label className="flex min-w-28 flex-1 flex-col gap-1">
              <span className="text-xs font-semibold">Start</span>
              <input type="time" value={time} step={900} onChange={(event) => setTime(event.target.value)} className={field} />
            </label>
            <label className="flex min-w-28 flex-1 flex-col gap-1">
              <span className="text-xs font-semibold">Length</span>
              <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className={field}>
                {MEETING_MINUTES.map((value) => (
                  <option key={value} value={value}>
                    {value < 60 ? `${value} min` : value % 60 ? `${Math.floor(value / 60)} h ${value % 60} min` : `${value / 60} h`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className="-mt-1.5 text-[11px] text-muted-foreground">Times are Malaysia time ({WORKSPACE_TIME_ZONE}).</span>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Guests</span>
            <input type="text" value={guestText} onChange={(event) => setGuestText(event.target.value)} placeholder="name@company.com, another@company.com" className={field} />
            <span className="text-[11px] text-muted-foreground">
              {typedGuests > guests.length ? `${typedGuests - guests.length} not an email address, left out. ` : ""}
              {opp.contact?.email ? `Filled in from the deal's contact, ${opp.contact.name}.` : "No contact email on this deal yet. Add the guests here."}
            </span>
          </label>

          {canSend ? (
            <>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={inviteMe} onChange={(event) => setInviteMe(event.target.checked)} />
                Invite me too
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={!valid || guests.length === 0 || pending || sentNow || Boolean(problem)} onClick={send} title="FlowHub's Gmail script creates the event with Google Meet in the sales inbox's Calendar and emails the guests.">
                  {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : sentNow ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {pending ? "Sending…" : sentNow ? "Invite sent" : "Send invite"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  From <b className="text-foreground">{inviteFrom}</b>, with Google Meet.
                </span>
              </div>
              {sentNow && !pending ? <p className="text-xs text-muted-foreground">Already sent to these guests for this time. To send another, change the time or the guests. To change this one, open it in Google Calendar.</p> : null}
              <button type="button" disabled={!url} onClick={open} className="w-fit text-xs text-link underline-offset-2 hover:underline">
                Open in Google Calendar instead
              </button>
            </>
          ) : (
            <>
              {canEdit ? (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} />
                  Save the time as this deal&apos;s next meeting
                </label>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={!url} onClick={open} title="Opens a filled-in event in Google Calendar. You check it and press Save there.">
                  <CalendarPlus aria-hidden="true" />
                  Open in Google Calendar
                </Button>
                <span className="text-xs text-muted-foreground">Nothing is booked until you save it in Calendar.</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Google Calendar normally adds a Google Meet link when you save. Check it&apos;s there.
                {canEdit ? " To send invites from FlowHub, connect the Gmail script in Settings › Inbox." : ""}
              </p>
            </>
          )}
          {blockedUrl ? (
            <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-link hover:underline">
              The browser blocked the new tab. Open the event <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ) : null}
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {invites.length ? <InviteList invites={invites.slice(-3).reverse()} /> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span>What the guests see{canEdit ? " (you can edit it)" : ""}</span>
            {edited ? (
              <button type="button" onClick={() => setDraft(null)} className="inline-flex items-center gap-1 font-normal text-link hover:underline">
                <RotateCcw aria-hidden="true" className="size-3" />
                Back to FlowHub&apos;s agenda
              </button>
            ) : null}
          </span>
          <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-3 py-2.5">
            <b>{title}</b>
            {canEdit ? (
              <textarea
                value={text}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={AGENDA_MAX}
                rows={Math.min(24, Math.max(10, text.split("\n").length + 1))}
                aria-label="The invite's text"
                className="-mx-1.5 resize-y rounded-md border border-dashed border-input bg-transparent px-1.5 py-1 font-sans text-xs leading-relaxed text-muted-foreground outline-none focus-visible:border-solid focus-visible:border-ring focus-visible:bg-card focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            ) : (
              <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">{text}</pre>
            )}
          </div>
          {problem ? <span className="text-xs text-destructive">{problem}</span> : null}
          {amounts ? <span className="text-xs text-fit-partial">Your text mentions {amounts === 1 ? "an amount" : `${amounts} amounts`}. Check the guests should see {amounts === 1 ? "it" : "them"}.</span> : null}
          <span className="text-[11px] text-muted-foreground">
            {edited
              ? "Your wording. FlowHub still blocks results not marked public and price placeholders."
              : `No amounts, no private results and none of the prep's notes: code checks every line.${agenda.dropped ? ` It left out ${agenda.dropped} ${agenda.dropped === 1 ? "line" : "lines"}.` : ""}`}
          </span>
        </div>
      </div>
    </Card>
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
                  <Video aria-hidden="true" className="size-3.5" />
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
