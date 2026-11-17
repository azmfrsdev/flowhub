"use client";

import { ArrowDown, CheckCircle2, Copy, ExternalLink, Loader2, Lock } from "lucide-react";
import { useActionState, useState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { type DraftContext, htmlToText, renderDraftHtml } from "@/lib/deal-room/draft";
import { driveTokenError, requestDriveToken } from "@/lib/firebase/drive-token";
import { useLiveDoc } from "@/lib/firebase/live";
import type { ClientDeck, EmailFiles, FollowUp, Opportunity, Run, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { type GateResult, finaliseProposal, startWriting } from "./actions";
import { DeckCard } from "./deck-card";
import { FollowUpCard } from "./follow-up-card";
import { Approved, GateSlot } from "./gate-parts";
import { Box, BoxTag } from "./stage-box";
import { GoogleLogo } from "@/components/flowhub/google-logo";

export type WriteStep = "proposal" | "deck" | "email";

type StepCard = { key: WriteStep; title: string; via: string; icon: React.ReactNode; status: string; tone: "idle" | "done" | "busy" | "warn"; locked: string | null };

const STATUS_TONE = { idle: "bg-muted text-muted-foreground", done: "bg-fit-strong-soft text-fit-strong", busy: "bg-ai-soft text-ai", warn: "bg-fit-cannot-soft text-fit-cannot" } as const;

/**
 * FR-WRI-11: the three things to make, in one box. The deck and the email are made from the
 * written proposal, so they stay locked, with the reason, until it is written and every flagged
 * claim is decided. The chosen step's panel shows below the box.
 */
export function WriteSteps({ cards, chosen, onChoose }: { cards: StepCard[]; chosen: WriteStep; onChoose: (step: WriteStep) => void }) {
  return (
    <Box title="What to send" marker={<BoxTag kind="calc">The proposal comes first; the deck and email are made from it</BoxTag>}>
      <div role="tablist" aria-label="What to send" className="grid gap-3 px-4 pt-2 pb-4 sm:grid-cols-3">
        {cards.map((card, index) => (
          <button
            key={card.key}
            type="button"
            role="tab"
            aria-selected={chosen === card.key}
            aria-disabled={card.locked ? true : undefined}
            onClick={() => (card.locked ? undefined : onChoose(card.key))}
            title={card.locked ?? undefined}
            className={cn(
              "flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              card.locked ? "cursor-not-allowed border-border bg-subtle text-muted-foreground" : chosen === card.key ? "border-ink bg-primary/25 shadow-comic" : "border-ink bg-card shadow-comic hover:bg-attention-soft",
            )}
          >
            <span className="flex flex-col items-center gap-1.5">
              <span className={cn("rounded-md px-1.5 text-[11px] font-bold text-background", card.locked ? "bg-muted-foreground" : "bg-ink")}>{String(index + 1).padStart(2, "0")}</span>
              {card.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-bold">{card.title}</span>
              <span className="text-xs text-muted-foreground">{card.via}</span>
              <span className={cn("mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold", card.locked ? STATUS_TONE.idle : STATUS_TONE[card.tone])}>
                {card.locked ? <Lock aria-hidden="true" className="size-3" /> : card.tone === "done" ? <CheckCircle2 aria-hidden="true" className="size-3" /> : card.tone === "busy" ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : null}
                {card.locked ?? card.status}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Box>
  );
}

const PROPOSAL = { key: "proposal", title: "Proposal", via: "Written by the agents, then Google Docs or copy", icon: <GoogleLogo product="docs" className="size-5" /> } as const;
const DECK = { key: "deck", title: "Client deck", via: "Google Slides or PowerPoint", icon: <GoogleLogo product="slides" className="size-5" /> } as const;
const EMAIL = { key: "email", title: "Email", via: "Gmail, with the files", icon: <GoogleLogo product="gmail" className="size-5" /> } as const;

/** The cards before a draft exists: only the proposal can be chosen. */
export function stepsBeforeDraft(writing: boolean): StepCard[] {
  return [
    { ...PROPOSAL, status: writing ? "Writing…" : "Ready to write", tone: writing ? "busy" : "idle", locked: null },
    { ...DECK, status: "", tone: "idle", locked: "Write the proposal first" },
    { ...EMAIL, status: "", tone: "idle", locked: "Write the proposal first" },
  ];
}

/**
 * FR-WRI-3, FR-WRI-11: Gate C is passed and nothing is written yet. The person picks a tone and
 * an optional note, then the Writer and Reviewer start.
 */
export function StartWriting({ opp, canEdit }: { opp: Opportunity; canEdit: boolean }) {
  const [state, action] = useActionState<GateResult, FormData>(startWriting.bind(null, opp.id), {});
  const [length, setLength] = useState(0);
  return (
    <>
      <WriteSteps cards={stepsBeforeDraft(false)} chosen="proposal" onChoose={() => undefined} />
      <Box title="Proposal · Writer and Reviewer" marker={<BoxTag kind="ai">Agents</BoxTag>}>
        <div className="flex flex-col gap-3 px-5 pt-2 pb-4 text-sm">
          <p className="text-muted-foreground">The Writer drafts from your approved fit map and brief. The Reviewer checks every claim, and code fills each price from your rate cards. The deck and the email are made from this proposal, so it comes first.</p>
          {canEdit ? (
            <form id="start-writing" action={action} className="flex scroll-mt-44 flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tone">Tone</Label>
                  <select id="tone" name="tone" defaultValue="formal" className="h-9 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                    <option value="formal">Formal</option>
                    <option value="friendly">Friendly</option>
                    <option value="concise">Concise</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="instructions">
                    Note for the Writer <span className="font-normal text-muted-foreground">(optional, {500 - length} left)</span>
                  </Label>
                  <textarea id="instructions" name="instructions" rows={2} maxLength={500} onChange={(event) => setLength(event.target.value.length)} placeholder="Lead with the sale-day problem. Keep pricing to the Growth tier." className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
                </div>
              </div>
              {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <PendingButton pendingLabel="Starting the Writer…" className="shadow-comic-sm">
                  Write the proposal
                </PendingButton>
                <span className="text-xs text-muted-foreground">Uses one of today&apos;s AI runs</span>
              </div>
            </form>
          ) : (
            <p className="text-muted-foreground">An editor writes the proposal.</p>
          )}
        </div>
      </Box>
      {canEdit ? (
        <GateSlot>
          <Button asChild className="order-last h-10 px-4 text-[15px] font-bold shadow-comic">
            <a href="#start-writing">
              Write the proposal
              <ArrowDown aria-hidden="true" />
            </a>
          </Button>
        </GateSlot>
      ) : null}
    </>
  );
}

/**
 * Gate D's ways forward (FR-WRI-7, FR-WRI-11, PRD 7.22, 7.23), once a draft exists:
 * 1. the proposal: its draft and review, then Google Docs or copy (this passes Gate D);
 * 2. a client deck, in Google Slides or as PowerPoint;
 * 3. an email in Gmail, with the files chosen.
 * The deck and the email open once every flagged claim is decided.
 */
export function ForwardOptions({ opp, run, working, context, editable, canEdit, open, draft }: { opp: Opportunity; run: Run; working: WriteOutput; context: DraftContext; editable: boolean; canEdit: boolean; open: number; draft: (side: React.ReactNode) => React.ReactNode }) {
  const base = `workspaces/${opp.workspaceId}/opportunities/${opp.id}`;
  const current = ["waiting", "approved"].includes(opp.stages.write.state) && opp.stages.write.currentRunId === run.id;
  const { data: deck } = useLiveDoc<ClientDeck>(current ? `${base}/decks/${run.id}` : null, null);
  const { data: followUp } = useLiveDoc<FollowUp>(current ? `${base}/followUps/${run.id}` : null, null);
  const { data: files } = useLiveDoc<EmailFiles>(current ? `${base}/emailFiles/${run.id}` : null, null);
  const [chosen, setChosen] = useState<WriteStep>("proposal");
  const locked = open > 0;
  const sent = opp.status === "sent" || Boolean(opp.outcome);

  // An earlier draft, or one built on something that changed: the draft, and only what already happened.
  if (!current)
    return (
      <>
        {draft(null)}
        {working.doc ? <DocBar working={working} context={context} /> : <Approved run={run} gate="Gate D" />}
      </>
    );

  const lockReason = locked ? "After the flagged claims" : null;
  const cards: StepCard[] = [
    { ...PROPOSAL, status: working.doc ? "In Google Docs" : locked ? `Draft · ${open} flagged` : "Draft ready", tone: working.doc ? "done" : locked ? "warn" : "idle", locked: null },
    { ...DECK, status: deck?.slides ? "In Google Slides" : deck ? "Written · 8 slides" : "Not written yet", tone: deck?.slides ? "done" : "idle", locked: lockReason },
    { ...EMAIL, status: sent ? "Marked as sent" : followUp ? "Drafted" : "Not drafted yet", tone: sent ? "done" : "idle", locked: lockReason },
  ];
  const step = locked ? "proposal" : chosen;

  return (
    <section aria-label="What to send" className="flex flex-col gap-7 pt-2">
      {opp.stages.write.state === "waiting" ? (
        <GateSlot>
          <Button asChild className="order-last h-10 px-4 text-[15px] font-bold shadow-comic">
            <a href={locked ? "#flagged" : "#send-proposal"} onClick={() => setChosen("proposal")}>
              {locked ? null : <GoogleLogo product="docs" />}
              {locked ? `Decide ${open} flagged ${open === 1 ? "claim" : "claims"}` : "Create in Google Docs"}
              <ArrowDown aria-hidden="true" />
            </a>
          </Button>
        </GateSlot>
      ) : null}
      <WriteSteps cards={cards} chosen={step} onChoose={setChosen} />
      <div role="tabpanel" aria-label={cards.find((card) => card.key === step)?.title} className="flex flex-col gap-7">
        {step === "proposal" ? (
          draft(<ProposalPanel opp={opp} run={run} working={working} context={context} editable={editable} locked={locked} />)
        ) : step === "deck" ? (
          <DeckCard opp={opp} run={run} canEdit={canEdit} deck={deck} />
        ) : (
          <FollowUpCard opp={opp} run={run} canEdit={canEdit} deck={deck} followUp={followUp} files={files} onGo={setChosen} />
        )}
      </div>
    </section>
  );
}

function useCopy(working: WriteOutput, context: DraftContext) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const html = renderDraftHtml(working, context);
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([htmlToText(html)], { type: "text/plain" }) })]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return { copied, copy };
}

/** A finalised earlier draft: its Doc, still a working link. */
function DocBar({ working, context }: { working: WriteOutput; context: DraftContext }) {
  const { copied, copy } = useCopy(working, context);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-fit-strong/40 bg-fit-strong-soft/40 px-4 py-3">
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">This proposal is in the FlowHub folder of your Google Drive.</span>
      <Button type="button" variant="outline" onClick={copy}>
        <Copy aria-hidden="true" />
        {copied ? "Copied" : "Copy"}
      </Button>
      {working.doc ? (
        <Button asChild>
          <a href={working.doc.url} target="_blank" rel="noopener noreferrer">
            <GoogleLogo product="docs" />
            Open in Google Docs
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Option 1: the proposal itself. FR-WRI-7, ADR-0007 (as amended): Google Docs
 * asks for the narrowest Drive permission, drive.file, through the same
 * Google sign-in, and the short-lived token goes straight to the server.
 * Creating the Doc passes Gate D.
 */
function ProposalPanel({ opp, run, working, context, editable, locked }: { opp: Opportunity; run: Run; working: WriteOutput; context: DraftContext; editable: boolean; locked: boolean }) {
  const { copied, copy } = useCopy(working, context);
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });

  async function createDoc() {
    setState({ pending: true, error: null });
    try {
      const token = await requestDriveToken();
      const outcome = await finaliseProposal(opp.id, run.id, run.rev, token);
      setState({ pending: false, error: outcome.error ?? null });
    } catch (err) {
      setState({ pending: false, error: driveTokenError(err, "Google Docs didn't work this time. Copy the proposal, or try again.") });
    }
  }

  return (
    <Box title="Proposal · Google Docs" marker={<BoxTag kind="calc">Creating the Doc passes Gate D</BoxTag>}>
      <div id="send-proposal" className="flex scroll-mt-44 flex-col gap-3 px-5 pt-2 pb-4 text-sm">
        {working.doc ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-fit-strong">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              In the FlowHub folder of your Google Drive. Gate D passed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={working.doc.url} target="_blank" rel="noopener noreferrer">
                  <GoogleLogo product="docs" />
                  Open in Google Docs
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={copy}>
                <Copy aria-hidden="true" />
                {copied ? "Copied" : "Copy the proposal"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">In Google Docs, File → Download gives you a Word or PDF copy. Option 3 can also link a Word copy in the email.</p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">{locked ? "Decide every flagged claim in the review first: nothing leaves FlowHub with a claim nobody backed." : "Create the proposal as a Google Doc in your own Drive, ready to edit and share, or copy it to paste anywhere. Creating the Doc passes Gate D."}</p>
            <div className="flex flex-wrap gap-2">
              {editable ? (
                <Button type="button" onClick={createDoc} disabled={state.pending || locked}>
                  <GoogleLogo product="docs" />
                  {state.pending ? "Creating the Doc…" : "Create in Google Docs"}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={copy} disabled={locked}>
                <Copy aria-hidden="true" />
                {copied ? "Copied" : "Copy the proposal"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">FlowHub asks Google only for access to the files it creates.</p>
          </>
        )}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    </Box>
  );
}
