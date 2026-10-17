"use client";

import { Download, ExternalLink, ImageOff, Presentation, RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { photoCredit } from "@/lib/deal-room/deck";
import { driveTokenError, requestDriveToken } from "@/lib/firebase/drive-token";
import { useLiveDoc } from "@/lib/firebase/live";
import type { ClientDeck, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { openDeckInSlides, removeDeckPhotos, writeDeck } from "./actions";
import { Card } from "./gate-parts";

/**
 * PRD 7.22, ADR-0015: the approved proposal as a client deck, in the house
 * style. Opens as Google Slides in the person's own Drive, or downloads as a
 * .pptx. The deck restates only the proposal; code builds the fit, the prices
 * and the proof, and credits every photo.
 */
export function DeckCard({ opp, run, canEdit }: { opp: Opportunity; run: Run; canEdit: boolean }) {
  const { data: deck } = useLiveDoc<ClientDeck>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/decks/${run.id}`, null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"slides" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stale = deck ? deck.rev !== run.rev : false;
  const photos = deck ? [deck.photos.title, deck.photos.proof].filter((photo): photo is NonNullable<typeof photo> => photo !== null) : [];

  const write = () =>
    startTransition(async () => {
      const result = await writeDeck(opp.id, run.id);
      setError(result.error ?? null);
    });

  const dropPhotos = () =>
    startTransition(async () => {
      const result = await removeDeckPhotos(opp.id, run.id);
      setError(result.error ?? null);
    });

  async function openSlides() {
    setBusy("slides");
    setError(null);
    try {
      const token = await requestDriveToken();
      const result = await openDeckInSlides(opp.id, run.id, token);
      setError(result.error ?? null);
      if (result.url) window.open(result.url, "_blank", "noopener");
    } catch (err) {
      setError(driveTokenError(err, "Google Slides didn't work this time. Download the .pptx, or try again."));
    }
    setBusy(null);
  }

  return (
    <Card
      title="Client deck"
      marker={
        <>
          <AiMarker>Restates the proposal only</AiMarker>
          <CalcMarker>Fit, prices and proof by code</CalcMarker>
        </>
      }
      action={
        deck && canEdit ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={write}>
            <RotateCw aria-hidden="true" />
            {pending ? "Writing…" : "Write again"}
          </Button>
        ) : null
      }
    >
      {deck ? (
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Slides in the deck">
            {slideTiles(deck).map((tile, index) => (
              <li key={tile.title} className={cn("flex aspect-video flex-col overflow-hidden rounded-md border text-[10px] leading-tight", tile.dark ? "border-[#121C4A] bg-[#121C4A] text-white" : "bg-white text-[#1F2430]")}>
                {tile.dark ? null : <span className="truncate bg-[#1B2A6B] px-1.5 py-1 font-bold text-white">{tile.title}</span>}
                <span className="flex flex-1 flex-col gap-0.5 p-1.5">
                  {tile.dark ? <span className="line-clamp-2 text-[11px] font-bold">{tile.title}</span> : null}
                  <span className={cn("line-clamp-3", tile.dark ? "text-[#C9D3F0]" : "text-[#5A6480]")}>{tile.detail}</span>
                </span>
                <span className={cn("px-1.5 pb-1 text-right text-[9px]", tile.dark ? "text-[#9FB0DE]" : "text-[#9AA2B4]")}>{index + 1}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            {deck.slides ? (
              <Button asChild size="sm">
                <a href={deck.slides.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open in Google Slides
                </a>
              </Button>
            ) : null}
            {canEdit ? (
              <Button type="button" size="sm" variant={deck.slides ? "outline" : "default"} disabled={busy !== null || stale} onClick={openSlides}>
                <Presentation aria-hidden="true" />
                {busy === "slides" ? "Creating the Slides…" : deck.slides ? "Create in Slides again" : "Create in Google Slides"}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <a href={`/api/decks/${opp.id}/${run.id}`} download>
                <Download aria-hidden="true" />
                Download .pptx
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            8 slides with speaker notes, in your deck house style.
            {deck.dropped ? ` Code dropped ${deck.dropped} ${deck.dropped === 1 ? "item" : "items"} with no proposal claim behind ${deck.dropped === 1 ? "it" : "them"}, an amount or a private result.` : ""} FlowHub never shares or sends the deck.
          </p>
          {stale ? <p className="text-xs font-semibold text-attention">The draft changed after this deck was written. Write it again before you present it.</p> : null}
          {photos.length ? (
            <div className="flex flex-col gap-1 rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                Photos, openly licensed and credited on their slides
                {canEdit ? (
                  <button type="button" disabled={pending} onClick={dropPhotos} className="ml-auto inline-flex items-center gap-1 font-normal text-link hover:underline">
                    <ImageOff aria-hidden="true" className="size-3.5" />
                    Remove photos
                  </button>
                ) : null}
              </span>
              {photos.map((photo) => (
                <span key={photo.url} className="break-words">
                  {photoCredit(photo)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={cn("flex flex-wrap items-center gap-3 px-5 py-4 text-sm", !canEdit && "text-muted-foreground")}>
          <Presentation aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-muted-foreground">
            Turn this proposal into an 8-slide deck to present to {opp.prospect?.name ?? "the prospect"}: what you heard, where you fit, scope, timeline, prices and proof, with speaker notes. Opens in Google Slides or downloads as a .pptx.
          </span>
          {canEdit ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={write}>
              <Presentation aria-hidden="true" />
              {pending ? "Writing the deck… about a minute" : "Write the client deck"}
            </Button>
          ) : null}
        </div>
      )}
      {error ? <p className="px-5 pb-3 text-sm text-destructive">{error}</p> : null}
    </Card>
  );
}

function slideTiles(deck: ClientDeck): { title: string; detail: string; dark?: boolean }[] {
  const subtotals = deck.investment.groups.flatMap((group) => (group.subtotal ? [`${group.title}: ${group.subtotal}`] : []));
  return [
    { title: deck.title.prospect, detail: deck.title.headline, dark: true },
    { title: "What we heard", detail: deck.heard.standfirst?.text ?? deck.heard.today[0]?.text ?? "" },
    { title: "Where we fit", detail: deck.fit.needs.map((need) => `${need.text} → ${need.offerings[0]?.name}`).join(" · ") },
    { title: "What we'll deliver", detail: deck.deliver.cards.map((card) => card.title).join(" · ") },
    { title: "How we'll deliver", detail: deck.plan.phases.map((phase) => phase.name).join(" → ") },
    { title: "Investment", detail: subtotals.join(" · ") || `${deck.investment.groups.reduce((sum, group) => sum + group.lines.length, 0)} price lines` },
    { title: "Proof", detail: deck.proof.map((item) => item.title).join(" · ") || "Case studies on request" },
    { title: deck.next.headline, detail: deck.next.steps.map((step) => step.text).join(" · "), dark: true },
  ];
}
