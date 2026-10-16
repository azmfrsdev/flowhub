"use client";

import { useState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import type { SampleSeller } from "@/lib/schema";
import { switchSample } from "./actions";

type Option = { seller: SampleSeller; name: string; sells: string };

/** FR-WS-4: pick another sample company, then confirm before this workspace is replaced. */
export function SwitchSample({ current, options }: { current: string; options: Option[] }) {
  const [chosen, setChosen] = useState<Option | null>(null);

  if (!chosen) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button key={option.seller} type="button" variant="outline" size="sm" onClick={() => setChosen(option)}>
            Switch to {option.name}
            <span className="text-muted-foreground">({option.sells.toLowerCase()})</span>
          </Button>
        ))}
      </div>
    );
  }

  return (
    <form action={switchSample} className="flex flex-col gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <input type="hidden" name="seller" value={chosen.seller} />
      <p>
        <b>Replace {current} with {chosen.name}?</b> {current} and everything you added to it, such as opportunities, notes and edits,
        will no longer be shown. Today&apos;s usage carries over.
      </p>
      <div className="flex flex-wrap gap-2">
        <PendingButton size="sm" variant="destructive" pendingLabel={`Setting up ${chosen.name}…`}>
          Replace with {chosen.name}
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
