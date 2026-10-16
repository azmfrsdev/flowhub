import Link from "next/link";
import type { Opportunity } from "@/lib/schema";
import { ScoreBadge } from "../../opportunities/[id]/shared";

const OUTCOME = { won: "Won", lost: "Lost", no_decision: "No decision" } as const;

/** FR-OG-13: recent deals on an offering's Overview: prospect, fit score, outcome, value and why it ended. */
export function DealList({ deals }: { deals: Opportunity[] }) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
  return (
    <ul className="flex flex-col divide-y">
      {deals.map((deal) => (
        <li key={deal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
          <Link href={`/opportunities/${deal.id}`} className="min-w-0 flex-1 truncate font-semibold text-primary hover:underline">
            {deal.prospect?.name ?? "New opportunity"}
          </Link>
          {deal.score !== null && deal.recommendation ? <ScoreBadge value={deal.score} band={deal.recommendation} /> : null}
          <span
            className={
              deal.outcome?.result === "won"
                ? "rounded-full bg-fit-strong-soft px-2 py-px text-xs font-semibold text-fit-strong"
                : deal.outcome?.result === "lost"
                  ? "rounded-full bg-destructive/10 px-2 py-px text-xs font-semibold text-destructive"
                  : "rounded-full border px-2 py-px text-xs font-semibold text-muted-foreground capitalize"
            }
          >
            {deal.outcome ? OUTCOME[deal.outcome.result] : deal.status.replace("_", " ")}
          </span>
          <span className="basis-full text-xs text-muted-foreground">
            {[deal.value, date.format(new Date(deal.updatedAt)), deal.outcome?.reason].filter(Boolean).join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
