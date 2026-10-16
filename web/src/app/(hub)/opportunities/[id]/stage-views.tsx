"use client";

import { useActionState } from "react";
import { AiMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntakeOutput, Opportunity, Run } from "@/lib/schema";
import { type GateResult, confirmProspect } from "./actions";
import { Approved, Card } from "./gate-parts";

/* ---------------- Gate A: intake ---------------- */

export function IntakeView({ opp, run, working, editable }: { opp: Opportunity; run: Run; working: IntakeOutput; editable: boolean }) {
  const [state, action] = useActionState<GateResult, FormData>(confirmProspect.bind(null, opp.id, run.id, run.rev), {});
  const prospect = working.prospect;
  return (
    <>
      <Card title="What came in" marker={<AiMarker>Intake</AiMarker>}>
        <dl className="grid gap-x-6 gap-y-2.5 px-4 py-4 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Came in as</dt>
          <dd className="capitalize">{working.intakeType.replace(/_/g, " ")}</dd>
          {working.askingFor.length ? (
            <>
              <dt className="text-muted-foreground">Asking for</dt>
              <dd>{working.askingFor.join("; ")}</dd>
            </>
          ) : null}
          {working.contacts.length ? (
            <>
              <dt className="text-muted-foreground">People</dt>
              <dd>{working.contacts.map((contact) => [contact.name, contact.role].filter(Boolean).join(", ")).join("; ")}</dd>
            </>
          ) : null}
          {working.meeting ? (
            <>
              <dt className="text-muted-foreground">Meeting</dt>
              <dd>{working.meeting}</dd>
            </>
          ) : null}
          {working.deadlines.length ? (
            <>
              <dt className="text-muted-foreground">Deadlines</dt>
              <dd>{working.deadlines.join("; ")}</dd>
            </>
          ) : null}
          {working.budgetSignals.length ? (
            <>
              <dt className="text-muted-foreground">Budget signals</dt>
              <dd>{working.budgetSignals.join("; ")}</dd>
            </>
          ) : null}
        </dl>
        {working.requirements.length ? (
          <div className="border-t px-4 py-3">
            <h3 className="mb-2 text-sm font-semibold">What they need</h3>
            <ol className="flex flex-col gap-1.5 text-sm">
              {working.requirements.map((requirement) => (
                <li key={requirement.id} className="flex gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{requirement.id}</span>
                  <span>
                    {requirement.text}
                    {requirement.sourceLine ? (
                      <span className="block text-xs text-muted-foreground">
                        &ldquo;{requirement.sourceLine}&rdquo;
                        {requirement.page ? (
                          <span
                            title={requirement.pageChecked ? "Code found these words on this page of the PDF." : "A scanned page: the page number is Gemini's and wasn't checked."}
                            className="ml-1.5 rounded border bg-card px-1 py-px font-medium whitespace-nowrap text-foreground"
                          >
                            PDF p.{requirement.page}
                            {requirement.pageChecked ? "" : " · unchecked"}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </Card>

      {editable ? (
        <form action={action} className="flex flex-col gap-4 rounded-xl border-2 border-attention/40 bg-card px-4 py-4">
          <span className="text-xs font-bold tracking-wider text-attention uppercase">Gate A · confirm the prospect</span>
          {working.needsCompany ? (
            <p className="rounded-lg bg-attention-soft px-3 py-2 text-sm text-attention">
              Intake couldn&apos;t identify a company, and it won&apos;t guess one. Enter the company&apos;s name and website before research starts.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Check this is the right company. Research runs on exactly what you confirm here.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-name">Company</Label>
              <Input id="p-name" name="name" defaultValue={prospect?.name} required maxLength={160} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-site">Website</Label>
              <Input id="p-site" name="website" defaultValue={prospect?.website} placeholder="example.com.my" maxLength={200} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-country">Country code</Label>
              <Input id="p-country" name="country" defaultValue={prospect?.country} placeholder="MY" maxLength={2} className="w-24 uppercase" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="p-line">What they do</Label>
              <textarea
                id="p-line"
                name="oneLine"
                rows={2}
                defaultValue={prospect?.oneLine}
                maxLength={300}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div>
            <PendingButton pendingLabel="Starting research…">Research this prospect</PendingButton>
          </div>
        </form>
      ) : (
        <Approved run={run} gate="Gate A" />
      )}
    </>
  );
}

