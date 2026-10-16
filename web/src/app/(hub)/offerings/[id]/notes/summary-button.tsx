"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { writeNotesSummary } from "./actions";

/** FR-OFR-8: asks for the summary on demand, so it costs an AI run only when someone wants it. */
export function SummaryButton({ offeringId, label }: { offeringId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await writeNotesSummary(offeringId);
            setError(result.error ?? null);
          })
        }
      >
        <Sparkles aria-hidden="true" />
        {pending ? "Reading the notes…" : label}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
