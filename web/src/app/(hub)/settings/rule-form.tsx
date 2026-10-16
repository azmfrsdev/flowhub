"use client";

import { Plus } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type RuleFormState, addSellingRule } from "./actions";

const KINDS = [
  { value: "region", label: "Region", hint: "Country codes, e.g. MY, SG" },
  { value: "min_deal_size", label: "Minimum deal size", hint: "The amount, e.g. 20000" },
  { value: "industry", label: "Industry", hint: "Industries you won't serve, e.g. tobacco, gambling" },
  { value: "integration", label: "Integration", hint: "Systems you don't integrate with" },
  { value: "other", label: "Other", hint: "Keywords the agents can match on" },
] as const;

export function SellingRuleForm() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("region");
  const [state, action] = useActionState<RuleFormState, FormData>(addSellingRule, {});
  const form = useRef<HTMLFormElement>(null);
  // Close after a successful save: compare during render rather than in an effect.
  const [savedAt, setSavedAt] = useState(state.ok);
  if (state.ok !== savedAt) {
    setSavedAt(state.ok);
    if (state.ok) setOpen(false);
  }

  if (!open)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Add a rule
      </Button>
    );

  return (
    <form ref={form} action={action} className="flex w-full flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-kind">Kind</Label>
          <select
            id="rule-kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-statement">The rule</Label>
          <Input id="rule-statement" name="statement" maxLength={200} placeholder="e.g. Malaysia and Singapore only." required autoFocus />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rule-values">
          Values <span className="font-normal text-muted-foreground">(optional, comma-separated)</span>
        </Label>
        <Input id="rule-values" name="values" maxLength={300} placeholder={KINDS.find((option) => option.value === kind)?.hint} />
      </div>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <PendingButton size="sm" pendingLabel="Adding…">
          Add rule
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
