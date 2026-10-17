/**
 * FR-SEND-1, ADR-0016 D1: a Gmail compose window, filled in. FlowHub asks for
 * no Gmail permission and never sends mail: the person reads the draft and
 * presses Send in Gmail.
 */

export type GmailDraft = { to?: string; subject: string; body: string };

/** Long links are cut by some browsers; a draft that long is cut short with an ellipsis. */
const MAX_URL = 7500;

export function gmailComposeUrl(draft: GmailDraft, account?: string | null): string {
  const enc = encodeURIComponent;
  const base = `https://mail.google.com/mail/?view=cm&fs=1${account ? `&authuser=${enc(account)}` : ""}&to=${enc(draft.to?.trim() ?? "")}&su=${enc(draft.subject)}&body=`;
  let body = draft.body;
  if (base.length + enc(body).length > MAX_URL) {
    while (body.length > 200 && base.length + enc(`${body}…`).length > MAX_URL) body = body.slice(0, Math.floor(body.length * 0.9));
    body = `${body.trimEnd()}…`;
  }
  return base + enc(body);
}

/** "Best regards, Aisyah" at the end of a paragraph. */
const SIGN_OFF = /\s((?:best|kind|warm|with best)\s+regards|regards|sincerely|yours sincerely|many thanks|thanks|thank you|cheers),?\s+[^.!?\n]{1,60}$/i;

/** Links code adds to an email, above the sign-off. The model never writes a URL. */
export function withLinks(paragraphs: string[], links: { label: string; url: string }[]): string {
  if (links.length === 0) return paragraphs.join("\n\n");
  const block = links.map((link) => `${link.label}: ${link.url}`).join("\n");
  const body = [...paragraphs];
  const last = body.at(-1) ?? "";
  // A sign-off at the end of a paragraph with other text is split off; otherwise a short last paragraph is the sign-off. The links go above it.
  const signOff = SIGN_OFF.exec(last);
  if (signOff && last.slice(0, signOff.index).trim().length >= 20) return [...body.slice(0, -1), last.slice(0, signOff.index).trim(), block, last.slice(signOff.index).trim()].join("\n\n");
  if (body.length > 1 && last.length <= 120) return [...body.slice(0, -1), block, last].join("\n\n");
  return [...body, block].join("\n\n");
}
