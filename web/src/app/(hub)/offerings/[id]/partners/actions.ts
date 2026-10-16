"use server";

import { FieldValue } from "firebase-admin/firestore";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/flowhub/edit-dialog";
import { Offering, Partner } from "@/lib/schema";
import { db } from "@/server/firebase/admin";
import { softDeleteBatch } from "@/server/graph/delete";
import { GoneError, createEntity, editEntity, editError } from "@/server/graph/write";
import { requireRole } from "@/server/workspace/access";
import { ArgId, parseArgs } from "@/server/workspace/args";

const PartnerInput = z.object({
  name: z.string().trim().min(1, "Name the company.").max(120),
  relationship: z.enum(["partner", "vendor", "supplier"]),
  covers: z
    .string()
    .trim()
    .max(300)
    .transform((text) => text.split(",").map((item) => item.trim()).filter(Boolean)),
  arrangement: z.string().trim().max(300),
  /** PRIVATE (invariant 2): shown only on the Partners tab, never to an agent or a proposal. */
  buyPrice: z.string().trim().max(120),
  region: z.string().trim().max(80),
  contactName: z.string().trim().max(120),
  contactRole: z.string().trim().max(120),
  contactEmail: z.union([z.literal(""), z.email("Enter an email address like name@company.com.")]),
  contactPhone: z.string().trim().max(40),
});

const FIELDS = ["name", "relationship", "covers", "arrangement", "buyPrice", "region", "contactName", "contactRole", "contactEmail", "contactPhone"] as const;

function partnerInput(formData: FormData) {
  return PartnerInput.safeParse(Object.fromEntries(FIELDS.map((key) => [key, String(formData.get(key) ?? "").trim()])));
}

function partnerFields(data: z.output<typeof PartnerInput>) {
  const { contactName, contactRole, contactEmail, contactPhone, arrangement, buyPrice, region, ...rest } = data;
  const contact = contactName ? [{ name: contactName, ...(contactRole ? { role: contactRole } : {}), ...(contactEmail ? { email: contactEmail } : {}), ...(contactPhone ? { phone: contactPhone } : {}) }] : [];
  return { ...rest, arrangement, buyPrice, region, contacts: contact };
}

/**
 * FR-OFR-6: a partner, vendor or supplier on this offering, by hand. Either a
 * company already in the hub (linked, not copied: each is stored once), or a new one.
 */
export async function addPartner(offeringId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const context = await requireRole("editor");
  [offeringId] = parseArgs([ArgId], [offeringId]);
  const existingId = String(formData.get("existingId") ?? "");
  let partnerId = existingId;
  let name = "";
  if (existingId) {
    const snap = await db().doc(`workspaces/${context.workspace.id}/partners/${parseArgs([ArgId], [existingId])[0]}`).get();
    if (!snap.exists || snap.get("deletedAt")) return { error: "That company is no longer in the hub." };
    name = String(snap.get("name"));
  } else {
    const input = partnerInput(formData);
    if (!input.success) return { error: input.error.issues[0]?.message };
    const { arrangement, buyPrice, region, ...fields } = partnerFields(input.data);
    name = fields.name;
    partnerId = await createEntity(context, "partners", { ...fields, ...(arrangement ? { arrangement } : {}), ...(buyPrice ? { buyPrice } : {}), ...(region ? { region } : {}), technology: [] }, `Added the ${fields.relationship} ${fields.name}.`);
  }
  try {
    await editEntity(context, "offerings", offeringId, null, (current) => {
      const offering = Offering.parse(current);
      if (offering.partnerIds.includes(partnerId)) return null;
      return { patch: { partnerIds: [...offering.partnerIds, partnerId] }, summary: `Added ${name} to ${offering.name}.` };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

export async function updatePartner(partnerId: string, _previous: FormResult, formData: FormData): Promise<FormResult> {
  const context = await requireRole("editor");
  [partnerId] = parseArgs([ArgId], [partnerId]);
  const input = partnerInput(formData);
  if (!input.success) return { error: input.error.issues[0]?.message };
  const { arrangement, buyPrice, region, ...fields } = partnerFields(input.data);
  try {
    await editEntity(context, "partners", partnerId, null, (current) => {
      const partner = Partner.parse(current);
      const next = { ...fields, arrangement, buyPrice, region };
      const before = { name: partner.name, relationship: partner.relationship, covers: partner.covers, contacts: partner.contacts.slice(0, 1), arrangement: partner.arrangement ?? "", buyPrice: partner.buyPrice ?? "", region: partner.region ?? "" };
      if (JSON.stringify(before) === JSON.stringify({ ...next, contacts: next.contacts })) return null;
      return {
        patch: {
          ...JSON.parse(JSON.stringify({ ...fields, contacts: [...fields.contacts, ...partner.contacts.slice(1)] })),
          arrangement: arrangement || FieldValue.delete(),
          buyPrice: buyPrice || FieldValue.delete(),
          region: region || FieldValue.delete(),
        },
        // Invariant 2: the audit names the company, never its buy price.
        summary: `Edited the ${fields.relationship} ${fields.name}.`,
      };
    });
  } catch (err) {
    const result = editError(err);
    return { error: result.ok ? undefined : result.error };
  }
  refresh();
  return { ok: Date.now() };
}

/** Takes a partner off this offering. The company stays in the hub for the offerings it's still on. */
export async function unlinkPartner(offeringId: string, partnerId: string): Promise<void> {
  const context = await requireRole("editor");
  [offeringId, partnerId] = parseArgs([ArgId, ArgId], [offeringId, partnerId]);
  await editEntity(context, "offerings", offeringId, null, (current) => {
    const offering = Offering.parse(current);
    if (!offering.partnerIds.includes(partnerId)) return null;
    return { patch: { partnerIds: offering.partnerIds.filter((id) => id !== partnerId) }, summary: `Took a partner off ${offering.name}.` };
  });
  refresh();
}

/** Deletes the company from the hub, so it leaves every offering it was on. The recycle bin can bring it back. */
export async function deletePartner(partnerId: string): Promise<FormResult> {
  const context = await requireRole("editor");
  [partnerId] = parseArgs([ArgId], [partnerId]);
  const snap = await db().doc(`workspaces/${context.workspace.id}/partners/${partnerId}`).get();
  if (!snap.exists || snap.get("deletedAt")) return { error: new GoneError().message };
  await softDeleteBatch(context, `Partner: ${snap.get("name")}`, [{ collection: "partners", id: partnerId }], `Deleted the ${snap.get("relationship") ?? "partner"} ${snap.get("name")}.`);
  refresh();
  return { ok: Date.now() };
}
