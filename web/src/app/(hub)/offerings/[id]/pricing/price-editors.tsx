"use client";

import { CalendarDays, Columns3, List, Lock, PackagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { EmptyRow, SectionCard } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { FEE_BASIS_LABEL } from "@/lib/offerings/edits";
import { marginPercent, priceOn } from "@/lib/offerings/view";
import type { FeeBasis, FeeSchedule, RateCard, ScheduledPrice } from "@/lib/schema";
import { cn } from "cn";
import type { EditResult } from "@/server/graph/write";
import { OpenAskButton } from "../../../ask/ask-context";
import { type PriceSectionKind, addPriceSection, removePriceSection, saveFeeSchedule, saveRateCard, saveRateCardStructure } from "./actions";

/** A price change proposed through Ask or tell and not yet applied (FR-ASK-5). */
export type PendingPrice = { after: string; from?: string; proposalId: string };

const shortDay = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** A scheduled price (FR-ASK-6) and a pending proposal, under the price in use today. */
function PriceNotes({ next, pending, day }: { next?: ScheduledPrice; pending?: PendingPrice; day: string }) {
  return (
    <>
      {next && day < next.from ? (
        <span className="mt-0.5 block font-mono text-xs text-ai">
          {next.value} <span className="font-sans">from {shortDay(next.from)}</span>
        </span>
      ) : null}
      {pending ? (
        <OpenAskButton proposalId={pending.proposalId} className="mt-1 block text-left hover:opacity-80" title="Review the proposal">
          <AiMarker waiting>
            Proposed: {pending.after}
            {pending.from ? ` from ${shortDay(pending.from)}` : ""}
          </AiMarker>
        </OpenAskButton>
      ) : null}
    </>
  );
}

const fieldBase = "h-8 w-full rounded-md border border-input bg-card px-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const cellInput = cn(fieldBase, "min-w-28 font-mono text-[13px]");
const labelInput = cn(fieldBase, "min-w-40 text-sm");

/** Keys for lines and tiers that don't have an ID until they're saved. */
let draftSequence = 0;
const draftKey = () => `new-${++draftSequence}`;

function useEditor(save: () => Promise<EditResult>, startEditing = false) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  return {
    editing,
    pending,
    error,
    start: () => {
      setError(null);
      setEditing(true);
    },
    cancel: () => {
      setError(null);
      setEditing(false);
    },
    save: () =>
      startTransition(async () => {
        const result = await save();
        if (result.ok) {
          setEditing(false);
          setError(null);
        } else setError({ message: result.error, conflict: Boolean(result.conflict) });
      }),
    reload: () => {
      setEditing(false);
      setError(null);
      router.refresh();
    },
  };
}

type Editor = ReturnType<typeof useEditor>;

function EditActions({ editor, canEdit, label, remove }: { editor: Editor; canEdit: boolean; label: string; remove?: { collection: "rateCards" | "feeSchedules"; id: string } }) {
  const [removing, startRemoving] = useTransition();
  if (!canEdit) return null;
  if (!editor.editing)
    return (
      <Button type="button" variant="outline" size="sm" onClick={editor.start} aria-label={`Edit ${label}`}>
        <Pencil aria-hidden="true" />
        Edit
      </Button>
    );
  return (
    <span className="flex flex-wrap gap-2">
      {remove ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={editor.pending || removing}
          onClick={() => {
            if (!window.confirm(`Remove ${label} from this offering's pricing?`)) return;
            startRemoving(async () => {
              const result = await removePriceSection(remove.collection, remove.id);
              if (!result.ok) window.alert(result.error);
            });
          }}
        >
          <Trash2 aria-hidden="true" />
          {removing ? "Removing…" : "Remove"}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={editor.cancel} disabled={editor.pending || removing}>
        Cancel
      </Button>
      <Button type="button" size="sm" onClick={editor.save} disabled={editor.pending || removing}>
        {editor.pending ? "Saving…" : "Save"}
      </Button>
    </span>
  );
}

function EditError({ editor }: { editor: Editor }) {
  if (!editor.error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
      {editor.error.message}
      {editor.error.conflict ? (
        <Button type="button" variant="outline" size="sm" onClick={editor.reload}>
          Reload latest
        </Button>
      ) : null}
    </div>
  );
}

function NameField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <label className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-sm">
      <span className="font-medium">{label}</span>
      <input className={cn(labelInput, "max-w-72")} value={value} maxLength={80} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AddLineButton({ onClick, children = "Add a line" }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <div className="border-t px-3 py-2">
      <Button type="button" variant="ghost" size="sm" onClick={onClick}>
        <Plus aria-hidden="true" />
        {children}
      </Button>
    </div>
  );
}

function RemoveIcon({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <X aria-hidden="true" />
    </Button>
  );
}

/** A group header goes above the first row of each new group (worked out up front, not during render). */
function groupHeaders(rows: { groupLabel?: string }[]) {
  return rows.map((row, index) => {
    const previous = rows.slice(0, index).reverse().find((earlier) => earlier.groupLabel)?.groupLabel;
    return row.groupLabel && row.groupLabel !== previous ? row.groupLabel : null;
  });
}

type GridDraft = {
  name: string;
  columns: { key: string; id?: string; label: string; note?: string }[];
  rows: { key: string; id?: string; label: string; groupLabel?: string }[];
  cells: Record<string, Record<string, string>>;
};

function gridDraft(card: RateCard): GridDraft {
  const rows: GridDraft["rows"] = card.rows.map((row) => ({ key: row.id, id: row.id, label: row.label, groupLabel: row.groupLabel }));
  return {
    name: card.name,
    columns: card.columns.map((column) => ({ key: column.id, id: column.id, label: column.label, note: column.note })),
    // A new grid opens with one empty line to fill in.
    rows: rows.length > 0 ? rows : [{ key: draftKey(), label: "" }],
    cells: Object.fromEntries(Object.entries(card.cells).map(([rowId, cells]) => [rowId, Object.fromEntries(Object.entries(cells).map(([colId, cell]) => [colId, cell.value]))])),
  };
}

/**
 * A pricing grid (R2): the same lines at different tiers. Read, or edited as a
 * whole: its name, tiers, lines and prices (FR-OFR-5). An empty cell reads as
 * Not offered.
 */
export function RateCardEditor({
  card,
  marker,
  canEdit,
  day,
  pending = {},
}: {
  card: RateCard;
  marker: React.ReactNode;
  canEdit: boolean;
  /** Today in Malaysia, from the server, so the price in use is the same on both sides. */
  day: string;
  /** Proposed changes by "rowId:colId". */
  pending?: Record<string, PendingPrice>;
}) {
  const fresh = card.rows.length === 0 && canEdit;
  const [draft, setDraft] = useState<GridDraft>(() => gridDraft(card));
  const editor = useEditor(
    () =>
      saveRateCardStructure(card.id, card.rev, {
        name: draft.name,
        columns: draft.columns.map(({ key, id, label }) => ({ key, id, label })),
        rows: draft.rows.map(({ key, id, label, groupLabel }) => ({ key, id, label, groupLabel })),
        cells: draft.cells,
      }),
    fresh,
  );
  const update = (change: (draft: GridDraft) => GridDraft) => setDraft((current) => change(current));
  const columns = editor.editing ? draft.columns : card.columns.map((column) => ({ ...column, key: column.id }));
  const rows = editor.editing ? draft.rows : card.rows.map((row) => ({ ...row, key: row.id }));
  const headers = groupHeaders(rows);

  return (
    <SectionCard
      title={card.name}
      id={card.id}
      subtitle={editor.editing ? "Name the tiers across the top and the lines down the side. Leave a cell empty if that tier doesn't include it." : "Prices exactly as you sell them"}
      marker={marker}
      action={
        <EditActions
          editor={{ ...editor, start: () => (setDraft(gridDraft(card)), editor.start()), cancel: () => (setDraft(gridDraft(card)), editor.cancel()) }}
          canEdit={canEdit}
          label={card.name}
          remove={{ collection: "rateCards", id: card.id }}
        />
      }
    >
      <EditError editor={editor} />
      {editor.editing ? <NameField label="Name" value={draft.name} onChange={(name) => update((d) => ({ ...d, name }))} /> : null}
      {rows.length === 0 && !editor.editing ? (
        <EmptyRow>No lines yet.{canEdit ? " Use Edit to add the first one." : ""}</EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Line</th>
                {columns.map((column) => (
                  <th key={column.key} className={cn("px-4 py-2 font-semibold", column.note && "bg-accent/50 text-accent-foreground")}>
                    {editor.editing ? (
                      <span className="flex items-center gap-1">
                        <input
                          aria-label="Tier name"
                          placeholder="Tier name"
                          className={cn(labelInput, "min-w-28 font-semibold")}
                          value={column.label}
                          maxLength={60}
                          onChange={(event) => update((d) => ({ ...d, columns: d.columns.map((c) => (c.key === column.key ? { ...c, label: event.target.value } : c)) }))}
                        />
                        <RemoveIcon
                          label={`Remove the tier ${column.label || "with no name"}`}
                          disabled={columns.length === 1}
                          onClick={() => update((d) => ({ ...d, columns: d.columns.filter((c) => c.key !== column.key) }))}
                        />
                      </span>
                    ) : (
                      <>
                        {column.label}
                        {column.note ? ` · ${column.note}` : null}
                      </>
                    )}
                  </th>
                ))}
                {editor.editing ? (
                  <th className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={columns.length >= 12}
                      onClick={() => update((d) => ({ ...d, columns: [...d.columns, { key: draftKey(), label: "" }] }))}
                    >
                      <Plus aria-hidden="true" />
                      Tier
                    </Button>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const header = headers[index];
                return (
                  <Fragment key={row.key}>
                    {header ? (
                      <tr className="bg-muted/50">
                        <td colSpan={columns.length + (editor.editing ? 2 : 1)} className="px-4 py-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                          {header}
                        </td>
                      </tr>
                    ) : null}
                    <tr className="border-b last:border-b-0">
                      <td className="px-4 py-2.5">
                        {editor.editing ? (
                          <input
                            aria-label="Line name"
                            placeholder="What's sold, e.g. Setup"
                            className={labelInput}
                            value={row.label}
                            maxLength={120}
                            onChange={(event) => update((d) => ({ ...d, rows: d.rows.map((r) => (r.key === row.key ? { ...r, label: event.target.value } : r)) }))}
                          />
                        ) : (
                          row.label
                        )}
                      </td>
                      {columns.map((column) => {
                        const cell = card.cells[row.key]?.[column.key];
                        const proposed = pending[`${row.key}:${column.key}`];
                        return (
                          <td key={column.key} className={cn("px-4 py-2 align-top", column.note && "bg-accent/30", proposed && !editor.editing && "bg-attention-soft/50")}>
                            {editor.editing ? (
                              <input
                                aria-label={`${row.label || "New line"}, ${column.label || "new tier"}`}
                                className={cellInput}
                                value={draft.cells[row.key]?.[column.key] ?? ""}
                                maxLength={80}
                                onChange={(event) => update((d) => ({ ...d, cells: { ...d.cells, [row.key]: { ...d.cells[row.key], [column.key]: event.target.value } } }))}
                              />
                            ) : (
                              <>
                                <span className="font-mono text-[13px]">{cell ? priceOn(cell, day) : <span className="font-sans text-muted-foreground">Not offered</span>}</span>
                                <PriceNotes next={cell?.next} pending={proposed} day={day} />
                              </>
                            )}
                          </td>
                        );
                      })}
                      {editor.editing ? (
                        <td className="px-2 py-2 align-top">
                          <RemoveIcon label={`Remove the line ${row.label || "with no name"}`} onClick={() => update((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== row.key) }))} />
                        </td>
                      ) : null}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editor.editing ? (
        <AddLineButton onClick={() => update((d) => ({ ...d, rows: [...d.rows, { key: draftKey(), label: "", groupLabel: d.rows.at(-1)?.groupLabel }] }))} />
      ) : null}
    </SectionCard>
  );
}

/** A private cost card (invariant 2): its values only, with margins against the matching price card. Its lines follow that card. */
export function CostCardEditor({
  card,
  priceCard,
  currency,
  canEdit,
  day,
}: {
  card: RateCard;
  priceCard?: RateCard;
  currency: string;
  canEdit: boolean;
  day: string;
}) {
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const editor = useEditor(() => saveRateCard(card.id, card.rev, draft));
  const value = (rowId: string, colId: string) => draft[rowId]?.[colId] ?? card.cells[rowId]?.[colId]?.value ?? "";
  const headers = groupHeaders(card.rows);

  return (
    <SectionCard
      title={card.name}
      id={card.id}
      subtitle={editor.editing ? "Type costs exactly as you pay them. Leave a cell empty if there's none." : "What each package costs you to deliver"}
      marker={
        <span className="inline-flex items-center gap-1 rounded-full bg-private-soft px-2 py-px text-xs font-semibold text-private">
          <Lock aria-hidden="true" className="size-3" />
          Private
        </span>
      }
      footer={<CalcMarker>Margin calculated, never stored</CalcMarker>}
      action={
        <EditActions
          editor={{ ...editor, start: () => (setDraft({}), editor.start()), cancel: () => (setDraft({}), editor.cancel()) }}
          canEdit={canEdit}
          label={card.name}
        />
      }
    >
      <EditError editor={editor} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Line</th>
              {card.columns.map((column) => (
                <th key={column.id} className="px-4 py-2 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, index) => {
              const header = headers[index];
              return (
                <Fragment key={row.id}>
                  {header ? (
                    <tr className="bg-muted/50">
                      <td colSpan={card.columns.length + 1} className="px-4 py-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        {header}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">{row.label}</td>
                    {card.columns.map((column) => {
                      const cell = card.cells[row.id]?.[column.id];
                      const priceCell = priceCard?.cells[row.id]?.[column.id];
                      const price = priceCell ? priceOn(priceCell, day) : undefined;
                      const margin = cell && price ? marginPercent(price, priceOn(cell, day), currency) : null;
                      return (
                        <td key={column.id} className="px-4 py-2 align-top">
                          {editor.editing ? (
                            <input
                              aria-label={`${row.label}, ${column.label}, private`}
                              className={cn(cellInput, "text-private")}
                              value={value(row.id, column.id)}
                              maxLength={80}
                              onChange={(event) => setDraft((d) => ({ ...d, [row.id]: { ...d[row.id], [column.id]: event.target.value } }))}
                            />
                          ) : (
                            <span className="font-mono text-[13px] text-private">
                              {cell ? priceOn(cell, day) : <span className="font-sans text-muted-foreground">–</span>}
                              {margin !== null ? <span className="ml-2 font-sans text-xs text-calc">{margin}% margin</span> : null}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

const SECTION_TITLE = { man_days: "Man-day rates", add_ons: "Add-ons", other: "Fees" } as const;
const SECTION_SUBTITLE = { man_days: "For change requests and work outside a package", add_ons: "Charged on top of a package", other: "" } as const;
const BASIS_OPTIONS = Object.entries(FEE_BASIS_LABEL) as [FeeBasis, string][];

type ListDraft = { name: string; lines: { key: string; id?: string; label: string; basis: FeeBasis; price: string; cost: string }[] };

function listDraft(schedule: FeeSchedule): ListDraft {
  const lines = schedule.lines.map((line) => ({ key: line.id, id: line.id, label: line.label, basis: line.basis, price: line.price, cost: line.cost ?? "" }));
  // A new price list opens with one empty line to fill in.
  return { name: schedule.name, lines: lines.length > 0 ? lines : [blankLine(schedule.section)] };
}

const blankLine = (section: FeeSchedule["section"]): ListDraft["lines"][number] => ({ key: draftKey(), label: "", basis: section === "man_days" ? "daily" : "one_time", price: "", cost: "" });

/** A fee schedule (R3): lines with a price, how it's charged, and a private cost; margin calculated on screen. */
export function FeeScheduleEditor({
  schedule,
  footer,
  currency,
  canEdit,
  day,
  pending = {},
}: {
  schedule: FeeSchedule;
  footer: React.ReactNode;
  currency: string;
  canEdit: boolean;
  day: string;
  /** Proposed changes by line ID. */
  pending?: Record<string, PendingPrice>;
}) {
  const fresh = schedule.lines.length === 0 && canEdit;
  const [draft, setDraft] = useState<ListDraft>(() => listDraft(schedule));
  const editor = useEditor(
    () =>
      saveFeeSchedule(schedule.id, schedule.rev, {
        ...(schedule.section === "other" ? { name: draft.name } : {}),
        lines: draft.lines.map(({ id, label, basis, price, cost }) => ({ id, label, basis, price, cost })),
      }),
    fresh,
  );
  const manDays = schedule.section === "man_days";
  const hasCost = editor.editing || schedule.lines.some((line) => line.cost);
  const showMargin = !editor.editing && schedule.lines.some((line) => marginPercent(line.price, line.cost, currency) !== null);
  const title = schedule.section === "other" ? schedule.name : SECTION_TITLE[schedule.section];
  const setLine = (key: string, change: Partial<ListDraft["lines"][number]>) => setDraft((d) => ({ ...d, lines: d.lines.map((line) => (line.key === key ? { ...line, ...change } : line)) }));

  return (
    <SectionCard
      title={title}
      id={schedule.id}
      className={editor.editing ? "xl:col-span-2" : undefined}
      subtitle={editor.editing ? "One line per thing you charge for. Write \"On quote\" if a line has no set price." : SECTION_SUBTITLE[schedule.section] || undefined}
      footer={editor.editing ? undefined : footer}
      action={
        <EditActions
          editor={{ ...editor, start: () => (setDraft(listDraft(schedule)), editor.start()), cancel: () => (setDraft(listDraft(schedule)), editor.cancel()) }}
          canEdit={canEdit}
          label={title}
          remove={{ collection: "feeSchedules", id: schedule.id }}
        />
      }
    >
      <EditError editor={editor} />
      {editor.editing && schedule.section === "other" ? <NameField label="Name" value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} /> : null}
      {schedule.lines.length === 0 && !editor.editing ? (
        <EmptyRow>No lines yet.{canEdit ? " Use Edit to add the first one." : ""}</EmptyRow>
      ) : editor.editing ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">{manDays ? "Role" : "Line"}</th>
                {manDays ? null : <th className="px-4 py-2 font-semibold">Charged</th>}
                <th className="px-4 py-2 font-semibold">{manDays ? "Price per day" : "Price"}</th>
                <th className="px-4 py-2 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Cost <Lock aria-label="private" className="size-3 text-private" />
                  </span>
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {draft.lines.map((line) => (
                <tr key={line.key}>
                  <td className="px-4 py-2">
                    <input aria-label="Line name" placeholder={manDays ? "e.g. Consultant" : "e.g. Setup fee"} className={labelInput} maxLength={120} value={line.label} onChange={(e) => setLine(line.key, { label: e.target.value })} />
                  </td>
                  {manDays ? null : (
                    <td className="px-4 py-2">
                      <select aria-label={`How ${line.label || "this line"} is charged`} className={cn(fieldBase, "min-w-32 text-sm")} value={line.basis} onChange={(e) => setLine(line.key, { basis: e.target.value as FeeBasis })}>
                        {BASIS_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <input aria-label={`${line.label || "New line"} price`} placeholder="e.g. RM 1,500" className={cellInput} maxLength={80} value={line.price} onChange={(e) => setLine(line.key, { price: e.target.value })} />
                  </td>
                  <td className="px-4 py-2">
                    <input aria-label={`${line.label || "New line"} cost, private`} placeholder="Optional" className={cn(cellInput, "text-private")} maxLength={80} value={line.cost} onChange={(e) => setLine(line.key, { cost: e.target.value })} />
                  </td>
                  <td className="px-2 py-2">
                    <RemoveIcon label={`Remove ${line.label || "this line"}`} onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">{manDays ? "Role" : "Line"}</th>
                <th className="px-4 py-2 font-semibold">{manDays ? "Price per day" : "Price"}</th>
                {hasCost ? (
                  <th className="px-4 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Cost <Lock aria-label="private" className="size-3 text-private" />
                    </span>
                  </th>
                ) : null}
                {showMargin ? <th className="px-4 py-2 font-semibold">Margin</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {schedule.lines.map((line) => {
                const margin = marginPercent(line.price, line.cost, currency);
                return (
                  <tr key={line.id}>
                    <td className="px-4 py-2.5">
                      {line.label}
                      {manDays ? null : <span className="block text-xs text-muted-foreground">{FEE_BASIS_LABEL[line.basis]}{line.paidTo ? ` · via ${line.paidTo}` : ""}</span>}
                    </td>
                    <td className={cn("px-4 py-2 align-top", pending[line.id] && "bg-attention-soft/50")}>
                      <span className="font-mono text-[13px]">{priceOn({ value: line.price, next: line.next }, day)}</span>
                      <PriceNotes next={line.next} pending={pending[line.id]} day={day} />
                    </td>
                    {hasCost ? (
                      <td className="px-4 py-2 align-top">
                        <span className="font-mono text-[13px] text-private">{line.cost ?? "–"}</span>
                      </td>
                    ) : null}
                    {showMargin ? <td className="px-4 py-2.5 align-top text-calc">{margin !== null ? `${margin}%` : "–"}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editor.editing ? <AddLineButton onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, blankLine(schedule.section)] }))} /> : null}
    </SectionCard>
  );
}

const KINDS: { kind: PriceSectionKind; label: string; hint: string; icon: typeof List }[] = [
  { kind: "list", label: "Price list", hint: "Items with their own price, like a setup fee and monthly support.", icon: List },
  { kind: "tiers", label: "Tiers", hint: "The same items at different levels, like Basic, Standard and Premium.", icon: Columns3 },
  { kind: "add_ons", label: "Add-ons", hint: "Extras charged on top of the main price.", icon: PackagePlus },
  { kind: "man_days", label: "Day rates", hint: "Per-day rates for work outside a package.", icon: CalendarDays },
];

/** FR-OFR-5: start a new kind of pricing on this offering. An offering can mix several. */
export function AddPricing({ offeringId, empty, has }: { offeringId: string; empty: boolean; has: { add_ons: boolean; man_days: boolean } }) {
  const [busy, setBusy] = useState<PriceSectionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
    <section aria-labelledby="add-pricing" className="flex flex-col gap-3 rounded-xl border border-dashed bg-card/60 p-4">
      <div className="flex flex-col">
        <h2 id="add-pricing" className="font-bold">
          {empty ? "Add prices" : "Add more pricing"}
        </h2>
        <span className="text-sm text-muted-foreground">
          {empty ? "Pick how this offering is sold. You can mix several, like tiers plus add-ons." : "Sold more than one way? Add another kind of pricing."}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {KINDS.map(({ kind, label, hint, icon: Icon }) => {
          const taken = (kind === "add_ons" && has.add_ons) || (kind === "man_days" && has.man_days);
          return (
            <button
              key={kind}
              type="button"
              disabled={busy !== null || taken}
              title={taken ? `This offering already has ${label.toLowerCase()}.` : undefined}
              onClick={() => {
                setError(null);
                setBusy(kind);
                startTransition(async () => {
                  const result = await addPriceSection(offeringId, kind);
                  if (!result.ok) setError(result.error);
                  setBusy(null);
                });
              }}
              className="flex flex-col items-start gap-1 rounded-lg border-2 border-ink bg-card shadow-comic-sm px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                {busy === kind ? "Adding…" : label}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
