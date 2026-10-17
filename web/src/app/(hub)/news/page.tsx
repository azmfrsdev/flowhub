import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { EmptyRow, EmptyState, TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { EDITION_DAY } from "@/lib/news/scout";
import { malaysiaDay } from "@/lib/offerings/view";
import { NewsEdition, type NewsStory, type NewsTrigger, type WebSource } from "@/lib/schema";
import { cn } from "cn";
import { db } from "@/server/firebase/admin";
import { getWorkspaceGraph } from "@/server/graph/read";
import { getHubContext } from "@/server/workspace/access";
import { OpenDealButton, ScanButton } from "./paper-buttons";

export const metadata: Metadata = { title: "Today's paper" };

const TRIGGER: Record<NewsTrigger, string> = {
  expansion: "Expansion",
  funding: "Funding",
  new_leader: "New leader",
  tender: "Tender",
  regulation: "New rules",
  digital_project: "Tech project",
  results: "Results",
  partnership: "Partnership",
  other: "In the news",
};
const LABEL: Record<NewsStory["label"], string> = { hot: "Hot lead", worth_a_look: "Worth a look", long_shot: "Long shot" };
const LABEL_TONE: Record<NewsStory["label"], string> = { hot: "bg-score-go-soft text-score-go", worth_a_look: "bg-score-consider-soft text-score-consider", long_shot: "bg-muted text-muted-foreground" };
const COLUMNS = [0, 1, 2] as const;
const age = (months: number | null) => (months === null ? "Undated" : months === 0 ? "This month" : months === 1 ? "Last month" : `${months} months ago`);
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/** Editions are keyed by Malaysia day; noon UTC keeps the date the same in any formatter. */
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const longDate = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(asDate(day));
const dayOfYear = (day: string) => Math.round((asDate(day).getTime() - Date.UTC(Number(day.slice(0, 4)), 0, 0)) / 86_400_000);
function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === new Date(asDate(today).getTime() - 86_400_000).toISOString().slice(0, 10)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(asDate(day));
}

/** PRD 7.21: the news scout's leads, laid out as a newspaper, with the last week's editions. */
export default function NewsPage({ searchParams }: PageProps<"/news">) {
  return (
    <Suspense fallback={<TabFallback label="Fetching the paper" />}>
      <Paper searchParams={searchParams} />
    </Suspense>
  );
}

async function Paper({ searchParams }: { searchParams: PageProps<"/news">["searchParams"] }) {
  const { day: raw } = await searchParams;
  const requested = typeof raw === "string" && EDITION_DAY.test(raw) ? raw : null;
  const { workspace, role } = await getHubContext();
  const base = db().collection("workspaces").doc(workspace.id);
  // printedAt has Firestore's automatic index; ordering by document ID would need a composite one.
  const [listSnap, graph] = await Promise.all([base.collection("editions").orderBy("printedAt", "desc").limit(10).select("printedAt").get(), getWorkspaceGraph()]);
  const days = listSnap.docs.map((doc) => doc.id).filter((id) => EDITION_DAY.test(id)).slice(0, 7);
  const today = malaysiaDay();
  const canScan = role !== "viewer";
  const scanLabel = days[0] === today ? "Rescan the news" : "Scan today's news";
  const chosen = requested ?? days[0] ?? null;

  const snap = chosen ? await base.collection("editions").doc(chosen).get() : null;
  const parsed = snap?.exists ? NewsEdition.safeParse(snap.data()) : null;
  const edition = parsed?.success ? parsed.data : null;

  if (!edition || !chosen) {
    return (
      <>
        <h1 className="text-3xl">Today&apos;s paper</h1>
        {requested && days.length ? (
          <EmptyState
            title={`No paper for ${longDate(requested)}`}
            action={
              <Button asChild variant="outline">
                <Link href="/news">Read the latest paper</Link>
              </Button>
            }
          >
            The scout only scans the news on days someone asks it to.
          </EmptyState>
        ) : (
          <EmptyState title="No paper yet" action={canScan ? <ScanButton label="Scan today's news" /> : null}>
            FlowHub reads recent business news about your market and lays out the companies that could need what you sell. Every line has its source.
          </EmptyState>
        )}
      </>
    );
  }

  const names = new Map(graph.offerings.map((offering) => [offering.id, offering.name]));
  const [lead, ...rest] = edition.stories;

  return (
    <article aria-labelledby="masthead" className="overflow-hidden rounded-xl border-2 border-ink bg-card shadow-comic">
      <header className="flex flex-col items-center gap-2 border-b-4 border-double border-ink px-5 pt-4 pb-4 text-center">
        <div className="flex w-full flex-wrap justify-between gap-x-4 gap-y-1 border-b border-ink/30 pb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          <span>Vol. 1 · No. {dayOfYear(chosen)}</span>
          <span>{longDate(chosen)}</span>
          <span>Price: one AI run</span>
        </div>
        <h1 id="masthead" className="pt-2 pb-1 text-4xl leading-[1.35] sm:text-6xl">
          The {workspace.name} Daily
        </h1>
        <p className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          Leads from recent business news. Every line has its source.
          {chosen !== today ? <span className="-rotate-3 rounded border-2 border-destructive px-2 text-xs font-bold tracking-[0.12em] text-destructive uppercase">Back issue</span> : null}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-ink px-5 py-2.5 text-xs">
        <AiMarker>Read by the news scout</AiMarker>
        <span className="text-muted-foreground">
          Scanned at {time(edition.printedAt)} by {edition.printedBy}
        </span>
        <span className="flex-1" />
        {canScan ? <ScanButton label={scanLabel} variant="outline" /> : null}
      </div>

      {days.length > 1 ? (
        <nav aria-label="Editions" className="flex flex-wrap items-center gap-1.5 border-b-2 border-ink bg-subtle px-5 py-2 text-xs">
          <span className="mr-1 font-bold tracking-[0.12em] text-muted-foreground uppercase">Editions</span>
          {days.map((day) => (
            <Link
              key={day}
              href={day === days[0] ? "/news" : `/news?day=${day}`}
              aria-current={day === chosen ? "page" : undefined}
              className={cn("rounded-full border bg-card px-2.5 py-0.5 text-foreground no-underline hover:border-ink", day === chosen && "border-ink bg-primary font-semibold text-primary-foreground shadow-comic-sm")}
            >
              {dayLabel(day, today)}
            </Link>
          ))}
        </nav>
      ) : null}

      {lead ? (
        <>
          <div className="grid border-b-2 border-ink lg:grid-cols-3">
            <div className="p-5 lg:col-span-2 lg:border-r lg:border-ink/25">
              <Story story={lead} lead day={chosen} sources={edition.sources} names={names} canOpen={canScan} />
            </div>
            <aside className="border-t border-ink/25 p-5 lg:border-t-0">
              <InNumbers edition={edition} />
            </aside>
          </div>
          {rest.length ? (
            // Newspaper columns, filled left to right: story 1 goes in the first column, 2 in the second, 3 in the
            // third, 4 back in the first, so any short column is on the right. On narrow screens the columns
            // dissolve (display: contents) and `order` puts the stories back in score order.
            <div className="flex flex-col lg:grid lg:grid-cols-3">
              {COLUMNS.map((column) => (
                <div key={column} className={cn("contents lg:flex lg:flex-col", column > 0 && "lg:border-l lg:border-ink/20")}>
                  {rest.map((story, index) =>
                    index % COLUMNS.length === column ? (
                      <div key={story.id} style={{ order: index }} className="border-b border-ink/15 p-5">
                        <Story story={story} day={chosen} sources={edition.sources} names={names} canOpen={canScan} />
                      </div>
                    ) : null,
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EmptyRow>No leads in this edition. Scan again later, or add offerings and selling rules so the scout knows what to look for.</EmptyRow>
          </div>
          <aside className="border-t border-ink/25 p-5 lg:border-t-0 lg:border-l">
            <InNumbers edition={edition} />
          </aside>
        </div>
      )}

      {edition.searchSuggestions.length ? (
        <footer className="flex flex-col gap-1 border-t-2 border-ink bg-subtle px-5 py-3 text-xs text-muted-foreground">
          <span>Google Search suggestions, as Google provides them</span>
          {edition.searchSuggestions.map((html, index) => (
            <iframe key={index} title={`Google Search suggestions ${index + 1}`} srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-14 w-full border-0" />
          ))}
        </footer>
      ) : null}
    </article>
  );
}

/** FR-NEWS-2, FR-NEWS-4, FR-NEWS-5: what the scout read, kept and left out, all counted by code. */
function InNumbers({ edition }: { edition: NewsEdition }) {
  const hot = edition.stories.filter((story) => story.label === "hot").length;
  const most = Math.max(1, ...edition.beats.map((beat) => beat.claims));
  const left = edition.left;
  const leftOut = [
    left.unsourced ? `${left.unsourced} ${left.unsourced === 1 ? "sentence" : "sentences"} with no source` : null,
    left.known.length ? `Already your deals: ${left.known.join(", ")}` : null,
    ...left.rules.map((item) => `${item.company}: ${item.reason.replace(/\.$/, "")}`),
    left.unmatched ? `${left.unmatched} ${left.unmatched === 1 ? "story" : "stories"} that fit none of your offerings` : null,
  ].filter((line): line is string => Boolean(line));
  return (
    <section aria-labelledby="numbers" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="numbers" className="text-xl">
          This paper in numbers
        </h2>
        <CalcMarker>Counted by code</CalcMarker>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { value: edition.stories.length, label: edition.stories.length === 1 ? "lead" : "leads" },
          { value: hot, label: "hot" },
          { value: Object.keys(edition.sources).length, label: "sources" },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse rounded-lg border-2 border-ink bg-accent/50 py-2">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="fh-hand text-3xl leading-none">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-base">What the scout read</h3>
        <ul className="flex flex-col gap-1.5 text-xs">
          {edition.beats.map((beat) => (
            <li key={beat.key} className="flex flex-col gap-0.5">
              <span className="flex justify-between gap-2">
                <span>{beat.title}</span>
                <span className="text-muted-foreground">
                  {beat.claims} sourced {beat.claims === 1 ? "fact" : "facts"}
                </span>
              </span>
              <span aria-hidden="true" className="h-1.5 rounded-full bg-muted">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round((beat.claims / most) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base">Left out</h3>
        {leftOut.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
            {leftOut.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing. Every story rests on sourced facts and fits your selling rules.</p>
        )}
      </div>
    </section>
  );
}

function Story({ story, lead = false, day, sources, names, canOpen }: { story: NewsStory; lead?: boolean; day: string; sources: Record<string, WebSource>; names: Map<string, string>; canOpen: boolean }) {
  return (
    <section aria-labelledby={story.id} className="relative flex flex-col gap-2.5">
      <Grade score={story.score} />
      <p className="pr-16 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        <span className="text-foreground">{TRIGGER[story.trigger]}</span> · {story.company}
        {story.country ? `, ${story.country}` : ""} · {age(story.ageMonths)}
      </p>
      <h2 id={story.id} className={cn("pr-16 leading-tight", lead ? "text-2xl sm:text-4xl" : "text-xl")}>
        {story.headline}
      </h2>
      <div className={cn("flex flex-col gap-1.5 leading-relaxed", lead ? "text-base" : "text-sm")}>
        {story.claims.map((claim) => (
          <p key={claim.id}>
            {claim.text}{" "}
            {claim.sourceIds.map((id) =>
              sources[id] ? (
                <a key={id} href={sources[id].groundingUri} target="_blank" rel="noreferrer" title={sources[id].title} className="mr-1 inline-flex rounded border px-1 align-baseline text-[11px] text-muted-foreground no-underline hover:border-ink hover:text-foreground">
                  {sources[id].domain}
                </a>
              ) : null,
            )}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border-2 border-dashed border-ink/30 bg-accent/40 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <AiMarker>Why it&apos;s a lead</AiMarker>
          {story.offeringIds.map((id) => (
            <Link key={id} href={`/offerings/${id}`} className="rounded-full border bg-card px-2 py-px text-xs no-underline hover:border-ink">
              {names.get(id) ?? "Offering"}
            </Link>
          ))}
        </div>
        <p>{story.why}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-px text-xs font-bold", LABEL_TONE[story.label])}>{LABEL[story.label]}</span>
        <CalcMarker>Scored by code</CalcMarker>
        <span className="flex-1" />
        {story.opportunityId ? (
          <Link href={`/opportunities/${story.opportunityId}`} className="text-sm font-semibold text-link hover:underline">
            Deal opened →
          </Link>
        ) : canOpen ? (
          <OpenDealButton day={day} storyId={story.id} company={story.company} />
        ) : null}
      </div>
    </section>
  );
}

/** FR-NEWS-5: the lead score, circled in red ink in the story's corner like a teacher's mark. Calculated by code. */
function Grade({ score }: { score: number }) {
  return (
    <span title={`Lead score ${score} out of 100, calculated by code`} className="pointer-events-none absolute -top-2 right-0 -rotate-6 select-none">
      <span aria-hidden="true" className="flex size-14 flex-col items-center justify-center rounded-[52%_46%_55%_48%] border-[2.5px] border-destructive text-destructive">
        <span className="fh-hand text-2xl leading-none">{score}</span>
        <span className="fh-hand -mt-0.5 text-[10px] leading-none">/100</span>
      </span>
      <span className="sr-only">Lead score {score} out of 100, calculated by code</span>
    </span>
  );
}
