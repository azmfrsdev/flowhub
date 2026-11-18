"use client";

import { Settings2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type DraftContext, renderDraftHtml } from "@/lib/deal-room/draft";
import { SOFT_CHECKS, reviewSummary } from "@/lib/deal-room/review";
import type { Opportunity, Run, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { decideClaim } from "./actions";
import { ForwardOptions } from "./forward-options";
import { useGate } from "./gate-parts";
import { Box, BoxTag, SideDrawer } from "./stage-box";

const REASON: Record<string, string> = {
  cost_leak: "States one of your costs. Costs never go to a client.",
  non_public_proof: "Names a result marked not public.",
  price_not_from_graph: "A price that didn't come from your rate cards.",
  unknown_ref: "Points at something not in your catalogue or the brief.",
  planned_feature: "Rests on a feature that's only on your roadmap. Keep it only if it says so, with no date.",
};

/** How a generated document (the proposal, the research brief) reads in its in-app preview. */
export const DOC_STYLES =
  "[&_h1]:mb-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_.meta]:mb-5 [&_.meta]:text-sm [&_.meta]:text-muted-foreground [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_p]:my-2 [&_p]:leading-relaxed [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-sm [&_a]:text-link [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_.price]:text-right [&_.price]:font-mono [&_.group_th]:bg-muted/60 [&_.group_th]:text-xs [&_.group_th]:uppercase [&_.group_th]:tracking-wider [&_.group_th]:text-muted-foreground [&_.subtotal]:font-semibold [&_.note]:text-xs [&_.note]:text-muted-foreground [&_mark.flag]:rounded [&_mark.flag]:bg-fit-cannot-soft [&_mark.flag]:px-0.5 [&_mark.flag]:text-fit-cannot [&_mark.flag]:underline [&_mark.flag]:decoration-wavy [&_mark.seller]:rounded [&_mark.seller]:bg-accent [&_mark.seller]:px-0.5 [&_mark.seller]:text-accent-foreground";

/** Gate D (FR-WRI-4, FR-WRI-5, FR-WRI-8): the draft, the review report, and the person's decisions. */
export function WriteView({ opp, run, working, context, editable, canEdit, made }: { opp: Opportunity; run: Run; working: WriteOutput; context: DraftContext; editable: boolean; canEdit: boolean; made?: React.ReactNode }) {
  const preview = useMemo(() => renderDraftHtml(working, context, { highlight: true }), [working, context]);
  const open = working.claims.filter((claim) => claim.support === "neither" && !claim.decision);
  const decided = working.claims.filter((claim) => claim.support === "neither" && claim.decision);
  const backed = working.claims.filter((claim) => claim.support === "research" || claim.support === "offering").length;
  // The side drawer shows the whole draft, or how this stage was made.
  const [drawer, setDrawer] = useState<"read" | "made" | null>(null);
  const reader = useRef<HTMLDialogElement>(null);
  const openDrawer = (kind: "read" | "made") => {
    setDrawer(kind);
    reader.current?.showModal();
  };

  // FR-WRI-11: the draft beside its review, a fixed height; Read full opens the whole draft in a drawer.
  // What sends the proposal on (Google Docs or copy) sits under the review, in the same column.
  const draft = (side: React.ReactNode) => (
    <div className="grid gap-x-5 gap-y-7 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Box title="Draft" marker={<><BoxTag kind="ai">Writer</BoxTag><BoxTag kind="calc">Prices filled by code</BoxTag></>} onMore={() => openDrawer("read")} moreLabel="Read full" className="h-[32rem]">
        <article className={cn("fh-doc min-h-0 flex-1 overflow-y-auto px-6 py-3 text-[14.5px]", DOC_STYLES)} dangerouslySetInnerHTML={{ __html: preview }} />
      </Box>
      <div className="flex min-w-0 flex-col gap-7 xl:h-[32rem]">
      <Box title="Review" marker={<><BoxTag kind="ai">Reviewer</BoxTag><BoxTag kind="calc">Code has the last word</BoxTag></>} className="max-xl:h-72 min-h-40 xl:flex-1">
        <div id="flagged" className="flex min-h-0 flex-1 scroll-mt-44 flex-col gap-2 overflow-y-auto px-4 pt-2 pb-3 text-sm">
          <p className="font-semibold">{reviewSummary(working.claims)}</p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-fit-strong-soft px-2 py-px font-semibold text-fit-strong">{backed} backed by research or your catalogue</span>
            {open.length ? <span className="rounded-full bg-fit-cannot-soft px-2 py-px font-semibold text-fit-cannot">{open.length} need your decision</span> : null}
            {working.loops ? <span className="rounded-full bg-ai-soft px-2 py-px font-semibold text-ai">Writer revised {working.loops === 1 ? "once" : "twice"}</span> : null}
          </div>
          {open.length || decided.length ? (
            <ul className="mt-1 flex flex-col divide-y border-t">
              {[...open, ...decided].map((claim) => (
                <FlaggedClaim key={claim.id} opp={opp} run={run} claim={claim} editable={editable} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Every factual sentence is backed by the brief or your catalogue.</p>
          )}
        </div>
      </Box>
      {side}
      </div>
    </div>
  );

  return (
    <>
      <ForwardOptions opp={opp} run={run} working={working} context={context} editable={editable} canEdit={canEdit} open={open.length} draft={draft} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => openDrawer("made")} className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-ink bg-card px-3.5 text-sm font-bold shadow-comic-sm hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4">
          <Settings2 aria-hidden="true" />
          How this was made
        </button>
      </div>
      <SideDrawer ref={reader} title={drawer === "read" ? "Proposal draft" : drawer === "made" ? "How this was made" : null} onClose={() => setDrawer(null)}>
        {drawer === "read" ? <article className={cn("fh-doc text-[15px]", DOC_STYLES)} dangerouslySetInnerHTML={{ __html: preview }} /> : drawer === "made" ? (made ?? <p className="text-muted-foreground">No steps recorded.</p>) : null}
      </SideDrawer>
    </>
  );
}

function FlaggedClaim({ opp, run, claim, editable }: { opp: Opportunity; run: Run; claim: WriteOutput["claims"][number]; editable: boolean }) {
  const accept = useGate(() => decideClaim(opp.id, run.id, run.rev, claim.id, "accept_as_seller"));
  const remove = useGate(() => decideClaim(opp.id, run.id, run.rev, claim.id, "remove"));
  const hardBlock = Boolean(claim.hardCheck && !SOFT_CHECKS.has(claim.hardCheck));
  const error = accept.error ?? remove.error;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <p className={cn(claim.decision === "remove" && "text-muted-foreground line-through")}>&ldquo;{claim.text}&rdquo;</p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {claim.requested ? <span className="rounded-full bg-accent px-2 py-px font-semibold text-accent-foreground">You asked for this</span> : null}
        {claim.hardCheck ? REASON[claim.hardCheck] : "Nothing in the brief or your catalogue supports it."}
      </p>
      {claim.decision ? (
        <span className="text-xs font-semibold">{claim.decision === "remove" ? "Removed from the draft." : "Kept as your own statement."}</span>
      ) : editable ? (
        <span className="flex flex-wrap gap-2">
          {!hardBlock ? (
            <Button type="button" size="sm" variant="outline" disabled={accept.pending || remove.pending} onClick={accept.run}>
              Keep as my statement
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={accept.pending || remove.pending} onClick={remove.run} className="text-destructive">
            Remove
          </Button>
        </span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </li>
  );
}
