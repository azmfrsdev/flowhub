"use client";

import { Check, Copy, Mail, RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import { followUpText } from "@/lib/deal-room/follow-up";
import { useLiveDoc } from "@/lib/firebase/live";
import type { FollowUp, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { draftFollowUpEmail } from "./actions";
import { Card } from "./gate-parts";

/**
 * C3: the follow-up email after the proposal, ready to copy. It restates only
 * the proposal's own claims; code removed amounts and private results, and
 * marks any factual sentence with no claim behind it. FlowHub never sends it.
 */
export function FollowUpCard({ opp, run, canEdit }: { opp: Opportunity; run: Run; canEdit: boolean }) {
  const { data: followUp } = useLiveDoc<FollowUp>(`workspaces/${opp.workspaceId}/opportunities/${opp.id}/followUps/${run.id}`, null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const tone = run.inputs.options?.tone ?? "formal";
  const flagged = followUp?.paragraphs.flatMap((paragraph) => paragraph.sentences).filter((sentence) => sentence.flagged).length ?? 0;
  const restated = new Set(followUp?.paragraphs.flatMap((paragraph) => paragraph.sentences.flatMap((sentence) => sentence.claimIds)) ?? []).size;

  const draft = () =>
    startTransition(async () => {
      const result = await draftFollowUpEmail(opp.id, run.id);
      setError(result.error ?? null);
    });

  async function copy() {
    if (!followUp) return;
    try {
      await navigator.clipboard.writeText(followUpText(followUp));
      setCopied("Copied");
    } catch {
      setCopied("Your browser blocked copying. Try again.");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <Card
      title="Follow-up email"
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
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              Copy
            </Button>
            {canEdit ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={draft}>
                <RotateCw aria-hidden="true" />
                {pending ? "Drafting…" : "Draft again"}
              </Button>
            ) : null}
          </span>
        ) : null
      }
    >
      {followUp ? (
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
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
          </div>
          <p className="text-xs text-muted-foreground">
            Restates {restated} {restated === 1 ? "claim" : "claims"} from the proposal, in the {followUp.tone} tone.
            {followUp.removed ? ` Code removed ${followUp.removed} ${followUp.removed === 1 ? "sentence" : "sentences"} with an amount or a private result.` : ""}
            {flagged ? ` ${flagged} highlighted ${flagged === 1 ? "sentence has" : "sentences have"} no claim behind ${flagged === 1 ? "it" : "them"}: check before you send.` : ""} FlowHub never sends email: copy it into your own.
          </p>
        </div>
      ) : (
        <div className={cn("flex flex-wrap items-center gap-3 px-5 py-4 text-sm", !canEdit && "text-muted-foreground")}>
          <Mail aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-muted-foreground">
            A short email to {opp.contact?.name ?? "the prospect"} after you send the proposal, in the {tone} tone. It restates only what the proposal says, and never states a price. FlowHub never sends it.
          </span>
          {canEdit ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={draft}>
              <Mail aria-hidden="true" />
              {pending ? "Drafting…" : "Draft the email"}
            </Button>
          ) : null}
        </div>
      )}
      {error ? <p className="px-5 pb-3 text-sm text-destructive">{error}</p> : null}
    </Card>
  );
}
