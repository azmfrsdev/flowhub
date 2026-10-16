import { moneyTokens } from "@/lib/pricing/money";
import type { FollowUp, WriteOutput } from "@/lib/schema";

/**
 * C3: the follow-up email after a proposal. It may restate only what the
 * approved proposal already says: its backed claims, and the ones a person
 * kept as their own statement at Gate D. Code checks every sentence; the
 * email never states an amount, since prices live in the proposal.
 */

/** A {{price:…}} placeholder: prices belong to the proposal, never the email. */
const hasPricePlaceholder = (text: string) => text.includes("{{price:");

export type FollowUpDraft = {
  subject: string;
  paragraphs: { sentences: { text: string; kind: "courtesy" | "claim"; refs: string[] }[] }[];
};

/** The proposal's live claims, as "k1", "k2" … for the model. Claims with a price or an amount stay out. */
export function followUpEvidence(working: Pick<WriteOutput, "claims">): Map<string, { id: string; text: string }> {
  const live = working.claims.filter(
    (claim) => claim.decision !== "remove" && (claim.support !== "neither" || claim.decision === "accept_as_seller") && !hasPricePlaceholder(claim.text) && moneyTokens(claim.text).length === 0,
  );
  return new Map(live.map((claim, index) => [`k${index + 1}`, { id: claim.id, text: claim.text }]));
}

/** Code's last word on the draft: amounts and private results are removed; a claim with no proposal claim behind it is flagged. */
export function checkFollowUp(
  draft: FollowUpDraft,
  evidence: Map<string, { id: string }>,
  nonPublicNames: string[],
  fallbackSubject: string,
): Pick<FollowUp, "subject" | "paragraphs" | "removed"> {
  const leaks = (text: string) => {
    const lower = text.toLowerCase();
    return moneyTokens(text).length > 0 || hasPricePlaceholder(text) || nonPublicNames.some((name) => name.trim().length >= 4 && lower.includes(name.trim().toLowerCase()));
  };
  let removed = 0;
  const paragraphs = draft.paragraphs
    .map((paragraph) => ({
      sentences: paragraph.sentences.flatMap((sentence) => {
        const text = sentence.text.trim();
        if (!text) return [];
        if (leaks(text)) {
          removed += 1;
          return [];
        }
        const claimIds = [...new Set(sentence.refs.map((ref) => evidence.get(ref.trim())?.id).filter((id): id is string => Boolean(id)))];
        const flagged = sentence.kind === "claim" && claimIds.length === 0;
        return [{ text, claimIds, ...(flagged ? { flagged: true } : {}) }];
      }),
    }))
    .filter((paragraph) => paragraph.sentences.length > 0);
  const subject = draft.subject.trim() && !leaks(draft.subject) ? draft.subject.trim() : fallbackSubject;
  return { subject, paragraphs, removed };
}

/** Plain text for the clipboard. FlowHub never sends the email. */
export function followUpText(followUp: Pick<FollowUp, "subject" | "paragraphs">): string {
  return [`Subject: ${followUp.subject}`, ...followUp.paragraphs.map((paragraph) => paragraph.sentences.map((sentence) => sentence.text).join(" "))].join("\n\n");
}
