import { checkSellingRules } from "@/lib/deal-room/fit";
import { CLEAR_LEAD, COUNTRIES, type Constraint, type InboxItem, type InboxMatch, type InboxReading, type InboxReason, type InboxVerdict } from "@/lib/schema";

/**
 * Gmail inbox leads, the parts code decides (PRD 7.27, ADR-0020 D3). Pure and
 * deterministic: the pipeline supplies Gemini's reading, and these functions
 * decide what of it is kept, which company it is, whether it is already a
 * deal, and the score and verdict.
 */

const FREE_MAIL = /(^|\.)(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|proton|protonmail|pm|aol|gmx|mail|zoho|yandex)\.((com|co|net)(\.[a-z]{2})?|my|me|sg|uk)$/i;

/** A free-mail domain says nothing about the sender's company. */
export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.test(domain) || /^(proton\.me|pm\.me|me\.com)$/i.test(domain);
}

/** "Hafiz Rahman <hafiz@pelitawaris.com.my>" → name and lower-case address. */
export function parseSender(from: string): { name: string; email: string } | null {
  const angle = from.match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  const email = (angle ? angle[2] : from.trim()).toLowerCase();
  if (!/^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  const name = (angle?.[1] ?? "").trim() || email.split("@")[0];
  return { name, email };
}

export const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/** The host of a website or address, without "www.". */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("@") && !value.includes("/")) return domainOf(value) || null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Same organisation: equal hosts, or one a subdomain of the other ("mail.acme.com.my" and "acme.com.my"). */
export function sameDomain(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

const TLD_COUNTRY: Record<string, keyof typeof COUNTRIES> = { my: "MY", sg: "SG", id: "ID", th: "TH", ph: "PH", vn: "VN" };

/** A country only when the domain says so (".com.my"); ".com" says nothing. */
export function countryOfDomain(domain: string): string | undefined {
  return TLD_COUNTRY[domain.split(".").at(-1) ?? ""];
}

/* ---------- The word-for-word check ---------- */

const QUOTE_CHARS = /[‘’“”"'`]/;

/**
 * Where a quote sits in the email, comparing as `normaliseText` does: case,
 * runs of spaces and line breaks, quote marks and dash styles are ignored;
 * every other character must match. Returns the span in the original text, so
 * the item page highlights exactly what passed the check.
 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const fold = (s: string) => {
    const chars: string[] = [];
    const at: number[] = [];
    let space = false;
    for (let i = 0; i < s.length; i += 1) {
      let c = s[i];
      if (QUOTE_CHARS.test(c)) continue;
      if (/\s/.test(c)) {
        if (!space && chars.length) {
          chars.push(" ");
          at.push(i);
        }
        space = true;
        continue;
      }
      space = false;
      if (c === "–" || c === "—") c = "-";
      chars.push(c.toLowerCase());
      at.push(i);
    }
    while (chars.at(-1) === " ") {
      chars.pop();
      at.pop();
    }
    return { folded: chars.join(""), at };
  };
  const wanted = fold(quote).folded.replace(/[.,;:!?]+$/, "");
  if (wanted.length < 6) return null;
  const source = fold(text);
  const index = source.folded.indexOf(wanted);
  if (index === -1) return null;
  return { start: source.at[index], end: source.at[index + wanted.length - 1] + 1 };
}

export const quoteFound = (text: string, quote: string) => locateQuote(text, quote) !== null;

/** What the model may quote: the subject and the body, as the person sees them. */
export const emailText = (subject: string, body: string) => `${subject}\n\n${body}`;

/** FR-INBOX-4: keeps a reason only if its quote is in the email word for word, and counts the rest. */
export function checkReasons(text: string, reasons: InboxReading["reasons"]): { kept: InboxReason[]; dropped: number } {
  const kept: InboxReason[] = [];
  for (const reason of reasons) {
    if (!quoteFound(text, reason.quote)) continue;
    if (kept.some((other) => other.quote === reason.quote && other.kind === reason.kind)) continue;
    kept.push({ kind: reason.kind, text: reason.text.trim(), quote: reason.quote.trim() });
  }
  return { kept, dropped: reasons.length - kept.length };
}

/* ---------- Company, offerings, known deals ---------- */

/** A name for a company known only by its domain: "pelitawaris.com.my" → "Pelitawaris". */
export function nameFromDomain(domain: string): string {
  const label = domain.split(".").find((part) => part.length > 2 && !["www", "mail"].includes(part)) ?? domain.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * FR-INBOX-5: the company comes from the sender's address. The model's name
 * for it is used only when the email itself writes that name, word for word.
 * From free mail, that written name is the only way to know the company
 * (amended 2026-11-12: small firms often sell and buy from free mail);
 * without it the company is unknown.
 */
export function companyOf(senderEmail: string, modelName: string | undefined, text: string): InboxItem["company"] {
  const domain = domainOf(senderEmail);
  const name = modelName?.trim();
  const checked = name && name.length >= 3 && quoteFound(text, name) ? name : null;
  if (isFreeMail(domain)) return { name: checked, domain: null, freeMail: true, nameFromEmail: Boolean(checked) };
  const country = countryOfDomain(domain);
  return { name: checked ?? nameFromDomain(domain), domain, freeMail: false, ...(country ? { country } : {}), nameFromEmail: Boolean(checked) };
}

export type CatalogueOffering = { id: string; name: string; summary: string; status: string; restricted?: boolean; deletedAt?: string | null; features: { id: string; name: string; description: string; status: string }[] };

/** The list Gemini picks from: live offerings and their active features. Names and summaries only, never prices or cost (invariant 2), and nothing restricted (invariant 7). */
export function inboxCatalogue(offerings: CatalogueOffering[]): { ref: string; line: string; match: InboxMatch }[] {
  return offerings
    .filter((offering) => !offering.deletedAt && !offering.restricted && offering.status !== "retired")
    .flatMap((offering) => [
      { ref: offering.id, line: `${offering.id}: ${offering.name}. ${offering.summary}`.trim(), match: { offeringId: offering.id, label: offering.name } },
      ...offering.features
        .filter((feature) => feature.status === "active")
        .map((feature) => ({ ref: `${offering.id}/${feature.id}`, line: `${offering.id}/${feature.id}: ${feature.name} (part of ${offering.name}). ${feature.description}`.trim(), match: { offeringId: offering.id, featureId: feature.id, label: feature.name } })),
    ]);
}

/** FR-INBOX-5: offerings count only if live. Unknown references are dropped; a feature and its offering count once. */
export function checkMatches(refs: string[], catalogue: ReturnType<typeof inboxCatalogue>): InboxMatch[] {
  const byRef = new Map(catalogue.map((entry) => [entry.ref, entry.match]));
  const kept: InboxMatch[] = [];
  for (const ref of new Set(refs.map((value) => value.trim()))) {
    const match = byRef.get(ref);
    if (match && !kept.some((other) => other.offeringId === match.offeringId && other.featureId === match.featureId)) kept.push(match);
  }
  // An offering named alongside one of its own features adds nothing.
  return kept.filter((match) => match.featureId || !kept.some((other) => other.featureId && other.offeringId === match.offeringId));
}

export type KnownDeal = { id: string; name: string | null; website?: string | null; contactEmail?: string | null; deletedAt?: string | null };

/**
 * FR-INBOX-6: is this email about a deal already open? The same Gmail thread
 * as an earlier email linked to a deal, the same contact address, or, for a
 * company address, the same domain as the deal's website or contact. Free
 * mail never matches on domain alone.
 */
export function findKnownDeal(input: { senderEmail: string; threadId: string; deals: KnownDeal[]; threadDeals: Map<string, string> }): KnownDeal | null {
  const live = input.deals.filter((deal) => !deal.deletedAt);
  const byThread = input.threadDeals.get(input.threadId);
  if (byThread) {
    const deal = live.find((item) => item.id === byThread);
    if (deal) return deal;
  }
  const email = input.senderEmail.toLowerCase();
  const exact = live.find((deal) => deal.contactEmail?.toLowerCase() === email);
  if (exact) return exact;
  const domain = domainOf(email);
  if (isFreeMail(domain)) return null;
  return live.find((deal) => sameDomain(hostOf(deal.website), domain) || (deal.contactEmail && sameDomain(domainOf(deal.contactEmail), domain))) ?? null;
}

/** A partner recorded in the hub, by its contacts' company domains. Its emails are suppliers' emails, not leads. */
export function findPartner(senderEmail: string, partners: { name: string; website?: string | null; contacts: { email?: string }[] }[]): string | null {
  const domain = domainOf(senderEmail);
  if (isFreeMail(domain)) return null;
  const hit = partners.find((partner) => sameDomain(hostOf(partner.website), domain) || partner.contacts.some((contact) => contact.email && sameDomain(domainOf(contact.email), domain)));
  return hit?.name ?? null;
}

/* ---------- Score and verdict ---------- */

export const SCORE = { perMatch: 10, maxMatches: 4, request: 20, deadline: 10, budget: 10, need: 10, company: 10, namedOnFreeMail: 5 } as const;

/**
 * FR-INBOX-7: the score, out of 100, calculated in code from what survived the
 * checks: live offerings matched, and quoted reasons of each kind.
 */
export function scoreEmail(input: { matches: number; kinds: Set<InboxReason["kind"]>; company: Pick<InboxItem["company"], "freeMail" | "name"> }): { score: number; breakdown: { label: string; points: number }[] } {
  const { freeMail, name } = input.company;
  const companyRow = !freeMail
    ? { label: "Company address, not free mail", points: SCORE.company }
    : name
      ? { label: "Free mail, but the email names its company", points: SCORE.namedOnFreeMail }
      : { label: "Free mail address: company unknown", points: 0 };
  const matched = Math.min(SCORE.maxMatches, input.matches);
  const breakdown = [
    { label: `Live offerings it matches (${input.matches})`, points: matched * SCORE.perMatch },
    { label: "Asks for a proposal, a quote or a meeting", points: input.kinds.has("request") ? SCORE.request : 0 },
    { label: "Describes a need in its own words", points: input.kinds.has("need") ? SCORE.need : 0 },
    { label: "Names a deadline", points: input.kinds.has("deadline") ? SCORE.deadline : 0 },
    { label: "Mentions budget", points: input.kinds.has("budget") ? SCORE.budget : 0 },
    companyRow,
  ];
  return { score: Math.min(100, breakdown.reduce((sum, row) => sum + row.points, 0)), breakdown };
}

/**
 * FR-INBOX-8: the verdict. Code only lowers what Gemini said, never raises it.
 * - A known deal is an existing deal, unless Gemini read it as no lead at all.
 * - A partner's email, or Gemini's "not a lead", is not a lead.
 * - A lead needs a score of 70 or more, a known company (a company address,
 *   or a company the email names word for word), a live offering and no
 *   broken selling rule; otherwise it is a maybe for a person.
 * - "Existing deal" from Gemini with no deal found by code is a maybe.
 * - `override`: a person said it is a lead, so it is never filed again.
 * - `thin`: a website form answer with next to no message (PRD 7.30) is at
 *   most a maybe, however many services it ticked.
 */
export function decideVerdict(input: { model: InboxVerdict; knownDeal: boolean; partner: boolean; score: number; companyKnown: boolean; matches: number; rulesBroken: number; override?: boolean; thin?: boolean }): InboxVerdict {
  if (input.knownDeal && input.model !== "not_a_lead") return "existing_deal";
  if (!input.override && (input.partner || input.model === "not_a_lead")) return "not_a_lead";
  const clear = input.model === "lead" && input.score >= CLEAR_LEAD && input.companyKnown && input.matches > 0 && input.rulesBroken === 0 && !input.thin;
  return clear ? "lead" : "maybe";
}

/** FR-INBOX-5: selling rules, checked on the email and the company it comes from. */
export function inboxRuleConflicts(rules: Constraint[], input: { text: string; company: InboxItem["company"] }) {
  return checkSellingRules(rules, { country: input.company.country ?? null, text: [input.company.name ?? "", input.text].join(" ") }).map((conflict) => ({ reason: conflict.reason }));
}

/** Gmail label names the script applies (decision 3). */
export function gmailLabel(item: Pick<InboxItem, "verdict" | "dealName" | "status">): string {
  if (item.verdict === "existing_deal" && item.dealName) return `FlowHub · ${item.dealName}`;
  if (item.status === "dismissed") return "FlowHub · Not a lead";
  return { lead: "FlowHub · Lead", maybe: "FlowHub · Maybe", existing_deal: "FlowHub · Existing deal", not_a_lead: "FlowHub · Not a lead" }[item.verdict];
}

