"use client";

import { CheckCircle2, Copy, ExternalLink, FileText, Lock, Mail, Presentation } from "lucide-react";
import { useState } from "react";
import { CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { type DraftContext, htmlToText, renderDraftHtml } from "@/lib/deal-room/draft";
import { driveTokenError, requestDriveToken } from "@/lib/firebase/drive-token";
import { useLiveDoc } from "@/lib/firebase/live";
import type { ClientDeck, EmailFiles, FollowUp, Opportunity, Run, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { finaliseProposal } from "./actions";
import { DeckCard } from "./deck-card";
import { FollowUpCard } from "./follow-up-card";
import { Approved, Card } from "./gate-parts";

type Option = "proposal" | "deck" | "email";

/**
 * Gate D's ways forward (FR-WRI-7, PRD 7.22, 7.23): once every flagged claim
 * is decided, the proposal can leave FlowHub three ways, in any order:
 * 1. the proposal itself, copied or created in Google Docs (this passes Gate D);
 * 2. a client deck, in Google Slides or as PowerPoint;
 * 3. an email in Gmail, with the files chosen.
 */
export function ForwardOptions({ opp, run, working, context, editable, canEdit, open }: { opp: Opportunity; run: Run; working: WriteOutput; context: DraftContext; editable: boolean; canEdit: boolean; open: number }) {
  const base = `workspaces/${opp.workspaceId}/opportunities/${opp.id}`;
  const current = ["waiting", "approved"].includes(opp.stages.write.state) && opp.stages.write.currentRunId === run.id;
  const { data: deck } = useLiveDoc<ClientDeck>(current ? `${base}/decks/${run.id}` : null, null);
  const { data: followUp } = useLiveDoc<FollowUp>(current ? `${base}/followUps/${run.id}` : null, null);
  const { data: files } = useLiveDoc<EmailFiles>(current ? `${base}/emailFiles/${run.id}` : null, null);
  const [chosen, setChosen] = useState<Option>(() => (working.doc ? "deck" : "proposal"));
  const locked = open > 0;
  const prospect = opp.prospect?.name ?? "the prospect";
  const sent = opp.status === "sent" || Boolean(opp.outcome);

  // An earlier draft, or one built on something that changed: only what already happened is shown.
  if (!current) return working.doc ? <DocBar working={working} context={context} /> : <Approved run={run} gate="Gate D" />;

  const options: { key: Option; title: string; via: string; icon: React.ReactNode; status: string; done: boolean }[] = [
    { key: "proposal", title: "Proposal", via: "Copy, or Google Docs", icon: <FileText aria-hidden="true" className="size-5" />, status: working.doc ? "In Google Docs" : "Ready to create", done: Boolean(working.doc) },
    { key: "deck", title: "Client deck", via: "Google Slides or PowerPoint", icon: <Presentation aria-hidden="true" className="size-5" />, status: deck?.slides ? "In Google Slides" : deck ? "Written · 8 slides" : "Not written yet", done: Boolean(deck?.slides) },
    { key: "email", title: "Email", via: "Gmail, with the files", icon: <Mail aria-hidden="true" className="size-5" />, status: sent ? "Marked as sent" : followUp ? "Drafted" : "Not drafted yet", done: sent },
  ];

  return (
    <section aria-labelledby="forward-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="forward-title" className="text-2xl">
          Send it forward
        </h2>
        {opp.stages.write.state === "waiting" ? <span className="rounded-full bg-attention-soft px-2 py-px text-xs font-semibold text-attention">Your turn: Gate D</span> : null}
        <p className="w-full text-sm text-muted-foreground">
          {locked
            ? `Decide on ${open} flagged ${open === 1 ? "claim" : "claims"} above first. Nothing leaves FlowHub until every claim is backed or decided.`
            : `Three ways to take this proposal to ${prospect}. Use any of them, in any order. Each one opens in your own Google account.`}
        </p>
      </div>

      <div role="tablist" aria-label="Ways to send the proposal" className="grid gap-3 sm:grid-cols-3">
        {options.map((option, index) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={chosen === option.key}
            disabled={locked}
            onClick={() => setChosen(option.key)}
            className={cn(
              "flex items-start gap-3 rounded-xl border-2 border-ink bg-card px-4 py-3 text-left shadow-comic transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              chosen === option.key && !locked ? "bg-primary/25 ring-2 ring-ink/20" : "hover:bg-accent/40",
            )}
          >
            <span className="flex flex-col items-center gap-1.5">
              <span className="rounded-md bg-ink px-1.5 text-[11px] font-bold text-background">{String(index + 1).padStart(2, "0")}</span>
              {option.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-bold">{option.title}</span>
              <span className="text-xs text-muted-foreground">{option.via}</span>
              <span className={cn("mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold", option.done ? "bg-fit-strong-soft text-fit-strong" : "bg-muted text-muted-foreground")}>
                {locked ? <Lock aria-hidden="true" className="size-3" /> : option.done ? <CheckCircle2 aria-hidden="true" className="size-3" /> : null}
                {locked ? "After the flagged claims" : option.status}
              </span>
            </span>
          </button>
        ))}
      </div>

      {locked ? null : (
        <div role="tabpanel" aria-label={options.find((option) => option.key === chosen)?.title}>
          {chosen === "proposal" ? (
            <ProposalPanel opp={opp} run={run} working={working} context={context} editable={editable} />
          ) : chosen === "deck" ? (
            <DeckCard opp={opp} run={run} canEdit={canEdit} deck={deck} />
          ) : (
            <FollowUpCard opp={opp} run={run} canEdit={canEdit} deck={deck} followUp={followUp} files={files} onGo={setChosen} />
          )}
        </div>
      )}
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
            <FileText aria-hidden="true" />
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
function ProposalPanel({ opp, run, working, context, editable }: { opp: Opportunity; run: Run; working: WriteOutput; context: DraftContext; editable: boolean }) {
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
    <Card title="Proposal · Google Docs" marker={<CalcMarker>Prices filled from your rate cards</CalcMarker>}>
      <div className="flex flex-col gap-3 px-5 py-4 text-sm">
        {working.doc ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-fit-strong">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              In the FlowHub folder of your Google Drive. Gate D passed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={working.doc.url} target="_blank" rel="noopener noreferrer">
                  <FileText aria-hidden="true" />
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
            <p className="text-muted-foreground">Create the proposal as a Google Doc in your own Drive, ready to edit and share, or copy it to paste anywhere. Creating the Doc passes Gate D.</p>
            <div className="flex flex-wrap gap-2">
              {editable ? (
                <Button type="button" onClick={createDoc} disabled={state.pending}>
                  <FileText aria-hidden="true" />
                  {state.pending ? "Creating the Doc…" : "Create in Google Docs"}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={copy}>
                <Copy aria-hidden="true" />
                {copied ? "Copied" : "Copy the proposal"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">FlowHub asks Google only for access to the files it creates.</p>
          </>
        )}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    </Card>
  );
}
