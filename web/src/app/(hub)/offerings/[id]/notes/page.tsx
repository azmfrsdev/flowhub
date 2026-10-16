import { Pin, PinOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { summaryIsCurrent } from "@/lib/offerings/notes-summary";
import { type Note, NoteSummary } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { loadOffering } from "@/server/graph/offering";
import { getHubContext } from "@/server/workspace/access";
import { DeleteButton } from "@/components/flowhub/delete-button";
import { EditDialog, Field } from "@/components/flowhub/edit-dialog";
import { addNote, deleteNote, setNotePinned, updateNote } from "./actions";
import { NoteForm } from "./note-form";
import { SummaryButton } from "./summary-button";

export const metadata: Metadata = { title: "Notes" };

/** FR-OFR-8, the Notes tab. */
export default function NotesPage({ params, searchParams }: PageProps<"/offerings/[id]/notes">) {
  return (
    <Suspense fallback={<TabFallback label="Loading notes" />}>
      <Notes params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Notes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: PageProps<"/offerings/[id]/notes">["searchParams"] }) {
  const [{ id }, { show }] = await Promise.all([params, searchParams]);
  const [{ offering, graph, role }, { workspace }] = await Promise.all([loadOffering(id), getHubContext()]);
  const summarySnap = await db().doc(`workspaces/${workspace.id}/noteSummaries/${offering.id}`).get();
  const parsedSummary = summarySnap.exists ? NoteSummary.safeParse(summarySnap.data()) : null;
  const summary = parsedSummary?.success ? parsedSummary.data : null;
  const all = graph.notes.filter((note) => note.offeringId === offering.id).sort((a, b) => b.at.localeCompare(a.at));
  const pinnedOnly = show === "pinned";
  const notes = pinnedOnly ? all.filter((note) => note.pinned) : all;
  const canEdit = role !== "viewer";
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  const base = `/offerings/${offering.id}/notes`;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {canEdit ? (
          <section className="rounded-xl border-2 border-ink bg-card shadow-comic">
            <NoteForm action={addNote.bind(null, offering.id)} />
          </section>
        ) : null}
        <SectionCard
          title="Notes"
          id="notes"
          count={all.length}
          action={
            <nav aria-label="Filter notes" className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
              <Link href={base} aria-current={!pinnedOnly ? "page" : undefined} className={cn("rounded-md px-2.5 py-0.5", !pinnedOnly ? "bg-card font-semibold shadow-xs" : "text-muted-foreground")}>
                All
              </Link>
              <Link href={`${base}?show=pinned`} aria-current={pinnedOnly ? "page" : undefined} className={cn("rounded-md px-2.5 py-0.5", pinnedOnly ? "bg-card font-semibold shadow-xs" : "text-muted-foreground")}>
                Pinned
              </Link>
            </nav>
          }
        >
          {notes.length === 0 ? (
            <EmptyRow>{pinnedOnly ? "No pinned notes." : "No notes yet. Add what you learn about selling this offering."}</EmptyRow>
          ) : (
            <ol className="flex flex-col divide-y">
              {notes.map((note) => (
                <li key={note.id} id={`note-${note.id}`} className="flex scroll-mt-4 gap-3 px-4 py-3.5 transition-colors target:bg-attention-soft/50">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    {note.byName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <b>{note.byName}</b>
                      <time dateTime={note.at} className="text-muted-foreground">
                        {date.format(new Date(note.at))}
                      </time>
                      {note.provenance.via === "message" ? <AiMarker>Added from your message</AiMarker> : null}
                      {note.pinned ? <span className="rounded-full bg-accent px-2 py-px text-xs font-semibold text-accent-foreground">Pinned</span> : null}
                      <span className="flex-1" />
                      {canEdit ? (
                        <>
                          <EditDialog title="Edit the note" action={updateNote.bind(null, note.id)}>
                            <Field label="Note" name="text" defaultValue={note.text} multiline maxLength={4000} required />
                          </EditDialog>
                          <DeleteButton action={deleteNote.bind(null, note.id)} label="Delete this note" confirm="Delete this note?" />
                        </>
                      ) : null}
                      {canEdit ? (
                        <form action={setNotePinned.bind(null, note.id, !note.pinned)}>
                          <Button type="submit" variant="ghost" size="sm" aria-label={note.pinned ? "Unpin this note" : "Pin this note"}>
                            {note.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                            {note.pinned ? "Unpin" : "Pin"}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <p className="text-sm leading-relaxed">{note.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
      <NotesSummary offeringId={offering.id} notes={all} summary={summary} canEdit={canEdit} base={base} />
    </div>
  );
}

const SECTION_TITLE = { sells: "What sells", loses: "What loses deals", watch: "What to watch" } as const;

/**
 * FR-OFR-8: an AI summary written only from this offering's notes. Each line
 * links to the notes it rests on; code dropped any line that had none.
 */
function NotesSummary({ offeringId, notes, summary, canEdit, base }: { offeringId: string; notes: Note[]; summary: NoteSummary | null; canEdit: boolean; base: string }) {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
  const current = summary ? summaryIsCurrent(summary, notes) : false;

  if (!summary) {
    return (
      <SectionCard title="Summary" id="summary" marker={<AiMarker>Written from these notes only</AiMarker>}>
        <div className="flex flex-col gap-3 px-4 py-4 text-sm text-muted-foreground">
          <p>What sells, what loses deals and what to watch, written only from these notes. Every line links to the notes behind it.</p>
          {canEdit && notes.length > 0 ? <SummaryButton offeringId={offeringId} label="Write a summary" /> : null}
          {notes.length === 0 ? <p>Add a note first.</p> : null}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Summary" id="summary" marker={<AiMarker>Written from these notes only</AiMarker>}>
      <div className="flex flex-col gap-4 px-4 py-4 text-sm">
        {summary.lines.length === 0 ? <p className="text-muted-foreground">The notes didn&apos;t support any summary lines yet.</p> : null}
        {(["sells", "loses", "watch"] as const).map((section) => {
          const lines = summary.lines.filter((line) => line.section === section);
          return lines.length ? (
            <section key={section} className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">{SECTION_TITLE[section]}</h3>
              <ul className="flex flex-col gap-2">
                {lines.map((line, index) => (
                  <li key={index} className="flex flex-col gap-1">
                    <span>{line.text}</span>
                    <span className="flex flex-wrap gap-1">
                      {line.noteIds.map((id) => {
                        const note = byId.get(id);
                        return note ? (
                          <Link key={id} href={`${base}#note-${id}`} className="rounded-md border bg-card px-1.5 py-px text-xs text-link no-underline hover:bg-muted">
                            {note.byName}, {day.format(new Date(note.at))}
                          </Link>
                        ) : (
                          <span key={id} className="rounded-md border px-1.5 py-px text-xs text-muted-foreground">
                            A note since removed
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })}
        <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>
            From {summary.noteIds.length} {summary.noteIds.length === 1 ? "note" : "notes"} on {when.format(new Date(summary.generatedAt))}, asked for by {summary.requestedBy}.
            {summary.dropped ? ` ${summary.dropped} ${summary.dropped === 1 ? "line was" : "lines were"} dropped: no note supported ${summary.dropped === 1 ? "it" : "them"}.` : ""}
          </span>
          {current ? null : <span className="font-semibold text-attention">Out of date: the notes changed since.</span>}
          {canEdit && !current && notes.length > 0 ? <SummaryButton offeringId={offeringId} label="Write it again" /> : null}
        </div>
      </div>
    </SectionCard>
  );
}
