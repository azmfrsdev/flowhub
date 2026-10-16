"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScopeFormState } from "./actions";

type Action = (state: ScopeFormState, formData: FormData) => Promise<ScopeFormState>;

function useInlineForm(action: Action) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, {});
  // Close after a successful save: compare during render rather than in an effect.
  const [savedAt, setSavedAt] = useState(state.ok);
  if (state.ok !== savedAt) {
    setSavedAt(state.ok);
    if (state.ok) setOpen(false);
  }
  return { open, setOpen, state, formAction };
}

/** "Add to scope": a feature typed by hand (ADR-0009 D3). */
export function AddFeature({ action }: { action: Action }) {
  const form = useInlineForm(action);
  if (!form.open)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => form.setOpen(true)}>
        <Plus aria-hidden="true" />
        Add to scope
      </Button>
    );
  return (
    <form action={form.formAction} className="flex w-full flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feature-name">Feature</Label>
          <Input id="feature-name" name="name" maxLength={120} required autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feature-description">What it covers</Label>
          <Input id="feature-description" name="description" maxLength={500} />
        </div>
      </div>
      {form.state.error ? <p className="text-xs text-destructive">{form.state.error}</p> : null}
      <div className="flex gap-2">
        <PendingButton size="sm" pendingLabel="Adding…">
          Add
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => form.setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** "Add an exclusion": what you don't do, and what to offer instead. */
export function AddExclusion({ action, partners }: { action: Action; partners: { id: string; name: string; relationship: string }[] }) {
  const form = useInlineForm(action);
  if (!form.open)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => form.setOpen(true)}>
        <Plus aria-hidden="true" />
        Add an exclusion
      </Button>
    );
  return (
    <form action={form.formAction} className="flex w-full flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exclusion-statement">We don&apos;t do</Label>
          <Input id="exclusion-statement" name="statement" maxLength={200} placeholder="e.g. Hardware supply or installation" required autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exclusion-partner">
            Partner who covers it <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <select
            id="exclusion-partner"
            name="partnerId"
            defaultValue=""
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">None</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name} ({partner.relationship})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exclusion-instead">
          What we offer instead <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="exclusion-instead" name="insteadText" maxLength={300} placeholder="e.g. Quoted separately, in man-days" />
      </div>
      {form.state.error ? <p className="text-xs text-destructive">{form.state.error}</p> : null}
      <div className="flex gap-2">
        <PendingButton size="sm" pendingLabel="Adding…">
          Add
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => form.setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
