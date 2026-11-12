import Link from "next/link";
import { SectionCard } from "@/components/flowhub/section-card";
import type { InboxItem } from "@/lib/schema";
import { VerdictPill, fullWhen } from "../../inbox/shared";

/**
 * PRD 7.27, FR-INBOX-6: the deal's emails from Gmail, newest first. An email
 * from a company that is already a deal lands here instead of opening a new one.
 */
export function GmailEmails({ emails }: { emails: InboxItem[] }) {
  return (
    <SectionCard title="Emails from Gmail" id="gmail-emails" subtitle="Read by FlowHub from the sales inbox. Later emails from this company are added here, not opened as new deals." count={emails.length}>
      <ul className="flex flex-col divide-y">
        {emails.map((email) => (
          <li key={email.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictPill verdict={email.verdict} />
              <Link href={`/inbox/${email.id}`} className="font-semibold text-link hover:underline">
                {email.subject || "(no subject)"}
              </Link>
              <span className="text-xs text-muted-foreground">
                {email.from.name} · {fullWhen(email.receivedAt)}
              </span>
            </div>
            <p className="line-clamp-3 max-w-[75ch] whitespace-pre-line text-muted-foreground">{email.body}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
