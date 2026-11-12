import type { InboxItem, InboxVerdict } from "@/lib/schema";
import { cn } from "cn";

/** Gmail inbox leads (PRD 7.27): the verdict pill and status line shared by the list, the item page and the deal room. */

export const VERDICT_LABEL: Record<InboxVerdict, string> = { lead: "Lead", maybe: "Maybe", existing_deal: "Existing deal", not_a_lead: "Not a lead" };
const VERDICT_TONE: Record<InboxVerdict, string> = {
  lead: "border-score-go bg-score-go-soft text-score-go",
  maybe: "border-score-consider bg-score-consider-soft text-score-consider",
  existing_deal: "border-ai bg-ai-soft text-ai",
  not_a_lead: "border-border bg-muted text-muted-foreground",
};

export function VerdictPill({ verdict, className }: { verdict: InboxVerdict; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border-[1.5px] px-2.5 text-xs font-bold whitespace-nowrap", VERDICT_TONE[verdict], className)}>{VERDICT_LABEL[verdict]}</span>;
}

/** One line on where the item stands, and whether it needs a person. */
export function statusLine(item: InboxItem): { text: string; tone: "go" | "attention" | "muted" } {
  switch (item.status) {
    case "intake_started":
      return { text: "Intake started by FlowHub · stops at Gate A", tone: "go" };
    case "waiting":
      return { text: item.verdict === "lead" ? "Needs you: open a deal" : "Needs you: open a deal or dismiss", tone: "attention" };
    case "opened":
      return { text: `Deal opened${item.decidedBy ? ` by ${item.decidedBy}` : ""}`, tone: "go" };
    case "added_to_deal":
      return { text: `Added to ${item.dealName ?? "the deal"}`, tone: "muted" };
    case "dismissed":
      return { text: `Not a lead${item.decidedBy ? `, said ${item.decidedBy}` : ""}`, tone: "muted" };
    case "reread":
      return { text: "Waiting for Gmail: send it again to read it as a lead", tone: "attention" };
    case "filed":
      return { text: item.summary, tone: "muted" };
  }
}

export const STATUS_TONE = { go: "font-semibold text-score-go", attention: "font-semibold text-attention", muted: "text-muted-foreground" } as const;

export const when = (iso: string) => {
  const date = new Date(iso);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);
  if (day(date) === day(new Date())) return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(date);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(date);
};

export const fullWhen = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
