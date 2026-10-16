"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRIES, CURRENCIES } from "@/lib/schema/workspace";
import { type SetupFormState, createOwnWorkspace } from "./actions";
import { PendingButton } from "@/components/flowhub/pending-button";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** FR-WS-2: the short form. The persona is fixed to SME in this build (PRD 7.0). */
export function OwnCompanyForm() {
  const [state, action] = useActionState<SetupFormState, FormData>(createOwnWorkspace, {});
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={action} className="flex flex-col gap-4 px-5 py-6" noValidate>
      <Field id="name" label="Company name" error={errors.name}>
        <Input id="name" name="name" defaultValue={values.name} placeholder="e.g. Kelapa Cloud Sdn Bhd" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} required />
      </Field>
      <Field id="website" label="Website" optional error={errors.website}>
        <Input id="website" name="website" type="url" defaultValue={values.website} placeholder="https://" aria-invalid={Boolean(errors.website)} aria-describedby={errors.website ? "website-error" : undefined} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="country" label="Country" error={errors.country}>
          <select id="country" name="country" defaultValue={values.country ?? "MY"} className={selectClass}>
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="currency" label="Default currency" error={errors.currency}>
          <select id="currency" name="currency" defaultValue={values.currency ?? "MYR"} className={selectClass}>
            {CURRENCIES.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">Who do you usually sell to?</legend>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          <span className="rounded-md bg-card px-3 py-1 font-semibold shadow-xs">SME proposal</span>
          <span className="px-3 py-1 text-muted-foreground">Startup pilot</span>
          <span className="px-3 py-1 text-muted-foreground">Enterprise tender</span>
        </div>
        <p className="text-xs text-muted-foreground">This build writes SME proposals. Startup and enterprise templates come later.</p>
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <PendingButton variant="outline" pendingLabel="Creating…">
          Create empty workspace
        </PendingButton>
        <span className="text-sm text-muted-foreground">Then add your offerings.</span>
      </div>
    </form>
  );
}

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
