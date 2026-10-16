"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Label } from "@/components/ui/label";
import { pricingGroups } from "@/lib/deal-room/pricing-groups";
import type { FitOutput, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { type GateResult, removeGap, removePriceLine, writeProposal } from "./actions";
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
const origin = (gap: FitOutput["gaps"][number]) => (gap.origin.kind === "intake" ? (gap.origin.ref === "prospect" ? "a selling rule" : `what came in · ${gap.origin.ref}`) : gap.origin.kind === "note" ? "a seller note" : "the brief");

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
        <ScoreCard working={working} />
        <PricingCard opp={opp} run={run} working={working} catalogue={catalogue} editable={editable} />
      </div>

      {editable || (canWrite && opp.stages.write.state === "idle") ? <WriteForm opp={opp} run={run} /> : <Approved run={run} gate="Gate C" />}
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
          {run.state === "waiting" ? "Remove a need or a price line and the score updates. " : ""}Writing the proposal starts the Writer and the Reviewer. About a minute.
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
            <div className="flex flex-col gap-1 rounded-xl border bg-card px-3 py-2.5">
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
                        <Link href="/settings" className="text-primary hover:underline">
                          {rule.statement}
                        </Link>
                      ) : rule?.offeringId ? (
                        <Link href={`/offerings/${rule.offeringId}/scope`} className="text-primary hover:underline">
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
                <div key={mapping.target.id} className="flex flex-col gap-1 rounded-xl border bg-card px-3 py-2.5 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/offerings/${mapping.target.id}`} className="font-semibold text-primary hover:underline">
                      {catalogue.offerings[mapping.target.id] ?? mapping.target.id}
                    </Link>
                    {mappings.length > 1 || cannot.length ? <span className={cn("rounded-full px-2 py-px text-[11px] font-semibold capitalize", TONE[mapping.strength].soft)}>{mapping.strength}</span> : null}
                  </span>
                  {mapping.featureRefs.length ? <span className="text-xs text-muted-foreground">{mapping.featureRefs.map((id) => catalogue.features[id] ?? id).join(", ")}</span> : null}
                  {mapping.customisation ? (
                    <span className="text-xs">
                      <b>Suggest:</b> {mapping.customisation}
                    </span>
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
              ))}
              {mappings.length === 0 && cannot.length === 0 ? <div className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Nothing you sell covers this</div> : null}
            </div>
          </div>
        );
      })}
    </div>
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
                </td>
                <td className="px-4 py-2.5 capitalize">{gap.priority}</td>
                <td className="px-4 py-2.5">
                  {cannot.map((item) => (
                    <div key={item.constraint.id}>Cannot meet: {catalogue.constraints[item.constraint.id]?.statement}</div>
                  ))}
                  {mappings.map((mapping) => (
                    <div key={mapping.target.id}>{catalogue.offerings[mapping.target.id] ?? mapping.target.id}</div>
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

function ScoreCard({ working }: { working: FitOutput }) {
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
