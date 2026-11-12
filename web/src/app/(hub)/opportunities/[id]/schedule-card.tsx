"use client";

import { CalendarPlus, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { openTab, signedInEmail } from "@/components/flowhub/gmail-button";
import { CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { MEETING_MINUTES, WORKSPACE_TIME_ZONE, calendarTemplateUrl, meetingAgenda, meetingTitle, parseGuests, zonedTime } from "@/lib/calendar";
import { useLiveDoc } from "@/lib/firebase/live";
import type { ClientDeck, Opportunity, PitchPrep, Run, WriteOutput } from "@/lib/schema";
import { recordPlannedMeeting } from "./after-actions";
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
 * Step E, Schedule the meeting (PRD 7.28, ADR-0016 D7): a Google Calendar
 * event, filled in, with the pitch prep's points once it is written. It
 * shows as soon as step E opens. No Calendar permission and
 * no event made by FlowHub: the person checks it in Calendar and saves it,
 * and Calendar adds the Google Meet link.
 */
export function ScheduleCard({ opp, run, prep, seller, topic, privateNames, canEdit }: { opp: Opportunity; run: Run; prep: PitchPrep | null; seller: string; topic: string; privateNames: string[]; canEdit: boolean }) {
  const { data: deck } = useLiveDoc<ClientDeck>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/decks/${run.id}`, null);
  const [day, setDay] = useState(nextWorkingDay);
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState<number>(60);
  const [guestText, setGuestText] = useState(opp.contact?.email ?? "");
  const [save, setSave] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

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
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time);
  const url = valid ? calendarTemplateUrl({ title, start: zonedTime(day, time, WORKSPACE_TIME_ZONE), minutes, details: agenda.text, guests, timeZone: WORKSPACE_TIME_ZONE }, signedInEmail()) : null;
  const typedGuests = guestText.split(/[\s,;]+/).filter(Boolean).length;

  function open() {
    if (!url) return;
    setNotice(null);
    setBlockedUrl(openTab(url) ? null : url);
    if (canEdit && save)
      void recordPlannedMeeting(opp.id, day, time, minutes).then((result) => setNotice(result.error ?? "Saved as the next meeting on this deal."));
  }

  return (
    <Card title="Schedule the meeting" id="schedule" marker={<CalcMarker>Agenda by code</CalcMarker>}>
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
              {opp.contact?.email ? `Filled in from the deal's contact, ${opp.contact.name}.` : "No contact email on this deal yet. Add guests here or in Calendar."}
            </span>
          </label>
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
          {blockedUrl ? (
            <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-link hover:underline">
              The browser blocked the new tab. Open the event <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ) : null}
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
          <p className="text-xs text-muted-foreground">Google Calendar normally adds a Google Meet link when you save. Check it&apos;s there before you send the invite.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">What the guests see</span>
          <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-3 py-2.5">
            <b>{title}</b>
            <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">{agenda.text}</pre>
          </div>
          <span className="text-[11px] text-muted-foreground">
            No amounts, no private results and none of the prep&apos;s notes: code checks every line.
            {agenda.dropped ? ` It left out ${agenda.dropped} ${agenda.dropped === 1 ? "line" : "lines"}.` : ""}
          </span>
        </div>
      </div>
    </Card>
  );
}
