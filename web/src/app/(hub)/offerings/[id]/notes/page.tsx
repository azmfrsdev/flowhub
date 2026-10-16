import { Pin, PinOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { loadOffering } from "@/server/graph/offering";
import { addNote, setNotePinned } from "./actions";
import { NoteForm } from "./note-form";

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
  const { offering, graph, role } = await loadOffering(id);
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
          <section className="rounded-xl border bg-card">
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
                <li key={note.id} className="flex gap-3 px-4 py-3.5">
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
      <SectionCard title="Summary" id="summary" marker={<AiMarker>Written from these notes only</AiMarker>}>
        <EmptyRow>
          A short summary of what sells, what loses and what to watch, with every line linked to its note. Switched on with Ask or tell.
        </EmptyRow>
      </SectionCard>
    </div>
  );
}
