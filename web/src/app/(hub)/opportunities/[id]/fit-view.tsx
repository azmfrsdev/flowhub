"use client";

import { ArrowRight, ChevronRight, Settings2, Table2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { PersonMarker } from "@/components/flowhub/markers";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pricingGroups } from "@/lib/deal-room/pricing-groups";
import type { FitOutput, Opportunity, Run } from "@/lib/schema";
import { cn } from "cn";
import { type GateResult, addGap, addMapping, changePriceTier, removeGap, removeMapping, removePriceLine, setCustomisation, setMappingStrength, approveFit } from "./actions";
import { Approved, GateSlot, RowRemove, useGate } from "./gate-parts";
import type { Catalogue } from "./shared";
import { Box, BoxTag, SideDrawer } from "./stage-box";

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

/** How many need rows and price lines each fixed-size box shows; the rest are in its drawer. */
const NEED_ROWS = 8;
const PRICE_ROWS = 8;
type Drawer = "map" | "pricing" | "table" | "made";
const DRAWER_TITLE: Record<Drawer, string> = { map: "Fit map", pricing: "Pricing", table: "Fit as a table", made: "How this was made" };

/** A need's one-line name: its title, or for a fit made before titles (or a need added by hand), its first words. */
function needTitle(gap: FitOutput["gaps"][number]) {
  if (gap.title) return gap.title;
  const words = gap.text.split(/\s+/);
  return words.length <= 8 ? gap.text : `${words.slice(0, 8).join(" ").replace(/[,.;:]$/, "")}…`;
}

/**
 * Gate C (FR-FIT-1 to FR-FIT-9). Three boxes of a fixed size: Go / No-go across the top,
 * then the fit map and pricing side by side, one line each. Every edit is in a side drawer.
 */
export function FitView({ opp, run, working, catalogue, editable, made }: { opp: Opportunity; run: Run; working: FitOutput; catalogue: Catalogue; editable: boolean; made?: React.ReactNode }) {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const openDrawer = (kind: Drawer) => {
    setOpenId(null);
    setDrawer(kind);
    dialog.current?.showModal();
  };

  // A click outside an open line closes it.
  useEffect(() => {
    if (!openId) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-fit-line]")) setOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openId]);

  const editLabel = editable ? "View all & edit" : "View all";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">What we can offer</span>
        <BoxTag kind="ai" title="The Fit Analyst maps needs to your confirmed offerings; code copies every price and works out the score.">
          Fit Analyst · prices copied by code
        </BoxTag>
        <span className="flex-1" />
        <span className="hidden text-xs text-muted-foreground md:inline">Click a need to see why it matches{editable ? " · edit in View all" : ""}</span>
      </div>

      <div className="flex flex-col gap-7 pt-2" onKeyDown={(event) => event.code === "Escape" && setOpenId(null)}>
        <ScoreBox working={working} edited={(run.output as FitOutput | null)?.score.value !== working.score.value} />
        <div className="grid gap-x-5 gap-y-7 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <Box title="Fit map" marker={<BoxTag kind="ai">Fit Analyst</BoxTag>} onMore={() => openDrawer("map")} moreLabel={editLabel} className="h-[25rem]">
            <CompactFitMap working={working} catalogue={catalogue} openId={openId} setOpenId={setOpenId} onMore={() => openDrawer("map")} />
          </Box>
          <Box title="Pricing" marker={<BoxTag kind="calc">Prices copied by code</BoxTag>} onMore={() => openDrawer("pricing")} moreLabel={editLabel} className="h-[25rem]">
            <PriceLines opp={opp} run={run} working={working} catalogue={catalogue} editable={false} limit={PRICE_ROWS} onMore={() => openDrawer("pricing")} />
          </Box>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            { kind: "made", label: "How this was made", icon: <Settings2 /> },
            { kind: "table", label: "Fit as a table", icon: <Table2 /> },
          ] as const
        ).map((item) => (
          <button key={item.kind} type="button" onClick={() => openDrawer(item.kind)} className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-ink bg-card px-3.5 text-sm font-bold shadow-comic-sm hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4">
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <SideDrawer ref={dialog} title={drawer ? DRAWER_TITLE[drawer] : null} onClose={() => setDrawer(null)}>
        {drawer === "map" ? (
          <div className="-mx-4 flex flex-col">
            {editable ? <p className="px-4 pt-1 text-xs text-muted-foreground">Change a match&apos;s strength, remove it, map a need to another offering, or add a need the agents missed. The score recalculates in code.</p> : null}
            <FitMap opp={opp} run={run} working={working} catalogue={catalogue} editable={editable} />
          </div>
        ) : drawer === "pricing" ? (
          <div className="-mx-5 flex flex-col">
            <p className="px-5 pb-1 text-xs text-muted-foreground">The agent picked the lines. Code copied each price, word for word, from your Pricing tabs, and never sums across bases. Cost never reaches the agents.{editable ? " Change a tier or remove a line; nothing is typed." : ""}</p>
            <PriceLines opp={opp} run={run} working={working} catalogue={catalogue} editable={editable} />
          </div>
        ) : drawer === "table" ? (
          <div className="-mx-5">
            <FitList working={working} catalogue={catalogue} />
          </div>
        ) : drawer === "made" ? (
          (made ?? <p className="text-muted-foreground">No steps recorded.</p>)
        ) : null}
      </SideDrawer>

      {editable ? <ContinueToWrite opp={opp} run={run} /> : <Approved run={run} gate="Gate C" />}
    </>
  );
}

/** FR-FIT-9: one line per need: its ID, title, a fit pill that never wraps, and the offering. A click shows the detail. */
function CompactFitMap({ working, catalogue, openId, setOpenId, onMore }: { working: FitOutput; catalogue: Catalogue; openId: string | null; setOpenId: (id: string | null) => void; onMore: () => void }) {
  const COLUMNS = "grid grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_minmax(0,0.9fr)_0.875rem] items-center gap-2";
  if (!working.gaps.length) return <p className="px-4 py-2 text-sm text-muted-foreground">No needs found.</p>;
  const shown = working.gaps.length > NEED_ROWS ? NEED_ROWS - 1 : NEED_ROWS;
  return (
    <div className="flex flex-col px-2.5">
      <div className={cn(COLUMNS, "px-2 pt-1 pb-1 text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase")}>
        <span />
        <span>Their needs</span>
        <span className="text-center">Fit</span>
        <span>Your offerings</span>
        <span />
      </div>
      <ul className="flex flex-col">
        {working.gaps.slice(0, shown).map((gap) => {
          const mappings = working.mappings.filter((mapping) => mapping.gapId === gap.id).sort((a, b) => RANK[b.strength] - RANK[a.strength]);
          const cannot = working.cannotMeet.filter((item) => item.gapId === gap.id);
          const kind: keyof typeof TONE = cannot.length ? "cannot" : mappings.length ? mappings[0].strength : "none";
          const fitName = kind === "cannot" ? "Cannot meet" : kind === "none" ? "No match" : kind;
          const open = openId === gap.id;
          const offering = cannot.length
            ? (catalogue.constraints[cannot[0].constraint.id]?.statement ?? "A selling rule")
            : mappings.length
              ? `${catalogue.offerings[mappings[0].target.id] ?? mappings[0].target.id}${mappings.length > 1 ? ` +${mappings.length - 1}` : ""}`
              : "Nothing you sell";
          return (
            <li key={gap.id} data-fit-line className="relative">
              <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : gap.id)} className={cn(COLUMNS, "h-10 w-full rounded-lg border-b border-dashed border-line-soft px-2 text-left text-[13.5px] transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", open && "bg-attention-soft")}>
                <span className="grid h-5 place-items-center rounded-md border-[1.5px] border-ink font-mono text-[11px] font-bold">{label(gap.id)}</span>
                <span className="truncate">{needTitle(gap)}</span>
                {/* The pill is one element that never wraps, in a column wide enough for "Cannot meet". */}
                <span className="relative flex h-5 items-center justify-center">
                  <span aria-hidden="true" className={cn("absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full", TONE[kind].line, (kind === "partial" || kind === "weak" || kind === "none") && "opacity-70")} />
                  <span className={cn("relative rounded-full border-2 bg-card px-2 text-[10.5px] leading-4 font-bold whitespace-nowrap capitalize", TONE[kind].pill)}>{fitName}</span>
                </span>
                <span className={cn("truncate font-semibold", kind === "cannot" ? "text-fit-cannot" : kind === "none" ? "font-normal text-muted-foreground" : "text-link")}>{offering}</span>
                <ChevronRight aria-hidden="true" className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
              </button>
              {open ? (
                <div role="dialog" aria-label={`Need ${label(gap.id)}`} className="absolute inset-x-1 top-full z-30 mt-0.5 flex flex-col gap-2 rounded-lg border-2 border-ink bg-card p-3 text-[13px] leading-relaxed shadow-comic sm:left-11">
                  <span className="text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
                    The need · from {origin(gap)} · {gap.priority} priority
                  </span>
                  <p>{gap.text}</p>
                  {cannot.map((item) => (
                    <p key={item.constraint.id} className="text-fit-cannot">
                      <b>{catalogue.constraints[item.constraint.id]?.companyWide ? "Selling rule:" : "Not included:"}</b> {catalogue.constraints[item.constraint.id]?.statement}
                      {item.partner ? <span className="block text-foreground">Consider partner {catalogue.partners[item.partner.id] ?? ""}, who covers it.</span> : null}
                    </p>
                  ))}
                  {mappings.map((mapping) => (
                    <div key={mapping.target.id} className="flex flex-col gap-1 border-t border-dashed border-line-soft pt-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/offerings/${mapping.target.id}`} className="font-semibold text-link hover:underline">
                          {catalogue.offerings[mapping.target.id] ?? mapping.target.id}
                        </Link>
                        <span className={cn("rounded-full px-2 text-[11px] font-semibold capitalize", TONE[mapping.strength].soft)}>{mapping.strength}</span>
                      </span>
                      {mapping.featureRefs.length ? <span className="text-xs text-muted-foreground">{mapping.featureRefs.map((id) => catalogue.features[id] ?? id).join(", ")}</span> : null}
                      {mapping.customisation ? (
                        <span className="text-xs">
                          <b>{mapping.customisedBy ? "Customise:" : "Suggest:"}</b> {mapping.customisation}
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
                </div>
              ) : null}
            </li>
          );
        })}
        {working.gaps.length > shown ? (
          <li className="px-2 pt-1.5 text-xs text-muted-foreground">
            and {working.gaps.length - shown} more in{" "}
            <button type="button" onClick={onMore} className="text-link hover:underline">
              View all
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Gate C (FR-FIT-7, FR-WRI-11): approve the fit map and go on to Write and review, where the person chooses what to make. */
function ContinueToWrite({ opp, run }: { opp: Opportunity; run: Run }) {
  const approve = useGate(() => approveFit(opp.id, run.id, run.rev));
  return (
    <GateSlot>
      <div className="order-last flex items-center gap-2">
        {approve.error ? <span className="text-sm text-destructive">{approve.error}</span> : null}
        <Button type="button" onClick={approve.run} disabled={approve.pending} className="h-10 px-4 text-[15px] font-bold shadow-comic">
          {approve.pending ? "Approving…" : "Continue to write"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </GateSlot>
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
            <div className="flex items-start gap-2 rounded-xl border-2 border-ink bg-card shadow-comic px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="text-sm">{gap.text}</b>
                <span className="text-xs text-muted-foreground">
                  From {origin(gap)} · {gap.priority} priority
                </span>
              </div>
              {editable ? <RowRemove action={() => removeGap(opp.id, run.id, run.rev, gap.id)} label={`Remove the need ${label(gap.id)}`} /> : null}
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

/** FR-FIT-4, FR-FIT-9: the score across the top: the ring, its three parts, and the Fit Analyst's three reasons. */
function ScoreBox({ working, edited }: { working: FitOutput; edited: boolean }) {
  const { score } = working;
  const band = BAND[score.band];
  const bars = [
    { label: "Coverage", value: score.components.coverage, max: 100, text: String(score.components.coverage), tone: "bg-fit-strong" },
    { label: "Penalties", value: score.components.penalties, max: 45, text: `−${score.components.penalties}`, tone: "bg-fit-cannot" },
    { label: "Tech overlap", value: score.components.techBonus, max: 5, text: `+${score.components.techBonus}`, tone: "bg-ai" },
  ];
  return (
    <Box title="Go / No-go" marker={<BoxTag kind="calc">Calculated by code · Go at 70+</BoxTag>}>
      <div className="grid items-center gap-x-7 gap-y-4 px-5 pt-2 pb-4 md:grid-cols-[auto_minmax(0,20rem)_minmax(0,1fr)]">
        <div role="img" aria-label={`Score ${score.value} out of 100, ${band.label}`} className="grid size-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${band.ring} ${score.value}%, var(--color-muted) 0)` }}>
          <div className="grid size-21 place-items-center rounded-full bg-card text-center">
            <span>
              <b className="fh-hand block text-[34px] leading-none tabular-nums">{score.value}</b>
              <span className={cn("text-[10.5px] font-bold tracking-[0.06em] uppercase", band.tone)}>{band.label}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {bars.map((bar) => (
            <div key={bar.label} className="grid grid-cols-[92px_minmax(0,1fr)_36px] items-center gap-2 text-[12.5px]">
              <span>{bar.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", bar.tone)} style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%` }} />
              </span>
              <b className="text-right font-mono">{bar.text}</b>
            </div>
          ))}
          {score.components.ruleCap ? (
            <span className="text-xs font-semibold text-fit-cannot">Held at No-go: the prospect breaks one of your selling rules. Remove that need to go on anyway.</span>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">Worked out in code from the fit map, never by the model.</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 md:border-l md:border-dashed md:border-line-soft md:pl-6">
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
            Why <BoxTag kind="ai">Fit Analyst</BoxTag>
          </span>
          {edited ? <p className="text-xs text-muted-foreground">The score is recalculated from your edits. These reasons were written before them.</p> : null}
          <ol className="flex flex-col gap-1.5 text-[13px] leading-snug">
            {working.reasons.map((reason, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>
                  {reason.text}{" "}
                  {reason.refs
                    .filter((ref) => /^g\d+$/.test(ref))
                    .map((ref) => (
                      <span key={ref} className="mr-1 rounded border bg-card px-1 font-mono text-[10.5px]">
                        {label(ref)}
                      </span>
                    ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Box>
  );
}

/**
 * FR-FIT-5: lines grouped by basis, never summed across bases. In the box each line and its
 * price sit on one line, up to `limit`; in the drawer each names where its price came from,
 * and at Gate C a person changes a tier or removes a line.
 */
function PriceLines({ opp, run, working, catalogue, editable, limit, onMore }: { opp: Opportunity; run: Run; working: FitOutput; catalogue: Catalogue; editable: boolean; limit?: number; onMore?: () => void }) {
  const lines = working.pricing.lines;
  if (lines.length === 0) return <p className="px-4 py-2 text-sm text-muted-foreground">No price lines. The proposal will say &quot;On quote&quot;.</p>;
  const compact = limit !== undefined;
  const shown = compact && lines.length > limit ? limit - 1 : lines.length;
  // Each group shows what is left of the box's line budget, in order.
  const groups = pricingGroups(lines);
  const before = groups.map((_, index) => groups.slice(0, index).reduce((sum, item) => sum + item.lines.length, 0));
  return (
    <div className={cn("flex flex-col", compact ? "px-4" : "px-5")}>
      {groups.map(({ basis, title, lines: group, subtotal, floorNote }, index) => {
        const visible = group.slice(0, Math.max(0, shown - before[index]));
        if (!visible.length) return null;
        return (
          <div key={basis} className="flex flex-col pt-2">
            <h3 className="flex items-center gap-2 pb-0.5 font-sans text-[10.5px] font-bold tracking-[0.07em] text-muted-foreground uppercase [font-size-adjust:none] [-webkit-text-stroke:0]">{title}</h3>
            {floorNote && !compact ? <p className="mb-1 text-xs text-muted-foreground">{floorNote}</p> : null}
            {visible.map((line) => {
              const source = catalogue.priceSources[line.ref.kind === "cell" ? line.ref.cardId : line.ref.scheduleId];
              return compact ? (
                <div key={line.id} className="grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-dashed border-line-soft text-[13px]" title={source ? `${line.label} · ${source}` : line.label}>
                  <span className="truncate">{line.label}</span>
                  <span className={cn("font-mono text-[12.5px] whitespace-nowrap", line.unpriced ? "text-muted-foreground" : "font-semibold")}>{line.total ?? line.valueText}</span>
                </div>
              ) : (
                <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-dashed border-line-soft py-1.5">
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
            {subtotal && visible.length === group.length ? (
              <p className="flex items-center justify-end gap-2 pt-1 text-xs">
                <BoxTag kind="calc">Subtotal by code</BoxTag>
                <b className="font-mono text-[13px]">{subtotal}</b>
              </p>
            ) : null}
          </div>
        );
      })}
      {compact && lines.length > shown ? (
        <p className="pt-1.5 text-xs text-muted-foreground">
          and {lines.length - shown} more in{" "}
          <button type="button" onClick={onMore} className="text-link hover:underline">
            View all
          </button>
        </p>
      ) : null}
    </div>
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
