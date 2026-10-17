import { describe, expect, it } from "vitest";
import { olvessa } from "@/lib/sample/olvessa";
import { type RateCardStructureEdit, applyCellEdits, applyFeeLineEdits, applyRateCardEdit } from "./edits";

const card = olvessa.rateCards.find((item) => item.id === "rc_gcm")!;
const days = olvessa.feeSchedules.find((item) => item.id === "fs_gcm_days")!;

describe("applyCellEdits (FR-OFR-5)", () => {
  it("changes only the typed cell, and drops its document source", () => {
    const row = card.rows.find((r) => card.cells[r.id]?.col_gro)!;
    const before = card.cells[row.id].col_gro;
    const { cells, changes } = applyCellEdits(card, { [row.id]: { col_gro: "RM 99,999" } });
    expect(cells[row.id].col_gro).toEqual({ value: "RM 99,999", sources: [] });
    expect(changes).toEqual([`${row.label} · Growth: ${before.value} → RM 99,999`]);
    // Every other cell is untouched, sources and all.
    for (const r of card.rows) for (const c of card.columns) if (!(r.id === row.id && c.id === "col_gro")) expect(cells[r.id]?.[c.id]).toEqual(card.cells[r.id]?.[c.id]);
  });

  it("reports nothing when nothing changed, even with whitespace", () => {
    const row = card.rows[0];
    const column = card.columns.find((c) => card.cells[row.id]?.[c.id])!;
    expect(applyCellEdits(card, { [row.id]: { [column.id]: ` ${card.cells[row.id][column.id].value} ` } }).changes).toEqual([]);
  });

  it("clears a cell that is emptied, which shows as Not offered", () => {
    const row = card.rows[0];
    const column = card.columns.find((c) => card.cells[row.id]?.[c.id])!;
    const { cells, changes } = applyCellEdits(card, { [row.id]: { [column.id]: "" } });
    expect(cells[row.id]?.[column.id]).toBeUndefined();
    expect(changes).toHaveLength(1);
  });

  it("ignores rows and columns that aren't on the card", () => {
    expect(applyCellEdits(card, { no_such_row: { col_gro: "RM 1" } }).changes).toEqual([]);
  });
});

const asEdits = (lines: typeof days.lines) => lines.map((line) => ({ id: line.id, label: line.label, basis: line.basis, price: line.price, cost: line.cost ?? "" }));
let sequence = 0;
const newId = () => `ln_new${++sequence}`;

describe("applyFeeLineEdits (FR-OFR-5)", () => {
  it("updates price and cost, keeping sources when the price is unchanged", () => {
    const line = days.lines[0];
    const edits = asEdits(days.lines);
    edits[0].cost = "RM 1,250";
    const result = applyFeeLineEdits(days.lines, edits, newId);
    if ("error" in result) throw new Error(result.error);
    expect(result.lines[0]).toMatchObject({ price: line.price, cost: "RM 1,250", sources: line.sources });
    expect(result.changes).toEqual([`${line.label} cost changed`]);
  });

  it("refuses an empty price", () => {
    const edits = asEdits(days.lines);
    edits[0].price = " ";
    expect(applyFeeLineEdits(days.lines, edits, newId)).toHaveProperty("error");
  });

  it("adds a line with a new ID, no sources, and how it's charged", () => {
    const result = applyFeeLineEdits(days.lines, [...asEdits(days.lines), { label: "Support retainer", basis: "monthly", price: "RM 1,500 / month", cost: "" }], newId);
    if ("error" in result) throw new Error(result.error);
    expect(result.lines).toHaveLength(days.lines.length + 1);
    expect(result.lines.at(-1)).toEqual({ id: expect.stringMatching(/^ln_new/), label: "Support retainer", basis: "monthly", price: "RM 1,500 / month", sources: [] });
    expect(result.changes).toEqual(["added Support retainer at RM 1,500 / month"]);
  });

  it("removes a line left out, and keeps what the editor doesn't show on the rest", () => {
    const addOns = olvessa.feeSchedules.find((item) => item.id === "fs_gcm_addons")!;
    const kept = addOns.lines.filter((line) => line.paidTo);
    const result = applyFeeLineEdits(addOns.lines, asEdits(kept), newId);
    if ("error" in result) throw new Error(result.error);
    expect(result.lines).toEqual(kept);
    expect(result.changes).toHaveLength(addOns.lines.length - kept.length);
    expect(result.changes.every((change) => change.startsWith("removed "))).toBe(true);
  });

  it("refuses a line ID that isn't on the list, or one given twice", () => {
    expect(applyFeeLineEdits(days.lines, [{ id: "ln_gone", label: "Gone", basis: "daily", price: "RM 1", cost: "" }], newId)).toHaveProperty("error");
    const edits = asEdits(days.lines);
    expect(applyFeeLineEdits(days.lines, [...edits, edits[0]], newId)).toHaveProperty("error");
  });

  it("never quotes a cost in what it reports", () => {
    const edits = asEdits(days.lines).map((edit) => ({ ...edit, cost: "RM 77,777" }));
    const result = applyFeeLineEdits(days.lines, [...edits, { label: "Architect lead", basis: "daily", price: "RM 5,000", cost: "RM 88,888" }], newId);
    if ("error" in result) throw new Error(result.error);
    expect(result.changes.join(" ")).not.toMatch(/77,777|88,888/);
  });
});

const gridEdits = (from: typeof card): RateCardStructureEdit => ({
  name: from.name,
  columns: from.columns.map((column) => ({ key: column.id, id: column.id, label: column.label })),
  rows: from.rows.map((row) => ({ key: row.id, id: row.id, label: row.label, groupLabel: row.groupLabel })),
  cells: {},
});
let gridSequence = 0;
const gridId = (prefix: "row" | "col") => `${prefix}_new${++gridSequence}`;

describe("applyRateCardEdit (FR-OFR-5)", () => {
  it("changes nothing when the grid comes back as it was", () => {
    const result = applyRateCardEdit(card, gridEdits(card), gridId);
    if ("error" in result) throw new Error(result.error);
    expect(result.changes).toEqual([]);
    expect(result.patch.cells).toEqual(card.cells);
  });

  it("adds a tier and a line, and fills their cells from the editor's keys", () => {
    const edit = gridEdits(card);
    edit.columns.push({ key: "k-col", label: "Enterprise" });
    edit.rows.push({ key: "k-row", label: "Security review", groupLabel: "Run" });
    edit.cells = { "k-row": { col_gro: "RM 5,000", "k-col": "On quote" }, row_dw: { "k-col": "RM 15,000" } };
    const result = applyRateCardEdit(card, edit, gridId);
    if ("error" in result) throw new Error(result.error);
    const tier = result.patch.columns.at(-1)!;
    const line = result.patch.rows.at(-1)!;
    expect(tier).toMatchObject({ label: "Enterprise", sources: [] });
    expect(line).toMatchObject({ label: "Security review", groupLabel: "Run", sources: [] });
    expect(result.patch.cells[line.id]).toEqual({ col_gro: { value: "RM 5,000", sources: [] }, [tier.id]: { value: "On quote", sources: [] } });
    expect(result.patch.cells.row_dw[tier.id]).toEqual({ value: "RM 15,000", sources: [] });
    // Existing cells keep their document sources.
    expect(result.patch.cells.row_dw.col_gro).toEqual(card.cells.row_dw.col_gro);
    expect(result.changes).toEqual(["added the tier Enterprise", "added the line Security review"]);
  });

  it("removes a tier and a line, cells and all", () => {
    const edit = gridEdits(card);
    edit.columns = edit.columns.filter((column) => column.id !== "col_sca");
    edit.rows = edit.rows.filter((row) => row.id !== "row_ccr");
    const result = applyRateCardEdit(card, edit, gridId);
    if ("error" in result) throw new Error(result.error);
    expect(result.patch.cells.row_ccr).toBeUndefined();
    expect(Object.values(result.patch.cells).some((cells) => "col_sca" in cells)).toBe(false);
    expect(result.changes).toEqual(["removed the tier Scale", "removed the line Cloud cost review"]);
  });

  it("renames, keeping the IDs that proposals and runs point at", () => {
    const edit = gridEdits(card);
    edit.name = "Packages 2027";
    edit.columns[0].label = "Starter";
    const result = applyRateCardEdit(card, edit, gridId);
    if ("error" in result) throw new Error(result.error);
    expect(result.patch.columns[0]).toEqual({ ...card.columns[0], label: "Starter" });
    expect(result.changes).toEqual([`renamed ${card.name} to Packages 2027`, "renamed the tier Essentials to Starter"]);
  });

  it("refuses an ID that isn't on the card, or a key given twice", () => {
    const stale = gridEdits(card);
    stale.rows.push({ key: "k", id: "row_gone", label: "Gone" });
    expect(applyRateCardEdit(card, stale, gridId)).toHaveProperty("error");
    const twice = gridEdits(card);
    twice.rows.push({ ...twice.rows[0] });
    expect(applyRateCardEdit(card, twice, gridId)).toHaveProperty("error");
  });
});
