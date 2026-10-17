"use client";

import { Check, Copy, ExternalLink, Mail, RotateCw, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { openTab, signedInEmail } from "@/components/flowhub/gmail-button";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { driveTokenError, requestDriveToken } from "@/lib/firebase/drive-token";
import { gmailComposeUrl, withLinks } from "@/lib/gmail";
import type { ClientDeck, EmailFiles, FollowUp, Opportunity, Run, WriteOutput } from "@/lib/schema";
import { cn } from "cn";
import { draftFollowUpEmail, prepareEmailFiles, setOpportunityStatus } from "./actions";
import { Card } from "./gate-parts";

type ProposalChoice = "doc" | "word" | "none";
type DeckChoice = "slides" | "pptx" | "none";

/** A message for the person, as opposed to an error from the Google window. */
class Shown extends Error {}

/** The deck as it stands, to tell whether the saved PowerPoint copy still matches it. */
export const deckKey = (deck: ClientDeck) => `${deck.createdAt}|${deck.photos.title?.url ?? ""}|${deck.photos.proof?.url ?? ""}`;

/**
 * Option 3 at Gate D (C3, PRD 7.23, ADR-0016 D1): the email that sends the
 * proposal. Flash restates the proposal's own claims; code removes amounts
 * and private results and flags any factual sentence with no claim behind it.
 * One click drafts it if needed and opens Gmail with it, with links to the
 * Google Doc or a Word copy and to the Slides or a PowerPoint copy. Gmail's
 * compose window can't carry attachments, so the files are linked from the
 * person's Drive, and Gmail offers to share them on Send. The person sends it.
 */
export function FollowUpCard({ opp, run, canEdit, deck, followUp, files, onGo }: { opp: Opportunity; run: Run; canEdit: boolean; deck: ClientDeck | null; followUp: FollowUp | null; files: EmailFiles | null; onGo: (option: "proposal" | "deck") => void }) {
  const doc = (run.working as WriteOutput).doc;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [proposalChoice, setProposalChoice] = useState<ProposalChoice | null>(null);
  const [deckChoice, setDeckChoice] = useState<DeckChoice | null>(null);
  const tone = run.inputs.options?.tone ?? "formal";
  const sent = opp.status === "sent" || Boolean(opp.outcome);

  // What can go with the email, and what goes by default: the Google files once they exist.
  const proposal: ProposalChoice = proposalChoice && (proposalChoice === "none" || doc) ? proposalChoice : doc ? "doc" : "none";
  const deckPick: DeckChoice = deckChoice && (deckChoice === "none" || (deckChoice === "slides" ? deck?.slides : deck)) ? deckChoice : deck?.slides ? "slides" : "none";
  const wordUrl = files?.word && doc && files.word.docId === doc.id ? files.word.url : null;
  const pptxUrl = files?.powerpoint && deck && files.powerpoint.deckKey === deckKey(deck) ? files.powerpoint.url : null;
  const flagged = followUp?.paragraphs.flatMap((paragraph) => paragraph.sentences).filter((sentence) => sentence.flagged).length ?? 0;
  const restated = new Set(followUp?.paragraphs.flatMap((paragraph) => paragraph.sentences.flatMap((sentence) => sentence.claimIds)) ?? []).size;

  function links(word: string | null, pptx: string | null) {
    return [
      ...(proposal === "doc" && doc ? [{ label: "The proposal (Google Doc)", url: doc.url }] : []),
      ...(proposal === "word" && word ? [{ label: "The proposal (Word)", url: word }] : []),
      ...(deckPick === "slides" && deck?.slides ? [{ label: "The slides (Google Slides)", url: deck.slides.url }] : []),
      ...(deckPick === "pptx" && pptx ? [{ label: "The slides (PowerPoint)", url: pptx }] : []),
    ];
  }
  const bodyOf = (draft: FollowUp, word: string | null, pptx: string | null) => withLinks(draft.paragraphs.map((paragraph) => paragraph.sentences.map((sentence) => sentence.text).join(" ")), links(word, pptx));

  /**
   * One click: draft the email if there isn't one, save any Word or
   * PowerPoint copy, then open Gmail. Without Drive work, a tab opens at once
   * (inside the click, so the browser allows it) and moves to Gmail when the
   * draft is ready. With Drive work, the Google window comes first, and if the
   * browser then blocks the new tab, a link to the draft appears instead.
   */
  async function openGmail() {
    setError(null);
    setNotice(null);
    setReadyUrl(null);
    const needWord = proposal === "word" && !wordUrl;
    const needPptx = deckPick === "pptx" && !pptxUrl;
    const needDrive = needWord || needPptx;
    let tab: Window | null = null;
    if (!needDrive) {
      tab = window.open("", "_blank");
      if (tab) {
        tab.opener = null;
        tab.document.title = "Preparing your Gmail draft";
        tab.document.body.innerHTML = '<p style="font: 16px system-ui, sans-serif; padding: 2rem; color: #444">Preparing your Gmail draft…</p>';
      }
    }
    setBusy(true);
    try {
      const token = needDrive ? await requestDriveToken() : null;
      let draft = followUp;
      if (!draft) {
        const result = await draftFollowUpEmail(opp.id, run.id);
        if (result.error || !result.followUp) throw new Shown(result.error ?? "The email didn't come back. Try again.");
        draft = result.followUp;
      }
      let word = wordUrl;
      let pptx = pptxUrl;
      if (token) {
        const result = await prepareEmailFiles(opp.id, run.id, token, { word: needWord, powerpoint: needPptx });
        if (result.error) throw new Shown(result.error);
        word = result.files?.word ?? word;
        pptx = result.files?.powerpoint ?? pptx;
      }
      // A sentence with no claim behind it stays in FlowHub for the person to check first.
      if (draft.paragraphs.some((paragraph) => paragraph.sentences.some((sentence) => sentence.flagged))) {
        tab?.close();
        setNotice("One or more sentences have no claim in the proposal behind them. Check the highlighted text, then open Gmail again.");
        return;
      }
      const url = gmailComposeUrl({ to: opp.contact?.email, subject: draft.subject, body: bodyOf(draft, word, pptx) }, signedInEmail());
      if (tab) tab.location.href = url;
      else if (!openTab(url)) setReadyUrl(url);
      setOpened(true);
    } catch (err) {
      tab?.close();
      setError(err instanceof Shown ? err.message : driveTokenError(err, "Google Drive didn't work this time. Choose the Google links instead, or try again."));
    } finally {
      setBusy(false);
    }
  }

  const redraft = () =>
    startTransition(async () => {
      const result = await draftFollowUpEmail(opp.id, run.id);
      setError(result.error ?? null);
    });

  const markSent = () =>
    startTransition(async () => {
      const result = await setOpportunityStatus(opp.id, "sent");
      setError(result.error ?? null);
    });

  async function copy() {
    if (!followUp) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${followUp.subject}\n\n${bodyOf(followUp, wordUrl, pptxUrl)}`);
      setCopied("Copied");
    } catch {
      setCopied("Your browser blocked copying. Try again.");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <Card
      title="Email · Gmail"
      marker={
        <>
          <AiMarker>Restates the proposal only</AiMarker>
          <CalcMarker>Amounts removed by code</CalcMarker>
        </>
      }
      action={
        followUp ? (
          <span className="flex flex-wrap items-center gap-2">
            {copied ? (
              <span role="status" className="text-xs text-muted-foreground">
                {copied}
              </span>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={copy}>
              {copied === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              Copy
            </Button>
            {canEdit ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending || busy} onClick={redraft}>
                <RotateCw aria-hidden="true" />
                {pending ? "Drafting…" : "Draft again"}
              </Button>
            ) : null}
          </span>
        ) : null
      }
    >
      <div className="grid items-start gap-5 px-5 py-4 text-sm lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {followUp ? (
            <>
              <p>
                <span className="text-muted-foreground">To:</span> {opp.contact?.email ? `${opp.contact.name} <${opp.contact.email}>` : <span className="text-muted-foreground">no email on this deal yet: add it under Edit details, or type it in Gmail</span>}
              </p>
              <p>
                <span className="text-muted-foreground">Subject:</span> <b>{followUp.subject}</b>
              </p>
              <div className="flex flex-col gap-3 rounded-lg border bg-background/60 px-4 py-3 leading-relaxed">
                {followUp.paragraphs.map((paragraph, index) => (
                  <p key={index}>
                    {paragraph.sentences.map((sentence, sentenceIndex) => (
                      <span key={sentenceIndex}>
                        {sentence.flagged ? (
                          <mark title="No claim in the proposal says this. Check it before you send." className="rounded bg-fit-cannot-soft px-0.5 text-fit-cannot underline decoration-wavy">
                            {sentence.text}
                          </mark>
                        ) : (
                          sentence.text
                        )}{" "}
                      </span>
                    ))}
                  </p>
                ))}
                {links(wordUrl, pptxUrl).length ? (
                  <p className="text-xs text-muted-foreground">
                    {links(wordUrl, pptxUrl)
                      .map((link) => link.label)
                      .join(" · ")}{" "}
                    {proposal === "word" && !wordUrl ? "· the Word file, saved when you open Gmail" : ""}
                    {deckPick === "pptx" && !pptxUrl ? "· the PowerPoint file, saved when you open Gmail" : ""}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Restates {restated} {restated === 1 ? "claim" : "claims"} from the proposal, in the {followUp.tone} tone.
                {followUp.removed ? ` Code removed ${followUp.removed} ${followUp.removed === 1 ? "sentence" : "sentences"} with an amount or a private result.` : ""}
                {flagged ? ` ${flagged} highlighted ${flagged === 1 ? "sentence has" : "sentences have"} no claim behind ${flagged === 1 ? "it" : "them"}: check before you send.` : ""}
              </p>
            </>
          ) : (
            <p className="flex items-start gap-2 text-muted-foreground">
              <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                A short email to {opp.contact?.name ?? "the prospect"} that sends the proposal, in the {tone} tone. It restates only what the proposal says and never states a price. One click drafts it and opens it in Gmail, with the files you choose.
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2" disabled={!canEdit || busy}>
            <legend className="mb-1 text-xs font-semibold">Include with the email</legend>
            <ChoiceRow
              label="Proposal"
              value={proposal}
              onChange={(value) => setProposalChoice(value as ProposalChoice)}
              options={[
                { value: "doc", label: "Google Doc", available: Boolean(doc) },
                { value: "word", label: "Word file", available: Boolean(doc) },
                { value: "none", label: "Leave out", available: true },
              ]}
              missing={doc ? null : <MissingHint text="Create it in Google Docs first" onClick={() => onGo("proposal")} />}
            />
            <ChoiceRow
              label="Deck"
              value={deckPick}
              onChange={(value) => setDeckChoice(value as DeckChoice)}
              options={[
                { value: "slides", label: "Google Slides", available: Boolean(deck?.slides) },
                { value: "pptx", label: "PowerPoint file", available: Boolean(deck) },
                { value: "none", label: "Leave out", available: true },
              ]}
              missing={deck?.slides ? null : <MissingHint text={deck ? "Create it in Google Slides for a link" : "Write the deck first"} onClick={() => onGo("deck")} />}
            />
          </fieldset>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy || pending} onClick={openGmail}>
                <Mail aria-hidden="true" />
                {busy ? (followUp ? "Opening Gmail…" : "Drafting, then opening Gmail…") : followUp ? "Open in Gmail" : "Draft and open in Gmail"}
                <ExternalLink aria-hidden="true" />
              </Button>
              {!sent && (followUp || opened) ? (
                <Button type="button" variant={opened ? "default" : "outline"} disabled={pending} onClick={markSent}>
                  <Send aria-hidden="true" />
                  Mark as sent
                </Button>
              ) : null}
            </div>
          ) : null}
          {readyUrl ? (
            <a href={readyUrl} target="_blank" rel="noopener noreferrer" onClick={() => setReadyUrl(null)} className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-ink bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-comic-sm">
              Your draft is ready: open it in Gmail
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          ) : null}
          {notice ? <p className="text-xs font-semibold text-attention">{notice}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <p className="text-xs text-muted-foreground">
            {sent ? "This deal is marked as sent. " : opened ? "Sent it? Mark the deal as sent. " : ""}
            Gmail opens a filled-in draft{opp.contact?.email ? ` to ${opp.contact.email}` : ""}; you check it and press Send there. Gmail drafts from other apps can&apos;t carry attachments, so FlowHub links the files from your Drive, and Gmail offers to share them with the recipient when you send. A Word or PowerPoint copy is saved to your FlowHub folder in Drive.
          </p>
        </div>
      </div>
    </Card>
  );
}

function ChoiceRow({ label, value, onChange, options, missing }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string; available: boolean }[]; missing: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold",
              value === option.value ? "border-ink bg-primary text-primary-foreground" : "border-ink/20",
              !option.available && "cursor-not-allowed opacity-50",
            )}
          >
            <input type="radio" name={label} value={option.value} checked={value === option.value} disabled={!option.available} onChange={() => onChange(option.value)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
      {missing ? <span className="pl-[4.375rem] text-[11px]">{missing}</span> : null}
    </div>
  );
}

function MissingHint({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-link hover:underline">
      {text} →
    </button>
  );
}
