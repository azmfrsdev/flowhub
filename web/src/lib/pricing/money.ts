const MONEY = /(rm|myr|sgd|s\$|usd|us\$|idr|rp)\s*(\d[\d,]*(?:\.\d+)?)/gi;
const CURRENCY_KEY: Record<string, string> = { rm: "MYR", myr: "MYR", sgd: "SGD", "s$": "SGD", usd: "USD", "us$": "USD", idr: "IDR", rp: "IDR" };

/**
 * Money amounts in a string, as "MYR1200" style keys. Amounts are compared,
 * not whole strings, so a cost of "RM 1,200" is the same amount as the
 * "RM1,200" inside "RM1,200 / month". Used by the Ask or tell validator and
 * the Reviewer's hard checks (invariants 1 and 2).
 */
export function moneyTokens(s: string): string[] {
  return moneyMatches(s).map((match) => match.key);
}

/** Each amount with its key and the text as written, so a flagged amount can be shown in its sentence. */
export function moneyMatches(s: string): { key: string; raw: string }[] {
  const out: { key: string; raw: string }[] = [];
  for (const m of s.matchAll(MONEY)) {
    const amount = Number(m[2].replace(/,/g, ""));
    if (!Number.isNaN(amount)) out.push({ key: `${CURRENCY_KEY[m[1].toLowerCase()]}${amount}`, raw: m[0] });
  }
  return out;
}
