/**
 * Matching words against a source (invariants 1 and 6): a message, or a PDF
 * page's text. Comparisons ignore case, spacing, quote and dash styles, and
 * ligatures, so PDF text and typed text compare fairly; nothing else is fuzzy.
 */

/** Lower-case, collapse whitespace, unify quotes, dashes and ligatures (PDF text uses "ﬁ"). */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prices compare without spaces or thousands separators: "RM19,500" matches "RM 19500". */
export function normalisePrice(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s,]/g, "");
}

export function priceAppearsIn(price: string, source: string): boolean {
  const p = normalisePrice(price);
  return p.length > 0 && normalisePrice(source).includes(p);
}

export function evidenceAppearsIn(evidence: string, source: string): boolean {
  const e = normaliseText(evidence).replace(/[.,;:!?]+$/, "");
  return e.length > 0 && normaliseText(source).includes(e);
}
