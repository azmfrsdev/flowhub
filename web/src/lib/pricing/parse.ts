/**
 * Reads free-text prices (ADR-0001 D6). Prices stay free text in the graph;
 * this parser only interprets them, at read time, for on-screen margins,
 * pricing totals and Ask or tell answers. Anything it can't read is returned
 * as `unparsed`, and callers show it as "On quote". It never guesses.
 */

export type ParsedPrice =
  | {
      kind: "amount";
      currency: string;
      amount: number;
      /** Unit the amount is charged per, e.g. "VM", "GB", "dashboard". */
      per?: string;
      /** Recurring period, e.g. "month". With `per`, "RM 9 / employee / month" sets both. */
      recurring?: "month" | "year" | "week" | "day";
      minQuantity?: number;
      minAmount?: number;
    }
  | { kind: "percent"; rate: number; minAmount?: number; currency?: string }
  | { kind: "waived" }
  | { kind: "included" }
  | { kind: "on_quote" }
  | { kind: "unparsed" };

const CURRENCY_ALIASES: Record<string, string> = {
  RM: "MYR",
  MYR: "MYR",
  SGD: "SGD",
  S$: "SGD",
  USD: "USD",
  US$: "USD",
  IDR: "IDR",
  RP: "IDR",
};

const RECURRING: Record<string, "month" | "year" | "week" | "day"> = {
  month: "month",
  mo: "month",
  year: "year",
  yr: "year",
  annum: "year",
  week: "week",
  day: "day",
};

const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const CURRENCY = String.raw`(RM|MYR|SGD|S\$|USD|US\$|IDR|Rp)`;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function currencyOf(token: string | undefined, fallback: string): string {
  if (!token) return fallback;
  return CURRENCY_ALIASES[token.toUpperCase()] ?? fallback;
}

export function parsePrice(text: string, defaultCurrency = "MYR"): ParsedPrice {
  const t = text.trim().replace(/\s+/g, " ");
  const lower = t.toLowerCase();

  if (/^(waived|free|no charge)$/.test(lower)) return { kind: "waived" };
  if (/^(included|inclusive)$/.test(lower)) return { kind: "included" };
  if (/^(on quote|on request|quote on request|tbc|to be quoted|poa|price on application)$/.test(lower)) {
    return { kind: "on_quote" };
  }

  // Percentage, optionally with a minimum: "1.2% min RM 0.20"
  const pct = new RegExp(String.raw`^${NUMBER}\s*%(?:\s*,?\s*min(?:imum)?\.?\s*${CURRENCY}?\s*${NUMBER})?$`, "i").exec(t);
  if (pct) {
    const result: ParsedPrice = { kind: "percent", rate: toNumber(pct[1]) };
    if (pct[3]) {
      result.minAmount = toNumber(pct[3]);
      result.currency = currencyOf(pct[2], defaultCurrency);
    }
    return result;
  }

  // Amount: "RM 380 / VM, min 50 VMs", "RM 4,500 / month", "RM 25 / user, min RM 5,000",
  // and a unit with a period: "RM 9 / employee / month", "RM 380 / unit / year"
  const amount = new RegExp(
    String.raw`^${CURRENCY}?\s*${NUMBER}` + // currency and number
      String.raw`(?:\s*(?:/|per)\s*([A-Za-z][A-Za-z ]{0,20}?))?` + // per unit or period
      String.raw`(?:\s*(?:/|per)\s*([A-Za-z]+))?` + // then a period, after a unit
      String.raw`(?:\s*,?\s*min(?:imum)?\.?\s*(?:${CURRENCY}\s*${NUMBER}|${NUMBER}\s*[A-Za-z]*))?$`,
    "i",
  ).exec(t);
  if (amount) {
    const [, cur, num, unitRaw, periodRaw, minCur, minAmt, minQty] = amount;
    const result: Extract<ParsedPrice, { kind: "amount" }> = {
      kind: "amount",
      currency: currencyOf(cur, defaultCurrency),
      amount: toNumber(num),
    };
    if (unitRaw) {
      const unit = unitRaw.trim();
      const period = RECURRING[unit.toLowerCase()];
      if (periodRaw) {
        // Only "unit then period" reads: "RM 5 / GB / VM" or "RM 5 / month / year" doesn't.
        const second = RECURRING[periodRaw.toLowerCase()];
        if (period || !second) return { kind: "unparsed" };
        result.per = unit;
        result.recurring = second;
      } else if (period) result.recurring = period;
      else result.per = unit;
    }
    if (minAmt) {
      result.minAmount = toNumber(minAmt);
      if (minCur) result.currency = currencyOf(cur ?? minCur, defaultCurrency);
    } else if (minQty) {
      result.minQuantity = toNumber(minQty);
    }
    return result;
  }

  return { kind: "unparsed" };
}

/** Formats an amount the way the catalogue writes it: "RM 30,400". */
export function formatAmount(amount: number, currency: string): string {
  const symbol = currency === "MYR" ? "RM" : currency;
  const fixed = Number.isInteger(amount) ? amount.toLocaleString("en-MY") : amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol} ${fixed}`;
}
