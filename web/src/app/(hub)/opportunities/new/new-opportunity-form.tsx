"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type NewOpportunityState, createOpportunity } from "./actions";

export function NewOpportunityForm({ offerings }: { offerings: { id: string; name: string }[] }) {
  const [state, action] = useActionState<NewOpportunityState, FormData>(createOpportunity, {});
  const values = state.values ?? {};
  return (
    <form action={action} noValidate className="flex flex-col gap-5 px-5 py-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="text">What came in</Label>
        <textarea
          id="text"
          name="text"
          rows={9}
          maxLength={20000}
          defaultValue={values.text}
          placeholder={"Paste a meeting invite or an email.\n\nFor example: \"Hi, we're a 40-store retailer looking to move our web shop off our own servers before the year-end sale…\""}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">
          Attach a file <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg,.eml,.txt,message/rfc822,text/plain"
          aria-describedby="file-hint"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
        />
        <p id="file-hint" className="text-xs text-muted-foreground">
          An RFP or brief as a PDF, a screenshot, or a saved email (.eml). Up to 20 MB.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="url">
          Company website <span className="font-normal text-muted-foreground">(optional, or on its own)</span>
        </Label>
        <Input id="url" name="url" type="url" defaultValue={values.url} placeholder="example.com.my" />
      </div>
      {offerings.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            Interested in <span className="font-normal text-muted-foreground">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {offerings.map((offering) => (
              <label key={offering.id} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-accent/50">
                <input type="checkbox" name="offerings" value={offering.id} defaultChecked={values.offerings?.includes(offering.id)} className="accent-primary" />
                {offering.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <PendingButton pendingLabel="Starting intake…">Start intake</PendingButton>
        <Button asChild variant="ghost">
          <Link href="/opportunities">Cancel</Link>
        </Button>
        <span className="text-sm text-muted-foreground">Intake reads it in a few seconds, a long PDF in under a minute. Nothing is researched until you confirm the company.</span>
      </div>
    </form>
  );
}
