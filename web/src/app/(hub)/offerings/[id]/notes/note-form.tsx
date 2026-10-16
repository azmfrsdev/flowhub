"use client";

import { useActionState, useEffect, useRef } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Label } from "@/components/ui/label";
import type { NoteFormState } from "./actions";

export function NoteForm({ action }: { action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState> }) {
  const [state, formAction] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-2.5 px-4 py-4">
      <Label htmlFor="note-text" className="font-semibold">
        Add a note
      </Label>
      <textarea
        id="note-text"
        name="text"
        rows={3}
        maxLength={4000}
        placeholder="What did you learn about selling this offering?"
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "note-error" : undefined}
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.error ? (
        <p id="note-error" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Notes stay inside your workspace. The agents can read them as your own statements.</span>
        <span className="flex-1" />
        <PendingButton size="sm" pendingLabel="Adding…">
          Add note
        </PendingButton>
      </div>
    </form>
  );
}
