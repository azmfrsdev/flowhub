"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pricingGroups } from "@/lib/deal-room/pricing-groups";
import type { FitOutput, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { type GateResult, addGap, addMapping, changePriceTier, removeGap, removeMapping, removePriceLine, setCustomisation, setMappingStrength, writeProposal } from "./actions";
import { Approved, Card, RowRemove } from "./gate-parts";
import type { Catalogue } from "./shared";

type Strength = "strong" | "partial" | "weak";
const RANK: Record<Strength, number> = { strong: 3, partial: 2, weak: 1 };
const TONE = {
  strong: { line: "bg-fit-strong", pill: "border-fit-strong text-fit-strong", soft: "bg-fit-strong-soft text-fit-strong" },
  partial: { line: "bg-fit-partial", pill: "border-fit-partial text-fit-partial", soft: "bg-fit-partial-soft text-fit-partial" },
  weak: { line: "bg-fit-weak", pill: "border-fit-weak text-fit-weak", soft: "bg-fit-weak-soft text-fit-weak" },
  cannot: { line: "bg-fit-cannot", pill: "border-fit-cannot text-fit-cannot", soft: "bg-fit-cannot-soft text-fit-cannot" },
  none: { line: "bg-line-soft", pill: "border-border text-muted-foreground", soft: "bg-muted text-muted-foreground" },
} as const;
const BAND = { go: { label: "Go", tone: "text-score-go", ring: "var(--color-score-go)" }, consider: { label: "Consider", tone: "text-score-consider", ring: "var(--color-score-consider)" }, nogo: { label: "No-go", tone: "text-score-nogo", ring: "var(--color-score-nogo)" } } as const;

const label = (gapId: string) => gapId.toUpperCase();
const origin = (gap: FitOutput["gaps"][number]) =>
  gap.origin.kind === "intake" ? (gap.origin.ref === "prospect" ? "a selling rule" : `what came in · ${gap.origin.ref}`) : gap.origin.kind === "note" ? "a seller note" : gap.origin.kind === "person" ? `${gap.origin.ref}, at Gate C` : "the brief";
const SELECT = "h-7 rounded-md border border-input bg-card px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
type Mapping = FitOutput["mappings"][number];

/** Gate C (FR-FIT-1 to FR-FIT-8): the fit map, the score, and pricing. */
export function FitView({ opp, run, working, catalogue, editable, canWrite }: { opp: Opportunity; run: Run; working: FitOutput; catalogue: Catalogue; editable: boolean; canWrite: boolean }) {
  const [view, setView] = useState<"map" | "list">("map");

  return (
    <>
      <Card
        title="Fit map"
        marker={
          <>
            {run.state === "waiting" ? <AiMarker waiting>Fit Analyst · waiting for you</AiMarker> : <AiMarker>Fit Analyst</AiMarker>}
            <CalcMarker>Selling rules checked first</CalcMarker>
          </>
        }
        action={
          <div role="group" aria-label="Fit map view" className="flex rounded-lg bg-muted p-0.5 text-[12.5px]">
            {(["map", "list"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} className={cn("rounded-md px-2.5 py-0.5 font-semibold capitalize", view === option ? "bg-card shadow-xs" : "text-muted-foreground")}>
                {option}
              </button>
            ))}
          </div>
        }
      >
        {view === "map" ? <FitMap opp={opp} run={run} working={working} catalogue={catalogue} editable={editable} /> : <FitList working={working} catalogue={catalogue} />}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ScoreCard working={working} edited={(run.output as FitOutput | null)?.score.value !== working.score.value} />
        <PricingCard opp={opp} run={run} working={working} catalogue={catalogue} editable={editable} />
      </div>

      {editable || (canWrite && run.state === "approved" && opp.stages.fit.state === "approved" && ["idle", "stale"].includes(opp.stages.write.state)) ? <WriteForm opp={opp} run={run} /> : <Approved run={run} gate="Gate C" />}
    </>
  );
}

/** Gate C (FR-WRI-3): tone and up to 500 characters of instructions, then the Writer and Reviewer start. */
function WriteForm({ opp, run }: { opp: Opportunity; run: Run }) {
  const [state, action] = useActionState<GateResult, FormData>(writeProposal.bind(null, opp.id, run.id, run.rev), {});
  const [length, setLength] = useState(0);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border-2 border-attention/40 bg-attention-soft/40 px-4 py-3">
      <div className="flex flex-col">
        <span className="text-xs font-bold tracking-wider text-attention uppercase">Gate C · your decision</span>
        <span className="text-sm text-muted-foreground">
          {run.state === "waiting" ? "Change a fit, add or remove a need, an offering or a price line, and the score updates. " : ""}Writing the proposal starts the Writer and the Reviewer. About a minute.
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tone">Tone</Label>
          <select id="tone" name="tone" defaultValue="formal" className="h-8 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            <option value="formal">Formal</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="instructions">
            Instructions for the Writer <span className="font-normal text-muted-foreground">(optional, {500 - length} characters left)</span>
          </Label>
          <textarea
            id="instructions"
            name="instructions"
            rows={2}
            maxLength={500}
            onChange={(event) => setLength(event.target.value.length)}
            placeholder="Lead with the sale-day problem. Keep pricing to the Growth tier."
            className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <PendingButton pendingLabel="Starting the Writer…">Write the proposal</PendingButton>
      </div>
    </form>
  );
}

/** FR-FIT-8: needs on the left, offerings on the right, joined by a line coloured by strength. */
function FitMap({ opp, run, working, catalogue, editable }: { opp: Opportunity; run: Run; working: FitOutput; catalogue: Catalogue; editable: boolean }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="hidden grid-cols-[minmax(0,1fr)_120px_minmax(0,1.15fr)] text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase md:grid">
        <span>Their needs</span>
        <span />
        <span>Your offerings</span>
      </div>
      {working.gaps.map((gap) => {
        const mappings = working.mappings.filter((mapping) => mapping.gapId === gap.id).sort((a, b) => RANK[b.strength] - RANK[a.strength]);
        const cannot = working.cannotMeet.filter((item) => item.gapId === gap.id);
        const kind: keyof typeof TONE = cannot.length ? "cannot" : mappings.length ? mappings[0].strength : "none";
        const tone = TONE[kind];
        return (
          <div key={gap.id} className="grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.15fr)] md:gap-0">
            <div className="flex flex-col gap-1 rounded-xl border-2 border-ink bg-card shadow-comic px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">
                  {label(gap.id)} · {gap.priority} · from {origin(gap)}
                </span>
                <span className="flex-1" />
                {editable ? <RowRemove action={() => removeGap(opp.id, run.id, run.rev, gap.id)} label={`Remove the need ${label(gap.id)}`} /> : null}
              </div>
              <b className="text-sm">{gap.text}</b>
            </div>
            <div className="relative hidden items-center justify-center md:flex" aria-hidden="true">
              <span className={cn("absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full", tone.line, (kind === "partial" || kind === "weak" || kind === "none") && "opacity-70")} />
              <span className={cn("relative rounded-full border-2 bg-card px-2.5 py-px text-[11.5px] font-bold capitalize", tone.pill)}>{kind === "cannot" ? "Cannot meet" : kind === "none" ? "No match" : kind}</span>
            </div>
            <div className="flex flex-col gap-2">
              {cannot.map((item) => {
                const rule = catalogue.constraints[item.constraint.id];
                return (
                  <div key={item.constraint.id} className="flex flex-col gap-1 rounded-xl border border-fit-cannot/35 bg-fit-cannot-soft/40 px-3 py-2.5 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-fit-cannot-soft px-2 py-px text-xs font-semibold text-fit-cannot">{rule?.companyWide ? "Selling rule" : "Not included"}</span>
                      {rule?.companyWide ? (
                        <Link href="/settings" className="text-link hover:underline">
                          {rule.statement}
                        </Link>
                      ) : rule?.offeringId ? (
                        <Link href={`/offerings/${rule.offeringId}/scope`} className="text-link hover:underline">
                          {rule.statement}
                        </Link>
                      ) : (
                        rule?.statement
                      )}
                    </span>
                    {item.partner ? <span className="text-xs">Consider partner {catalogue.partners[item.partner.id] ?? ""}, who covers it.</span> : null}
                  </div>
                );
              })}
              {mappings.map((mapping) => (
                <MappingCard key={mapping.target.id} opp={opp} run={run} mapping={mapping} catalogue={catalogue} editable={editable} showStrength={mappings.length > 1 || cannot.length > 0} />
              ))}
              {mappings.length === 0 && cannot.length === 0 && !editable ? <div className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Nothing you sell covers this</div> : null}
              {editable ? <AddMapping opp={opp} run={run} gapId={gap.id} catalogue={catalogue} taken={mappings.map((mapping) => mapping.target.id)} empty={mappings.length === 0 && cannot.length === 0} /> : null}
            </div>
          </div>
        );
      })}
      {editable ? <AddGap opp={opp} run={run} catalogue={catalogue} /> : null}
    </div>
  );
}

/** One offering meeting one need. At Gate C a person changes its strength, writes its customisation, or removes it (FR-FIT-7). */
function MappingCard({ opp, run, mapping, catalogue, editable, showStrength }: { opp: Opportunity; run: Run; mapping: Mapping; catalogue: Catalogue; editable: boolean; showStrength: boolean }) {
  const [pendingStrength, setPendingStrength] = useState<string | null>(null);
  const [strengthError, setStrengthError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteState, noteAction] = useActionState<GateResult, FormData>(async (previous, formData) => {
    const result = await setCustomisation(opp.id, run.id, run.rev, mapping.gapId, mapping.target.id, previous, formData);
    if (!result.error) setEditingNote(false);
    return result;
  }, {});
  const name = catalogue.offerings[mapping.target.id] ?? mapping.target.id;

  return (
    <div className="flex flex-col gap-1 rounded-xl border-2 border-ink bg-card shadow-comic px-3 py-2.5 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <Link href={`/offerings/${mapping.target.id}`} className="font-semibold text-link hover:underline">
          {name}
        </Link>
        {editable ? (
          <>
            <label htmlFor={`strength-${mapping.gapId}-${mapping.target.id}`} className="sr-only">
              How well {name} meets {label(mapping.gapId)}
            </label>
            <select
              id={`strength-${mapping.gapId}-${mapping.target.id}`}
              value={pendingStrength ?? mapping.strength}
              disabled={pendingStrength !== null}
              onChange={async (event) => {
                setPendingStrength(event.target.value);
                const result = await setMappingStrength(opp.id, run.id, run.rev, mapping.gapId, mapping.target.id, event.target.value as Strength);
                setStrengthError(result.error ?? null);
                setPendingStrength(null);
              }}
              className={cn(SELECT, "font-semibold", TONE[mapping.strength].pill)}
            >
              <option value="strong">Strong</option>
              <option value="partial">Partial</option>
              <option value="weak">Weak</option>
            </select>
          </>
        ) : showStrength ? (
          <span className={cn("rounded-full px-2 py-px text-[11px] font-semibold capitalize", TONE[mapping.strength].soft)}>{mapping.strength}</span>
        ) : null}
        {mapping.mappedBy ? <PersonMarker name={mapping.mappedBy} /> : null}
        <span className="flex-1" />
        {editable ? <RowRemove action={() => removeMapping(opp.id, run.id, run.rev, mapping.gapId, mapping.target.id)} label={`Remove ${name} from ${label(mapping.gapId)}`} /> : null}
      </span>
      {strengthError ? <span className="text-xs text-destructive">{strengthError}</span> : null}
      {mapping.featureRefs.length ? <span className="text-xs text-muted-foreground">{mapping.featureRefs.map((id) => catalogue.features[id] ?? id).join(", ")}</span> : null}
      {editingNote ? (
        <form action={noteAction} className="flex flex-wrap items-center gap-1.5">
          <label htmlFor={`cust-${mapping.gapId}-${mapping.target.id}`} className="sr-only">
            Customisation for {name}
          </label>
          <Input id={`cust-${mapping.gapId}-${mapping.target.id}`} name="customisation" defaultValue={mapping.customisation ?? ""} maxLength={300} placeholder="Add a 2-day sale-day load test." className="h-7 min-w-48 flex-1 text-xs" autoFocus />
          <PendingButton size="xs" variant="outline" pendingLabel="Saving…">
            Save
          </PendingButton>
          <Button type="button" size="xs" variant="ghost" onClick={() => setEditingNote(false)}>
            Cancel
          </Button>
          {noteState.error ? <span className="w-full text-xs text-destructive">{noteState.error}</span> : null}
        </form>
      ) : mapping.customisation ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs">
          <span>
            <b>{mapping.customisedBy ? "Customise:" : "Suggest:"}</b> {mapping.customisation}
          </span>
          {mapping.customisedBy ? <PersonMarker name={mapping.customisedBy} /> : null}
          {editable ? (
            <button type="button" onClick={() => setEditingNote(true)} className="text-link hover:underline">
              Edit
            </button>
          ) : null}
        </span>
      ) : editable ? (
        <button type="button" onClick={() => setEditingNote(true)} className="self-start text-xs text-link hover:underline">
          + Add a customisation note
        </button>
      ) : null}
      {mapping.proofRefs.length ? (
        <span className="flex flex-wrap gap-1">
          {mapping.proofRefs.map((proof) => (
            <span key={proof.id} className={cn("rounded-full px-2 py-px text-[11px]", proof.isPublic ? "bg-fit-strong-soft text-fit-strong" : "bg-private-soft text-private")}>
              {proof.isPublic ? "Proof" : "Not public, won't be cited"} · {catalogue.proof[proof.id] ?? proof.id}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Gate C (FR-FIT-7): map this need to another of your offerings. */
function AddMapping({ opp, run, gapId, catalogue, taken, empty }: { opp: Opportunity; run: Run; gapId: string; catalogue: Catalogue; taken: string[]; empty: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<GateResult, FormData>(async (previous, formData) => {
    const result = await addMapping(opp.id, run.id, run.rev, gapId, previous, formData);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  const choices = Object.entries(catalogue.offerings).filter(([id]) => !taken.includes(id)).sort((a, b) => a[1].localeCompare(b[1]));
  if (choices.length === 0) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn("self-start text-xs text-link hover:underline", empty && "rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground no-underline hover:text-link")}>
        {empty ? "Nothing you sell covers this. + Map it to an offering" : "+ Map it to another offering"}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed px-3 py-2">
      <label htmlFor={`add-${gapId}`} className="sr-only">
        Offering for {label(gapId)}
      </label>
      <select id={`add-${gapId}`} name="offeringId" className={cn(SELECT, "max-w-56")}>
        {choices.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <label htmlFor={`add-strength-${gapId}`} className="sr-only">
        How well it fits
      </label>
      <select id={`add-strength-${gapId}`} name="strength" defaultValue="partial" className={SELECT}>
        <option value="strong">Strong</option>
        <option value="partial">Partial</option>
        <option value="weak">Weak</option>
      </select>
      <PendingButton size="xs" variant="outline" pendingLabel="Adding…">
        Add
      </PendingButton>
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.error ? <span className="w-full text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

/** Gate C (FR-FIT-7): a need the person knows about that the agents missed. */
function AddGap({ opp, run, catalogue }: { opp: Opportunity; run: Run; catalogue: Catalogue }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<GateResult, FormData>(async (previous, formData) => {
    const result = await addGap(opp.id, run.id, run.rev, previous, formData);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        + Add a need
      </Button>
    );
  }
  const offerings = Object.entries(catalogue.offerings).sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-dashed px-3 py-3">
      <Label htmlFor="gap-text">A need they have</Label>
      <Input id="gap-text" name="text" maxLength={300} placeholder="They want the cut-over done before Chinese New Year." autoFocus />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label htmlFor="gap-priority">Priority</label>
        <select id="gap-priority" name="priority" defaultValue="medium" className={SELECT}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label htmlFor="gap-offering">Met by</label>
        <select id="gap-offering" name="offeringId" defaultValue="" className={cn(SELECT, "max-w-56")}>
          <option value="">Nothing yet</option>
          {offerings.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <label htmlFor="gap-strength" className="sr-only">
          How well it fits
        </label>
        <select id="gap-strength" name="strength" defaultValue="partial" className={SELECT}>
          <option value="strong">Strong</option>
          <option value="partial">Partial</option>
          <option value="weak">Weak</option>
        </select>
      </div>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
      <div className="flex gap-2">
        <PendingButton size="sm" pendingLabel="Adding…">
          Add the need
        </PendingButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The same information as a table, for screen readers and quick scanning (FR-FIT-8). */
function FitList({ working, catalogue }: { working: FitOutput; catalogue: Catalogue }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-semibold">Need</th>
            <th className="px-4 py-2 font-semibold">Priority</th>
            <th className="px-4 py-2 font-semibold">Mapped to</th>
            <th className="px-4 py-2 font-semibold">Fit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {working.gaps.map((gap) => {
            const mappings = working.mappings.filter((mapping) => mapping.gapId === gap.id);
            const cannot = working.cannotMeet.filter((item) => item.gapId === gap.id);
            return (
              <tr key={gap.id} className="align-top">
                <td className="px-4 py-2.5">
                  <b>{label(gap.id)}</b> {gap.text}
                  <span className="block text-xs text-muted-foreground">From {origin(gap)}</span>
                </td>
                <td className="px-4 py-2.5 capitalize">{gap.priority}</td>
                <td className="px-4 py-2.5">
                  {cannot.map((item) => (
                    <div key={item.constraint.id}>
                      Cannot meet: {catalogue.constraints[item.constraint.id]?.statement}
                      {item.partner ? ` Consider partner ${catalogue.partners[item.partner.id] ?? ""}.` : ""}
                    </div>
                  ))}
                  {mappings.map((mapping) => (
                    <div key={mapping.target.id}>
                      {catalogue.offerings[mapping.target.id] ?? mapping.target.id} ({mapping.strength})
                      {mapping.customisation ? <span className="block text-xs text-muted-foreground">{mapping.customisedBy ? "Customise" : "Suggest"}: {mapping.customisation}</span> : null}
                    </div>
                  ))}
                  {!mappings.length && !cannot.length ? <span className="text-muted-foreground">None</span> : null}
                </td>
                <td className="px-4 py-2.5 capitalize">{cannot.length ? "Cannot meet" : mappings.map((mapping) => mapping.strength).join(", ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreCard({ working, edited }: { working: FitOutput; edited: boolean }) {
  const { score } = working;
  const band = BAND[score.band];
  const bars = [
    { label: "Coverage", value: score.components.coverage, max: 100, text: String(score.components.coverage), tone: "bg-fit-strong" },
    { label: "Penalties", value: score.components.penalties, max: 45, text: `−${score.components.penalties}`, tone: "bg-fit-cannot" },
    { label: "Tech overlap", value: score.components.techBonus, max: 5, text: `+${score.components.techBonus}`, tone: "bg-ai" },
  ];
  return (
    <Card title="Go/no-go" marker={<CalcMarker>Calculated</CalcMarker>}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-5">
          <div role="img" aria-label={`Score ${score.value} out of 100, ${band.label}`} className="grid size-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${band.ring} ${score.value}%, var(--color-muted) 0)` }}>
            <div className="grid size-21 place-items-center rounded-full bg-card text-center">
              <span>
                <b className="block text-3xl leading-none tabular-nums">{score.value}</b>
                <span className={cn("text-xs font-bold uppercase", band.tone)}>{band.label}</span>
              </span>
            </div>
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            {bars.map((bar) => (
              <div key={bar.label} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-2 text-[12.5px]">
                <span>{bar.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", bar.tone)} style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%` }} />
                </span>
                <b className="text-right font-mono">{bar.text}</b>
              </div>
            ))}
            {score.components.ruleCap ? (
              <span className="text-xs font-semibold text-fit-cannot">Held at No-go: the prospect breaks one of your selling rules. Remove that gap to go on anyway.</span>
            ) : null}
            <span className="text-xs text-muted-foreground">Go at 70 or more. The same fit map always gives the same score.</span>
          </div>
        </div>
        {edited ? <p className="text-xs text-muted-foreground">The score is recalculated from your edits. The reasons below were written before them.</p> : null}
        <ol className="flex flex-col gap-2 text-sm">
          {working.reasons.map((reason, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-0.5 h-fit shrink-0 rounded bg-ai px-1 font-mono text-[9px] leading-4 font-bold text-white">AI</span>
              <span>
                {reason.text}{" "}
                {reason.refs
                  .filter((ref) => /^g\d+$/.test(ref))
                  .map((ref) => (
                    <span key={ref} className="mr-1 rounded border bg-card px-1.5 font-mono text-[11px]">
                      {label(ref)}
                    </span>
                  ))}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

/** FR-FIT-5: lines grouped by basis, never summed across bases, each naming where its price came from. */
function PricingCard({ opp, run, working, catalogue, editable }: { opp: Opportunity; run: Run; working: FitOutput; catalogue: Catalogue; editable: boolean }) {
  const lines = working.pricing.lines;
  const groups = pricingGroups(lines);

  return (
    <Card
      title="Pricing"
      marker={
        <>
          <AiMarker>
            Chose {lines.length} {lines.length === 1 ? "line" : "lines"}
          </AiMarker>
          <CalcMarker>Prices copied</CalcMarker>
        </>
      }
    >
      {lines.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No price lines. The proposal will say &quot;On quote&quot;.</p>
      ) : (
        <div className="flex flex-col">
          {groups.map(({ basis, title, lines: group, subtotal }) =>
            group.length ? (
              <div key={basis} className="border-b px-4 py-3 last:border-b-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <h4 className="text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">{title}</h4>
                  <span className="flex-1" />
                  {subtotal ? (
                    <>
                      <b className="font-mono text-sm">{subtotal}</b>
                      <CalcMarker>Subtotal</CalcMarker>
                    </>
                  ) : null}
                </div>
                {group.map((line) => {
                  const source = catalogue.priceSources[line.ref.kind === "cell" ? line.ref.cardId : line.ref.scheduleId];
                  return (
                    <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-1">
                      <span className="min-w-0 text-sm">
                        {line.label}
                        {source ? <span className="block truncate text-xs text-muted-foreground">{source}</span> : null}
                        {editable && line.ref.kind === "cell" && (catalogue.tiers[line.ref.cardId]?.length ?? 0) > 1 ? <TierPicker opp={opp} run={run} line={line} tiers={catalogue.tiers[line.ref.cardId]} /> : null}
                      </span>
                      <span className={cn("text-right font-mono text-[13px]", line.unpriced ? "text-muted-foreground" : "font-semibold")}>
                        {line.valueText}
                        {line.total ? <span className="block text-xs font-semibold">= {line.total}</span> : null}
                      </span>
                      {editable ? <RowRemove action={() => removePriceLine(opp.id, run.id, run.rev, line.id)} label={`Remove ${line.label}`} /> : <span />}
                    </div>
                  );
                })}
              </div>
            ) : null,
          )}
          <p className="px-4 py-2.5 text-xs text-muted-foreground">Every price is copied from your offerings&apos; Pricing tabs and never added up across bases. Cost never reaches the agents.</p>
        </div>
      )}
    </Card>
  );
}

/** Gate C (FR-FIT-7): price a grid line at a different tier. Code copies that tier's price; nothing is typed. */
function TierPicker({ opp, run, line, tiers }: { opp: Opportunity; run: Run; line: FitOutput["pricing"]["lines"][number]; tiers: { id: string; label: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (line.ref.kind !== "cell") return null;
  const current = line.ref.colId;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <label htmlFor={`tier-${line.id}`}>Tier</label>
      <select
        id={`tier-${line.id}`}
        value={current}
        disabled={pending}
        onChange={async (event) => {
          setPending(true);
          const result = await changePriceTier(opp.id, run.id, run.rev, line.id, event.target.value);
          setError(result.error ?? null);
          setPending(false);
        }}
        className={SELECT}
      >
        {tiers.map((tier) => (
          <option key={tier.id} value={tier.id}>
            {tier.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-destructive">{error}</span> : null}
    </span>
  );
}
