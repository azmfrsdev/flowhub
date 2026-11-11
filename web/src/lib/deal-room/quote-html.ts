import { formatAmount } from "@/lib/pricing/parse";
import type { Quote } from "@/lib/schema";

/**
 * FR-QUO-6: the approved quote as HTML for Google Docs to convert (ADR-0019
 * D6). Every figure comes from the quote's stored totals, worked out by code.
 * Nothing private: quotes hold only sell prices (invariant 2).
 */

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderQuoteHtml(quote: Quote, context: { seller: string; prospect: string; contact: string | null; date: string; validUntil: string }): string {
  const money = (n: number) => escape(formatAmount(n, quote.totals.currency));
  const amounts = new Map(quote.totals.lines.map((line) => [line.lineId, line]));
  const cell = "border:1px solid #999;padding:6px 8px;vertical-align:top";
  const right = `${cell};text-align:right`;
  const rows = quote.lines
    .filter((line) => line.include)
    .map((line) => {
      const amount = amounts.get(line.id);
      const unit = line.unpriced ? (line.personPrice ?? "") : line.valueText;
      const qty = line.quantity === null ? "1" : String(line.quantity);
      const value = amount?.amount === null || amount?.amount === undefined ? escape(amount?.text ?? "") : amount.amount === 0 ? escape(amount.text) : `${money(amount.amount)}${amount.recurring ? ` / ${escape(amount.recurring)}` : ""}`;
      return `<tr><td style="${cell}"><b>${escape(line.label)}</b><br><span style="color:#555">${escape(line.scope === line.label ? "" : line.scope)}</span></td><td style="${right}">${escape(qty)}</td><td style="${right}">${escape(unit)}</td><td style="${right}">${value}</td></tr>`;
    })
    .join("");
  const total = (label: string, value: string, bold = false) => `<tr><td colspan="3" style="${right}">${bold ? `<b>${label}</b>` : label}</td><td style="${right}">${bold ? `<b>${value}</b>` : value}</td></tr>`;
  const recurring = quote.totals.recurring.length
    ? `<h3>Recurring charges</h3><p>${quote.totals.recurring.map((item) => `${money(item.amount)} per ${escape(item.period)}`).join(", ")}, plus ${escape(quote.tax.label)} at ${quote.tax.rate}%. Billed separately, not included in the total above.</p>`
    : "";
  return [
    `<h1>Quote ${escape(quote.number)}</h1>`,
    `<p><b>From:</b> ${escape(context.seller)}<br><b>To:</b> ${escape(context.prospect)}${context.contact ? `, attention ${escape(context.contact)}` : ""}<br><b>Date:</b> ${escape(context.date)}<br><b>Valid until:</b> ${escape(context.validUntil)}</p>`,
    `<table style="border-collapse:collapse;width:100%"><thead><tr><th style="${cell}">Item</th><th style="${right}">Qty</th><th style="${right}">Unit price</th><th style="${right}">Amount</th></tr></thead><tbody>${rows}`,
    total("Subtotal", money(quote.totals.subtotal)),
    quote.discountPercent ? total(`Discount ${quote.discountPercent}%`, `−${money(quote.totals.discount)}`) : "",
    quote.tax.rate ? total(`${escape(quote.tax.label)} ${quote.tax.rate}%`, money(quote.totals.tax)) : "",
    total(`Total (${escape(quote.totals.currency)})`, money(quote.totals.total), true),
    `</tbody></table>`,
    recurring,
    `<p style="color:#555">Prices in ${escape(quote.totals.currency)}. Amounts were calculated from ${escape(context.seller)}'s current price list. Approved by ${escape(quote.approvedBy ?? "")}.</p>`,
  ].join("\n");
}
