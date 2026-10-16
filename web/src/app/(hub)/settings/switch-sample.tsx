"use client";

import { useActionState, useState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SampleSeller } from "@/lib/schema";
import { type DeleteState, deleteWorkspace, switchSample } from "./actions";

type Option = { seller: SampleSeller; name: string; sells: string };

/**
 * FR-WS-4: pick another sample company, then confirm before this workspace is
 * replaced. FR-WS-5: or reset this one to how it first loaded.
 */
export function SwitchSample({ current, currentSeller, workspaceId, options }: { current: string; currentSeller: SampleSeller; workspaceId: string; options: Option[] }) {
  const [chosen, setChosen] = useState<(Option & { reset?: boolean }) | null>(null);

  if (!chosen) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setChosen({ seller: currentSeller, name: current, sells: "", reset: true })}>
          Reset {current}
        </Button>
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
      {chosen.reset ? (
        <>
          <input type="hidden" name="reset" value="1" />
          <input type="hidden" name="workspaceId" value={workspaceId} />
        </>
      ) : null}
      <p>
        {chosen.reset ? (
          <>
            <b>Reset {current} to the original sample?</b> Everything you added to it, such as opportunities, notes and edits, will no
            longer be shown. Today&apos;s usage carries over.
          </>
        ) : (
          <>
            <b>Replace {current} with {chosen.name}?</b> {current} and everything you added to it, such as opportunities, notes and edits,
            will no longer be shown. Today&apos;s usage carries over.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <PendingButton size="sm" variant="destructive" pendingLabel={chosen.reset ? `Resetting ${current}…` : `Setting up ${chosen.name}…`}>
          {chosen.reset ? `Reset ${current}` : `Replace with ${chosen.name}`}
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** FR-WS-7: the Owner deletes the workspace for good, after typing its name. */
export function DeleteWorkspace({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DeleteState, FormData>(deleteWorkspace, {});

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start text-destructive" onClick={() => setOpen(true)}>
        Delete this workspace
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p>
        <b>Delete {name} for good?</b> Its offerings, opportunities, notes, uploaded files and history are removed, with any sample copies it
        replaced. This can&apos;t be undone. Docs already in your Google Drive stay there.
      </p>
      <label htmlFor="confirm-delete" className="text-muted-foreground">
        Type <b className="text-foreground">{name}</b> to confirm
      </label>
      <Input id="confirm-delete" name="confirm" autoComplete="off" className="max-w-72" />
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
      <div className="flex flex-wrap gap-2">
        <PendingButton size="sm" variant="destructive" pendingLabel="Deleting…">
          Delete for good
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
