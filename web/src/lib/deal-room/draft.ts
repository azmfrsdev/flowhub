import type { BriefOutput, FitOutput, WriteOutput } from "@/lib/schema";
import { pricingGroups } from "./pricing-groups";
import { renderPrices } from "./review";

/**
 * The one HTML renderer for a proposal (ADR-0007): the in-app preview, the
 * copy fallback and the Google Doc all come from here. Prices are filled from
 * the approved pricing lines by code; nothing the model typed becomes a price.
 */

export type DraftContext = {
  prospect: string;
  seller: string;
  date: string;
  titles: Record<string, string>;
  lines: FitOutput["pricing"]["lines"];
  brief: Pick<BriefOutput, "claims" | "sources">;
};

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Research sources the draft relies on, numbered in order of first use (FR-WRI-1). */
export function citedSources(working: WriteOutput, brief: DraftContext["brief"]) {
  const claimIds = working.claims.filter((claim) => claim.decision !== "remove").flatMap((claim) => claim.refs.filter((ref) => ref.startsWith("c:")).map((ref) => ref.slice(2)));
  const sourceIds: string[] = [];
  for (const id of claimIds) for (const sourceId of brief.claims.find((claim) => claim.id === id)?.sourceIds ?? []) if (!sourceIds.includes(sourceId) && brief.sources[sourceId]) sourceIds.push(sourceId);
  return sourceIds.map((id) => brief.sources[id]);
}

export function renderDraftHtml(working: WriteOutput, context: DraftContext, options: { highlight?: boolean } = {}): string {
  const marks = options.highlight
    ? working.claims.filter((claim) => claim.decision !== "remove" && (claim.support === "neither" || claim.decision === "accept_as_seller"))
    : [];

  const inline = (blockId: string, raw: string) => {
    let html = escape(renderPrices(raw, context.lines).text);
    for (const claim of marks.filter((item) => item.blockId === blockId)) {
      const target = escape(claim.text);
      const at = html.indexOf(target);
      if (at === -1) continue;
      const kind = claim.decision === "accept_as_seller" ? "seller" : "flag";
      html = `${html.slice(0, at)}<mark class="${kind}" data-claim="${claim.id}">${target}</mark>${html.slice(at + target.length)}`;
    }
    return html;
  };

  const parts: string[] = [];
  const title = working.blocks.find((block) => block.kind === "heading");
  parts.push(`<h1>${escape(title?.text ?? `Proposal for ${context.prospect}`)}</h1>`);
  parts.push(`<p class="meta">Prepared for ${escape(context.prospect)} by ${escape(context.seller)} · ${escape(context.date)}</p>`);

  for (const block of working.blocks) {
    if (block.kind === "heading") continue;
    const heading = context.titles[block.section];
    if (heading) parts.push(`<h2>${escape(heading)}</h2>`);
    if (block.kind === "bullets") {
      const items = block.text.split("\n").map((line) => line.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean);
      parts.push(`<ul>${items.map((item) => `<li>${inline(block.id, item)}</li>`).join("")}</ul>`);
    } else if (block.kind === "pricing_table") {
      if (block.text.trim()) parts.push(`<p>${inline(block.id, block.text)}</p>`);
      const rows = pricingGroups(context.lines).flatMap((group) => [
        `<tr class="group"><th colspan="2">${escape(group.title)}</th></tr>`,
        ...group.lines.map((line) => `<tr><td>${escape(line.label)}</td><td class="price">${escape(line.valueText)}${line.total ? ` (${escape(line.total)})` : ""}</td></tr>`),
        ...(group.subtotal ? [`<tr class="subtotal"><td>Subtotal</td><td class="price">${escape(group.subtotal)}</td></tr>`] : []),
      ]);
      parts.push(rows.length ? `<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : "<p>Pricing on quote.</p>");
      parts.push(`<p class="note">Indicative pricing, before tax. One-time, recurring and per-unit amounts are shown separately and never added together.</p>`);
    } else {
      parts.push(`<p>${inline(block.id, block.text)}</p>`);
    }
  }

  const sources = citedSources(working, context.brief);
  if (sources.length) {
    parts.push("<h2>Sources</h2>");
    const link = (uri: string, label: string) => (/^https?:\/\//i.test(uri) ? `<a href="${escape(uri)}">${escape(label)}</a>` : escape(label));
    parts.push(`<ol class="sources">${sources.map((source) => `<li>${link(source.groundingUri, source.domain)}${source.title && source.title !== source.domain ? ` · ${escape(source.title)}` : ""}</li>`).join("")}</ol>`);
  }
  return parts.join("\n");
}

/** Plain text for the clipboard's text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(h1|h2|p|li|tr|ol|ul|table)>/g, "\n")
    .replace(/<li>/g, "• ")
    .replace(/<\/t[dh]>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
