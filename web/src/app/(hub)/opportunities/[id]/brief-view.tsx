"use client";

import { ExternalLink } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { AiMarker, PersonMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { briefHtml, keptBrief } from "@/lib/deal-room/claims";
import { htmlToText } from "@/lib/deal-room/draft";
import type { BriefOutput, Claim, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { type GateResult, addSellerNote, approveBrief, setClaimRemoved } from "./actions";
import { Approved, Card, ColumnHeading, GateBar, RowRemove, useGate } from "./gate-parts";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The date a news claim is about, for the timeline: "Feb 2026", or the year alone. */
function claimDate(text: string): { label: string; time: number } | null {
  const dated = text.match(new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "i"));
  if (dated) {
    const month = MONTHS.indexOf(dated[1].toLowerCase());
    return { label: `${dated[1].slice(0, 1).toUpperCase()}${dated[1].slice(1, 3).toLowerCase()} ${dated[2]}`, time: new Date(Number(dated[2]), month, 1).getTime() };
  }
  const year = text.match(/\b(?:19|20)\d{2}\b/);
  return year ? { label: year[0], time: new Date(Number(year[0]), 0, 1).getTime() } : null;
}

/** FR-RES-4: anything more than 18 months old is flagged. */
function isOld(time: number, now = new Date()) {
  return time < new Date(now.getFullYear(), now.getMonth() - 18, 1).getTime();
}

/** Gate B (FR-RES-1 to FR-RES-6), layout C: what we found, then what it means. */
export function BriefView({ opp, run, working, editable }: { opp: Opportunity; run: Run; working: BriefOutput; editable: boolean }) {
  const approve = useGate(() => approveBrief(opp.id, run.id, run.rev));
  const [noteState, noteAction] = useActionState<GateResult, FormData>(addSellerNote.bind(null, opp.id, run.id, run.rev), {});
  const [lit, setLit] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // FR-RES-7: the brief as formatted text, with its numbered sources.
  async function copyBrief() {
    const html = briefHtml(opp.prospect?.name ?? "the prospect", working);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([htmlToText(html)], { type: "text/plain" }) })]);
      setCopied("Copied, with its sources.");
    } catch {
      setCopied("Your browser blocked copying. Try again.");
    }
  }

  // Facts are numbered #1, #2 … in reading order; sources [1], [2] … by first citation.
  const { factNumber, sourceNumber, orderedSources } = useMemo(() => {
    const factNumber = new Map(working.claims.map((claim, index) => [claim.id, index + 1]));
    const sourceNumber = new Map<string, number>();
    for (const claim of working.claims) for (const id of claim.sourceIds) if (working.sources[id] && !sourceNumber.has(id)) sourceNumber.set(id, sourceNumber.size + 1);
    for (const id of Object.keys(working.sources)) if (!sourceNumber.has(id)) sourceNumber.set(id, sourceNumber.size + 1);
    const orderedSources = [...sourceNumber.entries()].sort((a, b) => a[1] - b[1]).map(([id, n]) => ({ n, source: working.sources[id] }));
    return { factNumber, sourceNumber, orderedSources };
  }, [working]);

  // FR-RES-3: an inference whose facts were all removed is dropped, and counted.
  const { claims: kept, inferences, droppedInferences } = keptBrief(working);
  const of = (section: Claim["section"]) => working.claims.filter((claim) => claim.section === section);
  const needs = inferences.filter((item) => item.section === "needs");
  const sector = inferences.filter((item) => item.section === "sector");
  const news = of("news")
    .map((claim) => ({ claim, date: claimDate(claim.text) }))
    .sort((a, b) => (b.date?.time ?? 0) - (a.date?.time ?? 0));

  const Cite = ({ claim }: { claim: Claim }) => (
    <>
      {[...new Set(claim.sourceIds)].map((id) => {
        const source = working.sources[id];
        return source ? (
          <a key={id} href={source.groundingUri} target="_blank" rel="noopener noreferrer" title={`${source.domain}: ${source.title}`} className="ml-0.5 align-super text-[10.5px] font-bold text-primary no-underline hover:underline">
            [{sourceNumber.get(id)}]<span className="sr-only"> (source: {source.domain}, opens in a new tab)</span>
          </a>
        ) : null;
      })}
    </>
  );

  const Fact = ({ claim, children }: { claim: Claim; children?: React.ReactNode }) => (
    <li className={cn("group flex items-start gap-2 rounded-md px-1 py-0.5 text-sm transition-colors", lit.includes(claim.id) && "bg-attention-soft", claim.removed && "text-muted-foreground line-through")}>
      <span className="min-w-5 pt-0.5 font-mono text-[11px] font-semibold text-muted-foreground">{factNumber.get(claim.id)}</span>
      <span className="min-w-0 flex-1">
        {children}
        {claim.text}
        <Cite claim={claim} />
      </span>
      {editable ? (
        <span className={cn("opacity-60 group-hover:opacity-100 focus-within:opacity-100", claim.removed && "opacity-100")}>
          <RowRemove action={() => setClaimRemoved(opp.id, run.id, run.rev, claim.id, !claim.removed)} label={claim.removed ? `Restore fact ${factNumber.get(claim.id)}` : `Remove fact ${factNumber.get(claim.id)}`} restore={claim.removed} />
        </span>
      ) : null}
    </li>
  );

  const Inference = ({ text, basedOn, title }: { text: string; basedOn: string[]; title?: boolean }) => (
    <div
      onMouseEnter={() => setLit(basedOn)}
      onMouseLeave={() => setLit([])}
      onFocus={() => setLit(basedOn)}
      onBlur={() => setLit([])}
      tabIndex={0}
      className="flex flex-col gap-1.5 rounded-lg border border-ai/25 bg-ai-soft/40 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ai/40"
    >
      <span className={cn("text-sm", title && "font-semibold")}>{text}</span>
      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        Based on
        {basedOn.map((id) => (
          <span key={id} className="rounded border bg-card px-1.5 font-mono text-[11px]">
            {factNumber.has(id) ? `#${factNumber.get(id)}` : id}
          </span>
        ))}
      </span>
    </div>
  );

  const stats = [
    { value: kept.length, label: "sourced facts" },
    { value: orderedSources.length, label: orderedSources.length === 1 ? "source" : "sources" },
    { value: working.droppedCount, label: "dropped, no source" },
    { value: needs.length, label: needs.length === 1 ? "need inferred" : "needs inferred" },
  ];
  const jumps = [
    { id: "b-snapshot", label: "Snapshot", count: of("snapshot").length },
    { id: "b-news", label: "News", count: of("news").length },
    { id: "b-signals", label: "Hiring", count: of("hiring").length },
    { id: "b-signals", label: "Tech", count: working.detectedTech.length },
    { id: "b-needs", label: "Needs", count: needs.length },
    { id: "b-questions", label: "Questions", count: working.questions.length },
  ];

  return (
    <>
      <section className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card px-4 py-3">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-28 rounded-lg bg-muted/60 px-3 py-2">
            <b className="block text-xl leading-tight tabular-nums">{stat.value}</b>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={copyBrief}>
          Copy brief
        </Button>
        {copied ? (
          <span role="status" className="text-xs text-muted-foreground">
            {copied}
          </span>
        ) : null}
        <nav aria-label="Jump to a section" className="ml-auto flex flex-wrap gap-1.5">
          {jumps.map((jump) => (
            <a key={jump.label} href={`#${jump.id}`} className={cn("rounded-full border bg-card px-2.5 py-0.5 text-[12.5px] no-underline hover:border-primary/40", jump.count === 0 ? "text-muted-foreground" : "text-foreground")}>
              {jump.label} {jump.count}
            </a>
          ))}
        </nav>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ColumnHeading>
            What we found <AiMarker className="normal-case tracking-normal">Researcher · every line sourced</AiMarker>
          </ColumnHeading>
          <Card title="Snapshot" id="b-snapshot">
            {of("snapshot").length ? <ul className="flex flex-col gap-1 px-3 py-3">{of("snapshot").map((claim) => <Fact key={claim.id} claim={claim} />)}</ul> : <p className="px-4 py-3 text-sm text-muted-foreground">Nothing found.</p>}
          </Card>
          <Card title="Recent news and events" id="b-news">
            {news.length ? (
              <ol className="flex flex-col px-3 py-3">
                {news.map(({ claim, date }) => (
                  <Fact key={claim.id} claim={claim}>
                    <span className="mr-2 inline-flex items-center gap-1.5 align-baseline">
                      <span className="rounded bg-muted px-1.5 font-mono text-[11px] font-semibold text-muted-foreground no-underline">{date?.label ?? "Undated"}</span>
                      {date && isOld(date.time) ? <span className="rounded-full bg-muted px-2 text-[11px] font-semibold text-muted-foreground">Old</span> : null}
                    </span>
                  </Fact>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">Nothing found.</p>
            )}
          </Card>
          <Card title="Hiring and technology" id="b-signals">
            <div className="flex flex-col gap-3 px-3 py-3">
              {of("hiring").length ? <ul className="flex flex-col gap-1">{of("hiring").map((claim) => <Fact key={claim.id} claim={claim} />)}</ul> : <p className="px-1 text-sm text-muted-foreground">Hiring: nothing found.</p>}
              <div className="flex flex-wrap items-center gap-1.5 px-1">
                <span className="text-sm font-semibold">Technology</span>
                {working.detectedTech.length === 0 ? <span className="text-sm text-muted-foreground">nothing detected on their site</span> : null}
                {working.detectedTech.map((tech) => (
                  <span key={tech.value} className={cn("rounded-full px-2.5 py-px text-xs", tech.matchesSeller ? "bg-fit-strong-soft font-semibold text-fit-strong" : "bg-muted")}>
                    {tech.label}
                    {tech.matchesSeller ? " · you work with this" : ""}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ColumnHeading>
            What it means <AiMarker className="normal-case tracking-normal">Inference · built only from kept facts</AiMarker>
          </ColumnHeading>
          <Card title="Likely needs" id="b-needs">
            <div className="flex flex-col gap-2.5 px-3 py-3">
              {needs.length ? needs.map((item) => <Inference key={item.id} text={item.text} basedOn={item.basedOn} title />) : <p className="px-1 text-sm text-muted-foreground">Nothing inferred.</p>}
            </div>
          </Card>
          <Card title="Sector pressures">
            <div className="flex flex-col gap-2.5 px-3 py-3">
              {sector.length ? sector.map((item) => <Inference key={item.id} text={item.text} basedOn={item.basedOn} />) : <p className="px-1 text-sm text-muted-foreground">Nothing found.</p>}
            </div>
          </Card>
          {droppedInferences ? (
            <p className="px-1 text-xs text-muted-foreground">
              {droppedInferences} {droppedInferences === 1 ? "inference" : "inferences"} dropped: every fact behind {droppedInferences === 1 ? "it was" : "them was"} removed.
            </p>
          ) : null}
          <Card title="Questions to ask" id="b-questions">
            {working.questions.length ? (
              <ol className="flex list-decimal flex-col gap-1.5 py-3 pr-4 pl-9 text-sm">
                {working.questions.map((question) => (
                  <li key={question.id}>{question.text}</li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">Nothing found.</p>
            )}
          </Card>
          <Card title="Seller notes" marker={<span className="text-xs text-muted-foreground">your own word, not a sourced fact</span>}>
            <div className="flex flex-col gap-2 px-4 py-3 text-sm">
              {working.sellerNotes.length === 0 && !editable ? <p className="text-muted-foreground">No notes.</p> : null}
              {working.sellerNotes.map((note) => (
                <p key={note.id} className="flex flex-wrap items-center gap-2">
                  <PersonMarker name={note.by} />
                  {note.text}
                </p>
              ))}
              {editable ? (
                <form action={noteAction} className="flex flex-wrap gap-2">
                  <label htmlFor="seller-note" className="sr-only">
                    Add a seller note
                  </label>
                  <Input id="seller-note" name="text" maxLength={1000} placeholder="They told us sale-day traffic triples." className="min-w-48 flex-1" />
                  <PendingButton size="sm" variant="outline" pendingLabel="Adding…">
                    Add note
                  </PendingButton>
                  {noteState.error ? <span className="w-full text-xs text-destructive">{noteState.error}</span> : null}
                </form>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Sources" marker={<span className="text-xs text-muted-foreground">links exactly as Google Search returned them</span>}>
        <ol className="flex flex-col px-4 py-2 text-sm">
          {orderedSources.map(({ n, source }) => (
            <li key={source.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 border-b border-dashed border-line-soft py-1.5 last:border-b-0">
              <b className="font-mono text-xs">[{n}]</b>
              <span className="min-w-0 truncate">
                {source.domain}
                {source.title && source.title !== source.domain ? <span className="text-muted-foreground"> · {source.title}</span> : null}
              </span>
              <a href={source.groundingUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-px text-xs text-primary no-underline hover:bg-muted">
                Open <ExternalLink aria-hidden="true" className="size-3" />
                <span className="sr-only">{source.domain} in a new tab</span>
              </a>
            </li>
          ))}
        </ol>
        {working.searchSuggestions.length > 0 ? (
          <div className="flex flex-col gap-1 border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">Google Search suggestions, as Google provides them</span>
            {working.searchSuggestions.map((html, index) => (
              <iframe key={index} title={`Google Search suggestions ${index + 1}`} srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-16 w-full border-0" />
            ))}
          </div>
        ) : null}
      </Card>

      {editable ? (
        <GateBar
          label="Gate B"
          hint={
            kept.length
              ? "Remove anything wrong (×) or add a seller note. Fit runs only on what you keep."
              : "No sourced facts to keep. Fit will run on what came in and any seller notes you add."
          }
        >
          {approve.error ? <span className="text-sm text-destructive">{approve.error}</span> : null}
          <Button type="button" onClick={approve.run} disabled={approve.pending}>
            {approve.pending ? "Starting fit…" : "Continue to fit"}
          </Button>
        </GateBar>
      ) : (
        <Approved run={run} gate="Gate B" />
      )}
    </>
  );
}
