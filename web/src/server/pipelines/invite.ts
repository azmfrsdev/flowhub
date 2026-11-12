import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { WORKSPACE_TIME_ZONE, meetingAgenda, meetingLabel, meetingTitle, meetingTopic, zonedTime } from "@/lib/calendar";
import { inviteSender, newInviteId } from "@/lib/invites";
import { AuditEvent, CalendarInvite, type ClientDeck, INVITE_DAILY_LIMIT, type PitchPrep } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { getGraphFor } from "@/server/graph/load";
import type { HubContext } from "@/server/workspace/access";
import { loadProposal } from "./prep";

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteError";
  }
}

/**
 * FR-CAL-6, ADR-0020 D7: a person sends the meeting invite from FlowHub. Code
 * builds the title and the agenda again on the server, from the same
 * functions the card's preview uses, so the browser's text is never trusted.
 * The invite waits in `invites/{id}` until the Gmail script in the sales
 * inbox's account picks it up, within a minute, and sends it from Calendar.
 */
export async function queueInvite(context: HubContext, input: { opportunityId: string; writeRunId: string; day: string; time: string; minutes: number; guests: string[] }): Promise<CalendarInvite> {
  const ws = context.workspace.id;
  const organiser = inviteSender(context.workspace.inbox, Date.now());
  if (!organiser) throw new InviteError("The Gmail script isn't connected, so FlowHub can't send invites. Open the event in Google Calendar instead, or connect it in Settings › Inbox.");

  const { oppRef, opp, run, working } = await loadProposal(ws, input.opportunityId, input.writeRunId);
  const invites = db().collection(`workspaces/${ws}/invites`);
  const dayStart = zonedTime(new Intl.DateTimeFormat("en-CA", { timeZone: WORKSPACE_TIME_ZONE }).format(new Date()), "00:00", WORKSPACE_TIME_ZONE).toISOString();
  const [prepSnap, deckSnap, graph, today] = await Promise.all([
    oppRef.collection("preps").doc(run.id).get(),
    oppRef.collection("decks").doc(run.id).get(),
    getGraphFor(ws),
    invites.where("createdAt", ">=", dayStart).count().get(),
  ]);
  if (today.data().count >= INVITE_DAILY_LIMIT) throw new InviteError(`FlowHub sends at most ${INVITE_DAILY_LIMIT} invites a day. Open the event in Google Calendar instead.`);

  const start = zonedTime(input.day, input.time, WORKSPACE_TIME_ZONE);
  if (start.getTime() < Date.now() - 60 * 60 * 1000) throw new InviteError("That time has passed. Choose a time from now on.");
  const prep = (prepSnap.data() as PitchPrep | undefined) ?? null;
  const deck = (deckSnap.data() as ClientDeck | undefined) ?? null;
  const doc = working.doc ?? opp.latestDoc;
  const links = [...(doc ? [{ label: "The proposal (Google Doc)", url: doc.url }] : []), ...(deck?.slides ? [{ label: "The slides (Google Slides)", url: deck.slides.url }] : [])];
  // Invariant 5: results marked not public stay out of what guests see.
  const privateNames = graph.proof.filter((item) => !item.isPublic).flatMap((item) => [item.title, item.clientName ?? ""]).filter(Boolean);
  const names = opp.interestedOfferingIds.map((id) => graph.offerings.find((offering) => offering.id === id)?.name).filter((name): name is string => Boolean(name));
  const prospect = opp.prospect?.name ?? "the client";
  const label = meetingLabel(start, WORKSPACE_TIME_ZONE);
  const now = new Date().toISOString();
  const invite = CalendarInvite.parse({
    id: newInviteId(),
    opportunityId: input.opportunityId,
    writeRunId: run.id,
    status: "queued",
    title: meetingTitle(context.workspace.name, prospect, meetingTopic(names)),
    details: meetingAgenda(prep, links, privateNames).text,
    start: start.toISOString(),
    end: new Date(start.getTime() + input.minutes * 60_000).toISOString(),
    timeZone: WORKSPACE_TIME_ZONE,
    guests: input.guests,
    organiser,
    label,
    createdAt: now,
    createdBy: context.user.name,
  });

  const batch = db().batch();
  batch.set(invites.doc(invite.id), invite);
  // FR-CAL-5: a sent invite is the deal's next meeting.
  batch.update(oppRef, { nextMeeting: label, updatedAt: now, rev: FieldValue.increment(1) });
  batch.set(
    db().collection(`workspaces/${ws}/auditEvents`).doc(),
    AuditEvent.parse({ action: "send", entity: "meeting-invite", entityId: invite.id, summary: `Sent the meeting invite for ${prospect} on ${label} to ${invite.guests.join(", ")}, from ${organiser}.`, by: context.user.uid, byName: context.user.name, at: now }),
  );
  await batch.commit();
  return invite;
}
