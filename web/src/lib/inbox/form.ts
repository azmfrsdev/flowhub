import type { InboxForm, InboxMatch } from "@/lib/schema";
import type { CatalogueOffering } from "./triage";

/**
 * Website form leads, the parts code decides (PRD 7.30, ADR-0022). Pure and
 * deterministic. A form answer is read like an email: these functions turn it
 * into the text Gemini reads and code checks quotes against, and map the
 * ticked services to live offerings by name, never by the model.
 */

/** The form's title, also the item's subject: "Talk to Olvessa" for "Olvessa Cloud". */
export const formTitle = (seller: string) => `Talk to ${seller.trim().split(/\s+/)[0] || seller}`;

/**
 * Live offerings, the checkboxes on the form: active, not deleted, not
 * restricted (invariant 7). Names only. Each sub-offering follows its parent.
 */
export function formServices(offerings: (Pick<CatalogueOffering, "id" | "name" | "status" | "restricted" | "deletedAt"> & { parentId?: string | null })[]): string[] {
  const live = offerings.filter((offering) => !offering.deletedAt && !offering.restricted && offering.status === "active");
  const ids = new Set(live.map((offering) => offering.id));
  const roots = live.filter((offering) => !offering.parentId || !ids.has(offering.parentId));
  return roots.flatMap((root) => [root, ...live.filter((offering) => offering.parentId === root.id)]).map((offering) => offering.name.trim());
}

const fold = (name: string) => name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * FR-FORM-5: each ticked service counts only if it names a live offering
 * exactly (ignoring case and spacing). Unknown, renamed, retired and
 * restricted names are dropped and counted.
 */
export function mapServices(ticked: string[], offerings: CatalogueOffering[]): { matches: InboxMatch[]; dropped: number } {
  const live = offerings.filter((offering) => !offering.deletedAt && !offering.restricted && offering.status === "active");
  const byName = new Map(live.map((offering) => [fold(offering.name), offering]));
  const matches: InboxMatch[] = [];
  let dropped = 0;
  for (const name of new Set(ticked.map(fold).filter(Boolean))) {
    const offering = byName.get(name);
    if (!offering) dropped += 1;
    else if (!matches.some((match) => match.offeringId === offering.id)) matches.push({ offeringId: offering.id, label: offering.name });
  }
  return { matches, dropped };
}

/** The company website, if it reads as one: http(s) with a dotted host, normalised. Anything else is ignored. */
export function formWebsite(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) || url.username || url.password) return null;
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return null;
  }
}

/** The answers as text, which Gemini reads and every quote is checked against. Empty answers are left out. */
export function formBody(form: InboxForm): string {
  const website = formWebsite(form.website);
  const lines = [
    form.name && `Name: ${form.name}`,
    `Work email: ${form.email}`,
    form.company && `Company: ${form.company}`,
    website && `Company website: ${website}`,
    form.services.length > 0 && `Services ticked: ${form.services.join("; ")}`,
    form.timeline && `When they want to start: ${form.timeline}`,
  ].filter(Boolean);
  return [...lines, "", "Message:", form.message.trim() || "(no message)"].join("\n");
}

/**
 * What a reason may quote (FR-FORM-7): the person's own words, which are the
 * message and the timeline they chose. The other lines are fields (name,
 * company, ticked boxes): a quote of "Services ticked: …" is not a need
 * described in the person's own words, and the boxes already count by code.
 */
export function formQuotable(form: InboxForm): string {
  return [form.timeline && `When they want to start: ${form.timeline}`, form.message.trim()].filter(Boolean).join("\n\n");
}

/** A message this short says nothing a person wrote about a need, so the answer can't be a clear lead (FR-FORM-7). */
export const THIN_MESSAGE = 30;
export const isThin = (form: Pick<InboxForm, "message">) => form.message.replace(/\s+/g, " ").trim().length < THIN_MESSAGE;

/** `wf_` and the form's response ID: a second send of the same answer finds the first item. */
export const formItemId = (responseId: string) => `wf_${responseId}`;
