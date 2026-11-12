import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AiMarker, CalcMarker } from "@/components/flowhub/markers";
import { EmptyRow, EmptyState, TabFallback } from "@/components/flowhub/section-card";
import { Button } from "@/components/ui/button";
import { malaysiaDay } from "@/lib/offerings/view";
import { INBOX_DAILY_LIMIT, InboxItem, InboxSettings, InboxVerdict } from "@/lib/schema";
import { cn } from "cn";
import { db } from "@/server/firebase/admin";
import { getHubContext } from "@/server/workspace/access";
import { STATUS_TONE, VERDICT_LABEL, VerdictPill, statusLine, when } from "./shared";

export const metadata: Metadata = { title: "Inbox" };

const FILTERS = [["all", "All"], ...InboxVerdict.options.map((verdict) => [verdict, verdict === "lead" ? "Leads" : verdict === "existing_deal" ? "Existing deals" : VERDICT_LABEL[verdict]])] as const;

/** PRD 7.27: emails to the sales inbox in Gmail, read by FlowHub. A clear lead is already at Gate A; a maybe waits for a person. */
export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <Suspense fallback={<TabFallback label="Opening the inbox" />}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/inbox">["searchParams"] }) {
  const { show: raw } = await searchParams;
  const show = InboxVerdict.safeParse(raw).success ? (raw as InboxVerdict) : "all";
  const { workspace, role } = await getHubContext();
  const base = db().collection("workspaces").doc(workspace.id);
  const [snap, usage] = await Promise.all([base.collection("inbox").orderBy("receivedAt", "desc").limit(100).get(), base.collection("usage").doc(malaysiaDay()).get()]);
  const items = snap.docs.flatMap((doc) => {
    const parsed = InboxItem.safeParse(doc.data());
    return parsed.success ? [parsed.data] : [];
  });
  const settings = InboxSettings.parse(workspace.inbox ?? {});
  const today = Number(usage.get("inboxEmails") ?? 0);
  const counts = Object.fromEntries(FILTERS.map(([key]) => [key, key === "all" ? items.length : items.filter((item) => item.verdict === key).length]));
  const shown = show === "all" ? items : items.filter((item) => item.verdict === show);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {settings.mailbox ? `Emails to ${settings.mailbox}, read by FlowHub.` : "Emails to your sales inbox in Gmail, read by FlowHub."}
            {settings.lastSeenAt ? ` Last check ${when(settings.lastSeenAt)}.` : ""} {today} of {INBOX_DAILY_LIMIT} emails today.
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          <AiMarker>Read by Gemini</AiMarker>
          <CalcMarker>Checked by code</CalcMarker>
        </span>
      </div>

      {!settings.keyHash && items.length === 0 ? (
        <EmptyState
          title="Gmail isn't connected yet"
          action={
            role === "owner" ? (
              <Button asChild>
                <Link href="/settings/inbox">Connect Gmail</Link>
              </Button>
            ) : null
          }
        >
          A small script in your sales inbox&apos;s own Google account sends new emails here. Gemini reads each one, code checks it, and a clear lead goes straight to Gate A.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Filter emails" className="flex flex-wrap gap-1.5">
            {FILTERS.map(([key, label]) => (
              <Link
                key={key}
                href={key === "all" ? "/inbox" : `/inbox?show=${key}`}
                aria-current={show === key ? "page" : undefined}
                className={cn("rounded-full border-2 border-ink bg-card px-3 py-0.5 text-sm font-semibold text-foreground no-underline hover:bg-muted", show === key && "bg-ink text-card hover:bg-ink")}
              >
                {label} {counts[key]}
              </Link>
            ))}
          </nav>
          <section aria-label="Emails" className="overflow-hidden rounded-xl border-2 border-ink bg-card shadow-comic">
            {shown.length === 0 ? (
              <EmptyRow>{items.length ? "Nothing here with this filter." : "No emails yet. New emails to the sales inbox show up here within a minute."}</EmptyRow>
            ) : (
              <ul className="flex flex-col divide-y-[1.5px]">
                {shown.map((item) => {
                  const status = statusLine(item);
                  return (
                    <li key={item.id}>
                      <Link href={`/inbox/${item.id}`} className="grid gap-x-3 gap-y-1 px-4 py-2.5 text-foreground no-underline hover:bg-accent/40 sm:grid-cols-[116px_minmax(0,1fr)_auto] sm:items-center">
                        <span>
                          <VerdictPill verdict={item.verdict} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <b className="truncate">{item.subject || "(no subject)"}</b>
                          <span className="truncate text-xs text-muted-foreground">
                            {item.from.name}
                            {item.dealName && item.verdict === "existing_deal" ? ` · ${item.dealName}` : item.company.name ? ` · ${item.company.name}` : item.company.freeMail ? " · Company unknown" : ""}
                          </span>
                        </span>
                        <span className="flex flex-col gap-0.5 text-xs sm:items-end sm:text-right">
                          <span className="text-muted-foreground">
                            {when(item.receivedAt)}
                            {item.verdict !== "not_a_lead" ? ` · score ${item.score}` : ""}
                          </span>
                          <span className={cn("max-w-80 truncate", STATUS_TONE[status.tone])}>{status.text}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="text-xs text-muted-foreground">A &quot;Not a lead&quot; keeps only the sender, subject, date and reason, never the text. Wrong verdict? Open it and choose This is a lead.</p>
        </>
      )}
    </>
  );
}
