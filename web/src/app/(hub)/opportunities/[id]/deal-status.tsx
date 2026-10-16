"use client";

import { useActionState, useState, useTransition } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Opportunity } from "@/lib/schema";
import { type GateResult, recordOutcome, setOpportunityStatus } from "./actions";
import { OUTCOME_REASONS } from "./shared";

const SELECT = "h-8 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * FR-OPP-2 and FR-OUT-1: a person marks the proposal as sent, or records how
 * the deal ended. The agents never change these.
 */
export function DealStatus({ opp }: { opp: Opportunity }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, action] = useActionState<GateResult, FormData>(async (previous, formData) => {
    const result = await recordOutcome(opp.id, previous, formData);
    if (!result.error) setOpen(false);
    return result;
  }, {});

  const markSent = () =>
    startTransition(async () => {
      const result = await setOpportunityStatus(opp.id, "sent");
      setError(result.error ?? null);
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {opp.status === "proposing" && opp.latestDoc ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={markSent}>
            {pending ? "Saving…" : "Mark as sent"}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {opp.outcome ? "Change the outcome" : "Record the outcome"}
        </Button>
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      {open ? (
        <form action={action} className="flex w-full max-w-md flex-col gap-2.5 rounded-xl border bg-card p-3 text-sm shadow-sm">
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 font-semibold">How did it end?</legend>
            {(
              [
                ["won", "Won"],
                ["lost", "Lost"],
                ["no_decision", "No decision"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-center gap-1.5">
                <input type="radio" name="result" value={value} defaultChecked={(opp.outcome?.result ?? "won") === value} />
                {text}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="outcome-reason">Main reason</Label>
              <select id="outcome-reason" name="reason" defaultValue={OUTCOME_REASONS.find((reason) => reason === opp.outcome?.reason) ?? "Fit"} className={SELECT}>
                {OUTCOME_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="outcome-value">Value (optional)</Label>
              <Input id="outcome-value" name="value" defaultValue={opp.value ?? ""} maxLength={80} placeholder="RM 48,000" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="outcome-note">Note (optional)</Label>
            <Input id="outcome-note" name="note" defaultValue={opp.outcome?.note ?? ""} maxLength={500} placeholder="They chose a cheaper local provider." />
          </div>
          {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
          <div className="flex gap-2">
            <PendingButton size="sm" pendingLabel="Saving…">
              Save the outcome
            </PendingButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
