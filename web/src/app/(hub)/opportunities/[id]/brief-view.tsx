"use client";

import { ArrowRight, ChevronDown, ChevronRight, Copy, ExternalLink, FileText, Info, Link2, MessageCircleQuestion, NotebookPen, Settings2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { inferenceTitle, shortLine } from "@/lib/deal-room/brief-figures";
import { briefHtml, keptBrief } from "@/lib/deal-room/claims";
import { htmlToText } from "@/lib/deal-room/draft";
import type { BriefOutput, Claim, NewsEventType, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { type GateResult, addSellerNote, approveBrief, setClaimRemoved } from "./actions";
import { Approved, ColumnHeading, GateSlot, RowRemove, useGate } from "./gate-parts";
import { Box, BoxTag, SideDrawer } from "./stage-box";
import { DOC_STYLES } from "./write-view";
import { GoogleLogo } from "@/components/flowhub/google-logo";

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

/** FR-RES-8: the timeline tag for each kind of news. The tag is in words, so it never rests on colour. */
const EVENT: Record<NewsEventType, { label: string; tone: string }> = {
  funding: { label: "Funding", tone: "bg-fit-strong-soft text-fit-strong" },
  expansion: { label: "Expansion", tone: "bg-claim-research-soft text-claim-research" },
  results: { label: "Results", tone: "bg-score-consider-soft text-score-consider" },
  leadership: { label: "Leadership", tone: "bg-private-soft text-private" },
  launch: { label: "Launch", tone: "bg-ai-soft text-ai" },
  partnership: { label: "Partnership", tone: "bg-claim-offering-soft text-claim-offering" },
  problem: { label: "Problem", tone: "bg-fit-cannot-soft text-fit-cannot" },
};

/** Snapshot always opens with these two (FR-RES-8); Headquarters goes to the Location box (FR-RES-9). */
const LEADS = ["Sector", "What they do"] as const;
/** A Headquarters label, as the model may word it: "Headquarters", "Headquarters location", "Head office", "HQ". */
const HQ = /headquarter|head office|hq/i;
/** How many lines each fixed-size box shows; the rest are one click away in its drawer. */
const SNAPSHOT_ROWS = 9;
const NEWS_ROWS = 6;
const INFERENCE_ROWS = 3;
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
const MAPS_KEY = process.env.NEXT_PUBLIC_MAPS_EMBED_KEY ?? "";

type Drawer = "snapshot" | "news" | "inferences" | "notes" | "questions" | "sources" | "made";
const DRAWER_TITLE: Record<Drawer, string> = { snapshot: "Snapshot", news: "News & events", inferences: "Market pressures and likely needs", notes: "Your notes", questions: "Questions to ask", sources: "Sources", made: "How this was made" };

/** Inferences are Gemini's reasoning; Snapshot and News lines are its checked summaries (ADR-0024). */
const InferenceMark = () => (
  <BoxTag kind="ai" title="Inference: Gemini's reasoning from the sourced facts, not a fact itself">
    Inference
  </BoxTag>
);
const SummaryMark = () => (
  <BoxTag kind="ai" title="Each line is Gemini's summary of a sourced sentence. Code checked every number and name in it against that sentence. Click a line to read the sentence.">
    Summaries
  </BoxTag>
);

/**
 * Gate B (FR-RES-1 to FR-RES-9). Five boxes of a fixed size land side by side:
 * Snapshot, Location, Market pressures, Likely needs, and News & events. Each
 * line is short; a click shows the whole sourced sentence. Notes, questions,
 * sources and how it was made open in a side drawer from the buttons beneath.
 */
export function BriefView({ opp, run, working, editable, made }: { opp: Opportunity; run: Run; working: BriefOutput; editable: boolean; made?: React.ReactNode }) {
  const approve = useGate(() => approveBrief(opp.id, run.id, run.rev));
  const [noteState, noteAction] = useActionState<GateResult, FormData>(addSellerNote.bind(null, opp.id, run.id, run.rev), {});
  // One line open at a time: a fact, a news item or an inference. An open inference lights up the facts it rests on.
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  // FR-RES-7: the brief as formatted text, with its numbered sources. The person sees exactly this before copying it.
  const html = useMemo(() => briefHtml(opp.prospect?.name ?? "the prospect", working), [opp.prospect?.name, working]);

  // A click outside an open line closes it.
  useEffect(() => {
    if (!openId) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-brief-line]")) setOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openId]);

  const openDrawer = (kind: Drawer) => {
    setOpenId(null);
    setDrawer(kind);
    dialog.current?.showModal();
  };

  async function copyBrief() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([htmlToText(html)], { type: "text/plain" }) })]);
      setCopied("Copied, with its sources.");
    } catch {
      setCopied("Your browser blocked copying. Try again.");
    }
  }

  // Sources are numbered [1], [2] … by first citation.
  const { sourceNumber, orderedSources } = useMemo(() => {
    const sourceNumber = new Map<string, number>();
    for (const claim of working.claims) for (const id of claim.sourceIds) if (working.sources[id] && !sourceNumber.has(id)) sourceNumber.set(id, sourceNumber.size + 1);
    for (const id of Object.keys(working.sources)) if (!sourceNumber.has(id)) sourceNumber.set(id, sourceNumber.size + 1);
    const orderedSources = [...sourceNumber.entries()].sort((a, b) => a[1] - b[1]).map(([id, n]) => ({ n, source: working.sources[id] }));
    return { sourceNumber, orderedSources };
  }, [working]);

  // FR-RES-3: an inference whose facts were all removed is dropped, and counted.
  const { claims: kept, inferences, droppedInferences } = keptBrief(working);
  const of = (section: Claim["section"]) => working.claims.filter((claim) => claim.section === section);
  const needs = inferences.filter((item) => item.section === "needs");
  const pressures = inferences.filter((item) => item.section === "sector");
  const news = of("news")
    .map((claim) => ({ claim, date: claimDate(claim.text) }))
    .sort((a, b) => (b.date?.time ?? 0) - (a.date?.time ?? 0));
  const latestId = news.find(({ claim, date }) => date && !claim.removed)?.claim.id;
  const labelled = working.claims.some((claim) => claim.label);
  const isLabel = (claim: Claim, label: string) => claim.label?.toLowerCase() === label.toLowerCase();
  const hq = of("snapshot").find((claim) => claim.label && HQ.test(claim.label)) ?? null;
  // Snapshot: Sector and What they do first, then the rest as found, then the hiring facts. Headquarters is in Location.
  const snapshot = of("snapshot").filter((claim) => claim.id !== hq?.id);
  const leads = labelled ? LEADS.map((label) => ({ label, claim: snapshot.find((claim) => isLabel(claim, label)) ?? null })) : [];
  const rows: { key: string; label: string | null; claim: Claim | null }[] = [
    ...leads.map(({ label, claim }) => ({ key: claim?.id ?? label, label, claim })),
    ...snapshot.filter((claim) => !leads.some((lead) => lead.claim?.id === claim.id)).map((claim) => ({ key: claim.id, label: claim.label ?? null, claim })),
    ...of("hiring").map((claim) => ({ key: claim.id, label: claim.label ?? "Hiring", claim })),
  ];
  // A full box shows every row; past that, one row gives way to the "and N more" line.
  const snapshotShown = rows.length > SNAPSHOT_ROWS ? SNAPSHOT_ROWS - 1 : SNAPSHOT_ROWS;
  const opened = inferences.find((item) => item.id === openId) ?? null;
  const lit = new Set(opened?.basedOn ?? []);
  const dateOf = new Map(news.map(({ claim, date }) => [claim.id, date]));
  // How a fact is named on an inference's "Rests on" chips: its label, a news fact's date, or its first words.
  const factName = (id: string) => {
    const claim = working.claims.find((item) => item.id === id);
    if (!claim) return id;
    if (claim.label) return claim.label;
    const date = dateOf.get(id);
    if (date) return `${date.label} news`;
    return shortLine(claim, 4);
  };

  const cite = (claim: Claim) =>
    [...new Set(claim.sourceIds)].map((id) => {
      const source = working.sources[id];
      return source ? (
        <a key={id} href={source.groundingUri} target="_blank" rel="noopener noreferrer" title={`${source.domain}: ${source.title}`} className="ml-0.5 align-super text-[10.5px] font-bold text-link no-underline hover:underline">
          [{sourceNumber.get(id)}]<span className="sr-only"> (source: {source.domain}, opens in a new tab)</span>
        </a>
      ) : null;
    });

  const remove = (claim: Claim, name: string) =>
    editable ? <RowRemove action={() => setClaimRemoved(opp.id, run.id, run.rev, claim.id, !claim.removed)} label={claim.removed ? `Restore ${name}` : `Remove ${name}`} restore={claim.removed} /> : null;

  /** The whole sourced sentence, exactly as grounding returned it (invariant 3), with its sources. */
  const sentence = (claim: Claim) => (
    <span>
      {claim.text}
      {cite(claim)}
    </span>
  );

  /** The popup under an open line: the full sentence, its sources, and Remove. */
  const factPopup = (claim: Claim, name: string) => (
    <div role="dialog" aria-label={`The sourced sentence for ${name}`} className="absolute inset-x-1 top-full z-30 mt-0.5 flex flex-col gap-2 rounded-lg border-2 border-ink bg-card p-3 text-[13px] leading-relaxed shadow-comic">
      <span className="text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase">The sourced sentence</span>
      {sentence(claim)}
      <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        {claim.short ? "Gemini wrote the short line; code checked its figures and names against this sentence." : null}
        <span className="flex-1" />
        {remove(claim, name)}
      </span>
    </div>
  );

  const factRow = ({ key, label, claim }: (typeof rows)[number]) => {
    if (!claim)
      return (
        <li key={key} className="flex h-9 items-center gap-2 border-b border-dashed border-line-soft px-2 text-sm">
          <b className="w-28 shrink-0 truncate">{label}</b>
          <span className="truncate text-muted-foreground">Not found in the sources</span>
        </li>
      );
    const open = openId === claim.id;
    const name = label ? `the ${label.toLowerCase()} fact` : "this fact";
    return (
      <li key={key} data-brief-line className="relative">
        <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : claim.id)} className={cn("flex h-9 w-full items-center gap-2 rounded-lg border-b border-dashed border-line-soft px-2 text-left text-sm transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", (lit.has(claim.id) || open) && "bg-attention-soft", claim.removed && "text-muted-foreground line-through")}>
          {label ? <b className="w-28 shrink-0 truncate">{label}</b> : null}
          <span className="min-w-0 flex-1 truncate">{shortLine(claim)}</span>
          <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
        {open ? factPopup(claim, name) : null}
      </li>
    );
  };

  const newsRow = ({ claim, date }: (typeof news)[number]) => {
    const open = openId === claim.id;
    return (
      <li key={claim.id} data-brief-line className="relative">
        <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : claim.id)} className={cn("flex h-14 w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", (lit.has(claim.id) || open) && "bg-attention-soft", claim.removed && "text-muted-foreground line-through")}>
          <span aria-hidden="true" className={cn("relative z-10 mt-0.5 size-3.5 shrink-0 rounded-full border-[2.5px] border-ink", claim.id === latestId ? "bg-primary" : "bg-card")} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase">
              {date?.label ?? "Undated"}
              {claim.eventType ? <span className={cn("rounded-full px-1.5 tracking-normal normal-case", EVENT[claim.eventType].tone)}>{EVENT[claim.eventType].label}</span> : null}
              {claim.id === latestId ? <span className="rounded-full border-[1.5px] border-ink bg-primary px-1.5 text-[9.5px] text-primary-foreground">Latest</span> : null}
              {date && isOld(date.time) ? <span className="rounded-full bg-muted px-1.5 tracking-normal normal-case">Old</span> : null}
            </span>
            <span className="truncate text-[13.5px]">{shortLine(claim)}</span>
          </span>
        </button>
        {open ? factPopup(claim, `the ${date?.label ?? "undated"} news`) : null}
      </li>
    );
  };

  const inferenceRows = (items: typeof inferences, tone: string) =>
    items.length ? (
      <ol className="flex flex-col px-2">
        {items.slice(0, INFERENCE_ROWS).map((item, index) => {
          const open = openId === item.id;
          return (
            <li key={item.id} data-brief-line className="relative">
              <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)} className={cn("flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13.5px] font-bold hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", open && "bg-subtle")}>
                <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[11px]", tone)}>
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{inferenceTitle(item)}</span>
                <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
              {open ? (
                <div role="dialog" aria-label={inferenceTitle(item)} className="absolute inset-x-1 top-full z-30 mt-0.5 flex flex-col gap-2 rounded-lg border-2 border-ink bg-card p-3 text-[13px] leading-relaxed shadow-comic">
                  <p>{item.text}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    Rests on
                    {item.basedOn.map((id) => (
                      <span key={id} className="rounded-full bg-attention-soft px-2 py-px text-foreground">
                        {factName(id)}
                      </span>
                    ))}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    ) : (
      <p className="px-4 py-2 text-sm text-muted-foreground">Nothing inferred.</p>
    );

  // FR-RES-9: the headquarters phrase, as the sourced sentence writes it, and where to see it on a map.
  const place = hq ? shortLine(hq) : null;
  const mapQuery = place ? [place, opp.prospect?.country].filter(Boolean).join(", ") : null;
  // The link searches Google Maps for the company itself in that place, so it opens on the company's own pin, not just the town.
  // Nothing is stored and no coordinates come from a model: Google Maps finds the place from its name.
  const mapsLink = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([opp.prospect?.name, mapQuery].filter(Boolean).join(", "))}` : null;

  const drawerBody = (kind: Drawer) => {
    switch (kind) {
      case "snapshot":
        return (
          <>
            <ul className="flex flex-col">
              {[...(hq ? [{ key: hq.id, label: hq.label ?? "Headquarters", claim: hq }] : []), ...rows].map(({ key, label, claim }) => (
                <li key={key} className={cn("flex items-start gap-2 border-b border-dashed border-line-soft py-2.5", claim?.removed && "text-muted-foreground line-through")}>
                  <span className="min-w-0 flex-1">
                    {label ? <b className="mr-1">{label}:</b> : null}
                    {claim ? sentence(claim) : <span className="text-muted-foreground">Not found in the sources</span>}
                  </span>
                  {claim ? remove(claim, label ? `the ${label.toLowerCase()} fact` : "this fact") : null}
                </li>
              ))}
            </ul>
            <p className="flex flex-wrap items-center gap-1.5 pt-3">
              <b className="mr-1">Tech:</b>
              {working.detectedTech.length === 0 ? <span className="text-muted-foreground">nothing detected on their site</span> : null}
              {working.detectedTech.map((tech) => (
                <span key={tech.value} className={cn("rounded-full px-2.5 py-px text-xs", tech.matchesSeller ? "bg-fit-strong-soft font-semibold text-fit-strong" : "bg-muted")}>
                  {tech.label}
                  {tech.matchesSeller ? " · you work with this" : ""}
                </span>
              ))}
            </p>
          </>
        );
      case "news":
        return (
          <ul className="flex flex-col">
            {news.map(({ claim, date }) => (
              <li key={claim.id} className={cn("flex items-start gap-2 border-b border-dashed border-line-soft py-2.5", claim.removed && "text-muted-foreground line-through")}>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                    {date?.label ?? "Undated"}
                    {claim.eventType ? <span className={cn("rounded-full px-1.5 tracking-normal normal-case", EVENT[claim.eventType].tone)}>{EVENT[claim.eventType].label}</span> : null}
                    {date && isOld(date.time) ? <span className="rounded-full bg-muted px-1.5 tracking-normal normal-case">Old</span> : null}
                  </span>
                  {sentence(claim)}
                </span>
                {remove(claim, `the ${date?.label ?? "undated"} news`)}
              </li>
            ))}
          </ul>
        );
      case "inferences":
        return (
          <>
            {[
              { title: "Market pressures", items: pressures },
              { title: "Likely needs", items: needs },
            ].map(({ title, items }) => (
              <section key={title} className="flex flex-col pb-3">
                <h3 className="pb-1 font-sans text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase [font-size-adjust:none] [-webkit-text-stroke:0]">{title}</h3>
                {items.length ? (
                  items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-1 border-b border-dashed border-line-soft py-2.5">
                      <b>{inferenceTitle(item)}</b>
                      <p>{item.text}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        Rests on
                        {item.basedOn.map((id) => (
                          <span key={id} className="rounded-full bg-attention-soft px-2 py-px text-foreground">
                            {factName(id)}
                          </span>
                        ))}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">Nothing inferred.</p>
                )}
              </section>
            ))}
          </>
        );
      case "notes":
        // FR-RES-5: seller notes, as sticky notes. They are the seller's own word, not sourced facts.
        return (
          <>
            <p className="pb-2 text-xs text-muted-foreground">Your own word, not a sourced fact. The Fit Analyst reads them.</p>
            <div className="flex flex-wrap gap-4 p-1">
              {working.sellerNotes.map((note, index) => (
                <figure key={note.id} className={cn("flex min-h-28 w-48 flex-col justify-between gap-2 p-3 text-[13.5px] leading-relaxed shadow-[2px_3px_0_rgb(0_0_0/0.18)]", index % 2 ? "rotate-1 bg-claim-research-soft" : "-rotate-1 bg-attention-soft")}>
                  <blockquote>{note.text}</blockquote>
                  <figcaption className="text-[11px] text-muted-foreground">
                    {note.by} · {DATE.format(new Date(note.at))}
                  </figcaption>
                </figure>
              ))}
              {editable ? (
                <form action={noteAction} className="flex min-h-28 w-48 flex-col gap-2 rounded border-2 border-dashed border-border p-2.5">
                  <label htmlFor="seller-note" className="text-xs font-bold text-muted-foreground">
                    Add a note
                  </label>
                  <textarea id="seller-note" name="text" maxLength={1000} rows={2} placeholder="They told us sale-day traffic triples." className="min-h-12 flex-1 resize-none rounded-md border border-input bg-card px-2 py-1 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50" />
                  <PendingButton size="sm" variant="outline" pendingLabel="Adding…">
                    Stick it on
                  </PendingButton>
                  {noteState.error ? <span className="text-xs text-destructive">{noteState.error}</span> : null}
                </form>
              ) : working.sellerNotes.length === 0 ? (
                <p className="text-muted-foreground">No notes.</p>
              ) : null}
            </div>
          </>
        );
      case "questions":
        return working.questions.length ? (
          <ol className="flex flex-col">
            {working.questions.map((question, index) => (
              <li key={question.id} className="flex gap-3 border-b border-dashed border-line-soft py-2.5">
                <b className="w-5 shrink-0 font-mono text-muted-foreground">{index + 1}</b>
                {question.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">No questions.</p>
        );
      case "sources":
        return (
          <>
            <p className="pb-2 text-xs text-muted-foreground">
              {orderedSources.length} {orderedSources.length === 1 ? "web page" : "web pages"}, links exactly as Google Search returned them
            </p>
            <ol className="flex flex-col">
              {orderedSources.map(({ n, source }) => (
                <li key={source.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 border-b border-dashed border-line-soft py-2">
                  <b className="font-mono text-xs">[{n}]</b>
                  <span className="min-w-0 truncate">
                    {source.domain}
                    {source.title && source.title !== source.domain ? <span className="text-muted-foreground"> · {source.title}</span> : null}
                  </span>
                  <a href={source.groundingUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-px text-xs text-link no-underline hover:bg-muted">
                    Open <ExternalLink aria-hidden="true" className="size-3" />
                    <span className="sr-only">{source.domain} in a new tab</span>
                  </a>
                </li>
              ))}
            </ol>
          </>
        );
      case "made":
        return made ?? <p className="text-muted-foreground">No steps recorded.</p>;
    }
  };

  const dock: { kind: Drawer; label: string; icon: React.ReactNode; count?: number }[] = [
    { kind: "notes", label: "Notes", icon: <NotebookPen />, count: working.sellerNotes.length },
    { kind: "questions", label: "Questions to ask", icon: <MessageCircleQuestion />, count: working.questions.length },
    { kind: "sources", label: "Sources", icon: <Link2 />, count: orderedSources.length },
    { kind: "made", label: "How this was made", icon: <Settings2 /> },
  ];

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ColumnHeading>
            What we found <AiMarker className="normal-case tracking-normal">Researcher · every line sourced</AiMarker>
          </ColumnHeading>
          {/* Invariant 3: sentences with no source are dropped and counted, never hidden; the counts sit behind this icon. */}
          <span className="group relative inline-flex">
            <button type="button" aria-label="What the Researcher kept and dropped" aria-describedby="brief-counts" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Info aria-hidden="true" className="size-4" />
            </button>
            <span id="brief-counts" role="tooltip" className="invisible absolute top-full left-0 z-40 mt-1.5 flex w-72 flex-col gap-1.5 rounded-lg border-2 border-ink bg-card p-3 text-[13px] opacity-0 shadow-comic-sm transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <span>
                <b>{kept.length}</b> sourced {kept.length === 1 ? "fact" : "facts"} from <b>{orderedSources.length}</b> {orderedSources.length === 1 ? "source" : "sources"}
              </span>
              <span>
                <b>{working.droppedCount}</b> {working.droppedCount === 1 ? "sentence" : "sentences"} dropped for having no source
              </span>
              <span>
                <b>{inferences.length}</b> {inferences.length === 1 ? "inference" : "inferences"} built only from kept facts
                {droppedInferences ? `, ${droppedInferences} dropped when their facts were removed` : ""}
              </span>
              <CalcMarker className="mt-0.5 self-start">Counted by code</CalcMarker>
            </span>
          </span>
          <span className="flex-1" />
          <span className="hidden text-xs text-muted-foreground md:inline">Click any line for the full sentence and its sources</span>
          {/* Show brief opens the brief exactly as it will paste, so the person sees what they copy. */}
          <Button type="button" size="sm" variant="outline" aria-expanded={previewing} onClick={() => setPreviewing((value) => !value)}>
            <FileText aria-hidden="true" />
            {previewing ? "Hide brief" : "Show brief"}
          </Button>
        </div>
        {previewing ? (
          <section aria-label="The brief to copy" className="overflow-hidden rounded-xl border-2 border-ink bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b bg-subtle px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">This is what you copy: the kept facts, the inferences, the questions and your notes, with numbered sources. It pastes with its formatting into Docs or Gmail.</span>
              {copied ? (
                <span role="status" className="text-xs text-muted-foreground">
                  {copied}
                </span>
              ) : null}
              <Button type="button" size="sm" onClick={copyBrief}>
                <Copy aria-hidden="true" />
                Copy to clipboard
              </Button>
            </div>
            <article className={cn("fh-doc max-h-[28rem] overflow-y-auto px-6 py-5 text-[15px]", DOC_STYLES)} dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        ) : null}
      </div>

      {/* FR-RES-8: five boxes of a fixed size, so nothing leaves a gap; each line opens its whole sentence. */}
      <div className="grid gap-x-5 gap-y-7 pt-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.95fr)_minmax(0,1.15fr)]" onKeyDown={(event) => event.key === "Escape" && setOpenId(null)}>
        <Box title="Snapshot" marker={rows.some(({ claim }) => claim?.short) ? <SummaryMark /> : undefined} onMore={() => openDrawer("snapshot")} className="h-[25rem]">
          {rows.length ? (
            <ul className="flex flex-col px-2.5">
              {rows.slice(0, snapshotShown).map(factRow)}
              {rows.length > snapshotShown ? (
                <li className="px-2 pt-1 text-xs text-muted-foreground">
                  and {rows.length - snapshotShown} more in{" "}
                  <button type="button" onClick={() => openDrawer("snapshot")} className="text-link hover:underline">
                    View all
                  </button>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="px-4 py-2 text-sm text-muted-foreground">Nothing found.</p>
          )}
          <p className="mt-auto flex h-11 items-center gap-2 overflow-hidden border-t border-line-soft px-4 text-sm">
            <b className="w-28 shrink-0">Tech</b>
            {working.detectedTech.length === 0 ? <span className="truncate text-muted-foreground">nothing detected on their site</span> : null}
            <span className="flex min-w-0 gap-1.5 overflow-hidden">
              {working.detectedTech.map((tech) => (
                <span key={tech.value} className={cn("shrink-0 rounded-full px-2.5 py-px text-xs", tech.matchesSeller ? "bg-fit-strong-soft font-semibold text-fit-strong" : "bg-muted")}>
                  {tech.label}
                  {tech.matchesSeller ? " · you work with this" : ""}
                </span>
              ))}
            </span>
          </p>
        </Box>

        <div className="flex h-[25rem] min-w-0 flex-col gap-6">
          <Box title="Location" className="h-32 shrink-0">
            {hq && place ? (
              <div data-brief-line className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
                {MAPS_KEY ? (
                  // FR-RES-9: Google's Maps Embed API, which has no usage charge. Only the place text goes in the URL.
                  <iframe title={`Map of ${place}`} src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(MAPS_KEY)}&q=${encodeURIComponent(mapQuery!)}&zoom=11`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-full w-28 shrink-0 rounded-lg border-2 border-ink" />
                ) : (
                  <svg viewBox="0 0 120 90" role="img" aria-label="A map pin" className="h-full w-28 shrink-0 rounded-lg border-2 border-ink bg-fit-strong-soft">
                    <path d="M0 60 C20 50 30 70 55 58 S95 40 120 52 V90 H0Z" className="fill-claim-research-soft" />
                    <path d="M10 10 L60 40 L110 18 M30 80 L60 40 L85 85" className="stroke-card" strokeWidth="4" fill="none" />
                    <path d="M60 18 C51 18 47 25 47 30 C47 39 60 50 60 50 C60 50 73 39 73 30 C73 25 69 18 60 18Z" className="fill-primary stroke-ink" strokeWidth="2.2" />
                    <circle cx="60" cy="30" r="4" className="fill-ink" />
                  </svg>
                )}
                <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
                  <span className="text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase">Headquarters</span>
                  <b className={cn("line-clamp-3 text-[13px] leading-snug", hq.removed && "text-muted-foreground line-through")} title={hq.text}>
                    {place}
                    {cite(hq)}
                  </b>
                  <a href={mapsLink!} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 text-xs text-link hover:underline">
                    <GoogleLogo product="maps" className="size-3.5" />
                    Open in Google Maps <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                </div>
              </div>
            ) : (
              <p className="px-4 py-2 text-sm text-muted-foreground">{labelled ? "Their headquarters wasn't in the sources." : "Re-run research to place them on a map."}</p>
            )}
          </Box>
          <Box title="Market pressures" marker={<InferenceMark />} onMore={pressures.length > INFERENCE_ROWS ? () => openDrawer("inferences") : undefined} className="min-h-0 flex-1">
            {inferenceRows(pressures, "bg-score-consider-soft text-score-consider")}
          </Box>
          <Box title="Likely needs" marker={<InferenceMark />} onMore={needs.length > INFERENCE_ROWS ? () => openDrawer("inferences") : undefined} className="min-h-0 flex-1">
            {inferenceRows(needs, "bg-ai-soft text-ai")}
          </Box>
        </div>

        <Box title="News & events" marker={news.some(({ claim }) => claim.short) ? <SummaryMark /> : undefined} onMore={news.length ? () => openDrawer("news") : undefined} moreLabel={news.length > NEWS_ROWS ? `View all ${news.length}` : "View all"} className="h-[25rem] md:col-span-2 xl:col-span-1">
          {news.length ? (
            // A vertical timeline, newest first; the line runs behind the dots.
            <ol className="relative flex flex-col px-2.5 before:absolute before:top-3 before:bottom-8 before:left-[1.45rem] before:w-0.5 before:bg-border">
              {news.slice(0, NEWS_ROWS).map(newsRow)}
            </ol>
          ) : (
            <p className="px-4 py-2 text-sm text-muted-foreground">Nothing found.</p>
          )}
        </Box>
      </div>

      {/* The rest opens in a side drawer. Google's Search Suggestions stay on the page, unchanged (invariant 3). */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {dock.map((item) => (
            <span key={item.kind} className="relative">
              <button type="button" onClick={() => openDrawer(item.kind)} className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-ink bg-card px-3.5 text-sm font-bold shadow-comic-sm hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4">
                {item.icon}
                {item.label}
                {item.count !== undefined ? <span className="rounded-full bg-muted px-1.5 text-xs">{item.count}</span> : null}
              </button>
            </span>
          ))}
        </div>
        {working.searchSuggestions.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GoogleLogo product="search" className="size-3.5" />
              Searches behind this brief · shown as Google provides them
            </span>
            <div className="grid gap-x-3 md:grid-cols-2 xl:grid-cols-3">
              {working.searchSuggestions.map((suggestion, index) => (
                <iframe key={index} title={`Google Search suggestions ${index + 1}`} srcDoc={suggestion} sandbox="allow-popups allow-popups-to-escape-sandbox" style={{ colorScheme: "light" }} className="h-12 w-full border-0" />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <SideDrawer ref={dialog} title={drawer ? DRAWER_TITLE[drawer] : null} onClose={() => setDrawer(null)}>
        {drawer ? drawerBody(drawer) : null}
      </SideDrawer>

      {editable ? (
        <>
          <GateSlot>
            <div className="order-last flex items-center gap-2">
              {approve.error ? <span className="text-sm text-destructive">{approve.error}</span> : null}
              <Button type="button" onClick={approve.run} disabled={approve.pending} className="h-10 px-4 text-[15px] font-bold shadow-comic">
                {approve.pending ? "Starting fit…" : "Continue to fit"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </GateSlot>
          {kept.length ? null : <p className="text-sm text-muted-foreground">No sourced facts to keep. Fit will run on what came in and any seller notes you add.</p>}
        </>
      ) : (
        <Approved run={run} gate="Gate B" />
      )}
    </>
  );
}
