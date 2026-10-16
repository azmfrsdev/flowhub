"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FeeScheduleEdit, RateCardEdit, RateCardStructureEdit, applyCellEdits, applyFeeLineEdits, applyRateCardEdit } from "@/lib/offerings/edits";
import { FeeSchedule, RateCard } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { type EditResult, GoneError, createEntity, editEntity, editError, softDeleteEntity } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, ArgRev, parseArgs } from "@/server/workspace/args";

class InvalidEdit extends Error {}

const shortId = (prefix: string) => `${prefix}_${db().collection("_").doc().id.slice(0, 10)}`;

/**
 * FR-OFR-5: a private cost card saves its values as a whole, against the
 * revision the editor opened, so two people can't silently overwrite each
 * other. It is logged without its values: cost appears only on the Pricing
 * and Partners tabs.
 */
export async function saveRateCard(cardId: string, rev: number, edits: unknown): Promise<EditResult> {
  const context = await requireRole("editor");
  [cardId, rev] = parseArgs([ArgId, ArgRev], [cardId, rev]);
  const parsed = RateCardEdit.safeParse(edits);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the prices and try again." };
  try {
    const result = await editEntity(context, "rateCards", cardId, rev, (current) => {
      const card = RateCard.parse(current);
      const { cells, changes } = applyCellEdits(card, parsed.data);
      if (changes.length === 0) return null;
      const summary =
        card.kind === "cost"
          ? `Changed ${changes.length} ${changes.length === 1 ? "cost" : "costs"} on ${card.name}.`
          : `Changed ${changes.length === 1 ? "a price" : `${changes.length} prices`} on ${card.name}: ${changes.slice(0, 3).join("; ")}${changes.length > 3 ? "; …" : ""}.`;
      return { patch: { cells: JSON.parse(JSON.stringify(cells)) }, summary };
    });
    refresh();
    return { ok: true, rev: result.rev };
  } catch (err) {
    return editError(err);
  }
}

/** FR-OFR-5: a pricing grid's name, tiers, lines and prices, saved as a whole. Cost cards keep to their values. */
export async function saveRateCardStructure(cardId: string, rev: number, edit: unknown): Promise<EditResult> {
  const context = await requireRole("editor");
  [cardId, rev] = parseArgs([ArgId, ArgRev], [cardId, rev]);
  const parsed = RateCardStructureEdit.safeParse(edit);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the grid and try again." };
  try {
    const result = await editEntity(context, "rateCards", cardId, rev, (current) => {
      const card = RateCard.parse(current);
      if (card.kind !== "pricing") throw new InvalidEdit("A cost card's lines follow its price card. Change its costs instead.");
      const applied = applyRateCardEdit(card, parsed.data, shortId);
      if ("error" in applied) throw new InvalidEdit(applied.error);
      if (applied.changes.length === 0) return null;
      const { changes } = applied;
      return {
        patch: JSON.parse(JSON.stringify(applied.patch)),
        summary: `Updated ${applied.patch.name}: ${changes.slice(0, 3).join("; ")}${changes.length > 3 ? `; and ${changes.length - 3} more` : ""}.`,
      };
    });
    refresh();
    return { ok: true, rev: result.rev };
  } catch (err) {
    if (err instanceof InvalidEdit) return { ok: false, error: err.message };
    return editError(err);
  }
}

/** FR-OFR-5: a price list's lines (added, changed, removed) and its name, saved as a whole. */
export async function saveFeeSchedule(scheduleId: string, rev: number, edit: unknown): Promise<EditResult> {
  const context = await requireRole("editor");
  [scheduleId, rev] = parseArgs([ArgId, ArgRev], [scheduleId, rev]);
  const parsed = FeeScheduleEdit.safeParse(edit);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the prices and try again." };
  try {
    const result = await editEntity(context, "feeSchedules", scheduleId, rev, (current) => {
      const schedule = FeeSchedule.parse(current);
      const applied = applyFeeLineEdits(schedule.lines, parsed.data.lines, () => shortId("ln"));
      if ("error" in applied) throw new InvalidEdit(applied.error);
      // Man-day rates and add-ons are titled by their section; only a price list of its own has a name to change.
      const name = schedule.section === "other" && parsed.data.name ? parsed.data.name : schedule.name;
      const renamed = name !== schedule.name ? [`renamed it to ${name}`] : [];
      if (applied.changes.length === 0 && renamed.length === 0) return null;
      const priceChanges = [...renamed, ...applied.changes.filter((change) => !change.endsWith("cost changed"))];
      const costChanges = applied.changes.length + renamed.length - priceChanges.length;
      const parts = [priceChanges.length ? priceChanges.slice(0, 3).join("; ") + (priceChanges.length > 3 ? `; and ${priceChanges.length - 3} more` : "") : null, costChanges ? `${costChanges} ${costChanges === 1 ? "cost" : "costs"} changed` : null].filter(Boolean);
      return { patch: { name, lines: JSON.parse(JSON.stringify(applied.lines)) }, summary: `Updated ${schedule.name}: ${parts.join("; ")}.` };
    });
    refresh();
    return { ok: true, rev: result.rev };
  } catch (err) {
    if (err instanceof InvalidEdit) return { ok: false, error: err.message };
    return editError(err);
  }
}

export type PriceSectionKind = "list" | "tiers" | "add_ons" | "man_days";

const SECTION = {
  list: { name: "Price list", section: "other" },
  add_ons: { name: "Add-ons", section: "add_ons" },
  man_days: { name: "Man-day rates", section: "man_days" },
} as const;

/**
 * FR-OFR-5: starts a new pricing section on an offering, by hand. It starts
 * empty and opens in edit mode for its first line. A grid of tiers starts with
 * three tiers to rename.
 */
export async function addPriceSection(offeringId: string, kind: PriceSectionKind): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
  if (!z.enum(["list", "tiers", "add_ons", "man_days"]).safeParse(kind).success) return { ok: false, error: "Choose a kind of pricing." };
  const offering = await db().doc(`workspaces/${context.workspace.id}/offerings/${offeringId}`).get();
  if (!offering.exists || offering.get("deletedAt")) return { ok: false, error: "This offering no longer exists." };
  const name = offering.get("name") as string;
  if (kind === "tiers") {
    const fields = {
      offeringId,
      kind: "pricing",
      name: "Packages",
      columns: ["Basic", "Standard", "Premium"].map((label) => ({ id: shortId("col"), label, sources: [] })),
      rows: [],
      cells: {},
    };
    const id = await createEntity(context, "rateCards", fields, `Added a grid of tiers to the pricing of ${name}.`);
    refresh();
    return { ok: true, id };
  }
  const { name: title, section } = SECTION[kind];
  const id = await createEntity(context, "feeSchedules", { offeringId, name: title, section, lines: [] }, `Added ${title.toLowerCase()} to the pricing of ${name}.`);
  refresh();
  return { ok: true, id };
}

/** Removing a pricing section is a soft delete, logged, and restorable (CLAUDE.md conventions). Cost cards aren't removed by hand. */
export async function removePriceSection(collection: "rateCards" | "feeSchedules", id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await requireRole("editor");
  [collection, id] = parseArgs([z.enum(["rateCards", "feeSchedules"]), ArgId], [collection, id]);
  if (collection !== "rateCards" && collection !== "feeSchedules") return { ok: false, error: "Choose pricing to remove." };
  const snap = await db().doc(`workspaces/${context.workspace.id}/${collection}/${id}`).get();
  if (!snap.exists || snap.get("deletedAt")) return { ok: false, error: new GoneError().message };
  if (collection === "rateCards" && snap.get("kind") !== "pricing") return { ok: false, error: "A cost card can't be removed here." };
  try {
    await softDeleteEntity(context, collection, id, `Removed ${snap.get("name") as string} from the pricing.`);
  } catch (err) {
    const result = editError(err);
    return { ok: false, error: result.ok ? "Try again." : result.error };
  }
  refresh();
  return { ok: true };
}
