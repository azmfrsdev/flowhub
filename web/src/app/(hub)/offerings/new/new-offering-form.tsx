"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type NewOfferingState, createOffering } from "./actions";

const TYPES = [
  { value: "service", label: "Service", hint: "Work you do for a client" },
  { value: "package", label: "Package", hint: "A fixed bundle at a set price" },
  { value: "product", label: "Product", hint: "Something you sell or resell" },
] as const;

export function NewOfferingForm() {
  const [state, action] = useActionState<NewOfferingState, FormData>(createOffering, {});
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={action} noValidate className="flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={values.name} placeholder="e.g. Cloud cost review" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} required />
        {errors.name ? (
          <p id="name-error" className="text-xs text-destructive">
            {errors.name}
          </p>
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map((type) => (
            <label key={type.value} className="flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm has-checked:border-ink has-checked:bg-accent/40">
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="type" value={type.value} defaultChecked={(values.type ?? "service") === type.value} className="accent-primary" />
                {type.label}
              </span>
              <span className="text-xs text-muted-foreground">{type.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="summary">
          Summary <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="summary"
          name="summary"
          rows={2}
          defaultValue={values.summary}
          placeholder="One or two sentences a client would understand."
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {errors.summary ? <p className="text-xs text-destructive">{errors.summary}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner">
          Owner <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="owner" name="owner" defaultValue={values.owner} placeholder="Who looks after it" />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <PendingButton pendingLabel="Creating…">Create offering</PendingButton>
        <Button asChild variant="ghost">
          <Link href="/offerings">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
