import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/flowhub/loading";
import { AiMarker } from "@/components/flowhub/markers";
import { OfferingIcon, StatusBadge, TypeBadge } from "@/components/flowhub/offering-icon";
import { offeringSummary } from "@/lib/offerings/view";
import { loadOffering } from "@/server/graph/offering";
import { getPendingProposals } from "@/server/proposals/queries";
import { OpenAskButton } from "../../ask/ask-context";
import { OfferingTabs } from "./tabs";

/** FR-OFR-2: the offering page header and its six tabs. */
export default function OfferingLayout({ children, params }: LayoutProps<"/offerings/[id]">) {
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <OfferingHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function OfferingHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ offering, graph, currency }, proposals] = await Promise.all([loadOffering(id), getPendingProposals()]);
  const pending = proposals.filter((proposal) => proposal.offeringIds.includes(id));
  const summary = offeringSummary(graph, offering, currency);
  const updated = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(offering.updatedAt));

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-muted-foreground">
        <Link href="/offerings" className="text-primary hover:underline">
          Offerings
        </Link>
        <span aria-hidden="true">/</span>
        <span>{offering.name}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <OfferingIcon name={offering.name} size="lg" />
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{offering.name}</h1>
              <StatusBadge status={offering.status} />
              <TypeBadge type={offering.type} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {offering.owner ? (
                <span>
                  Owner <b className="text-foreground">{offering.owner}</b>
                </span>
              ) : null}
              <span>
                Updated <b className="text-foreground">{updated}</b>
              </span>
              {summary.documents.length > 0 ? (
                <AiMarker>
                  Kept current from {summary.documents.length} {summary.documents.length === 1 ? "document" : "documents"}
                </AiMarker>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OpenAskButton className="inline-flex h-9 items-center gap-2 rounded-lg border border-ai/35 bg-ai-soft px-3 text-sm font-semibold text-ai hover:bg-ai-soft/70">
            <span aria-hidden="true" className="rounded bg-ai px-1.5 font-mono text-[10px] font-bold text-white dark:text-background">
              AI
            </span>
            Tell FlowHub about this offering
          </OpenAskButton>
          {pending.length ? (
            <OpenAskButton proposalId={pending[0].id} className="hover:opacity-80">
              <AiMarker waiting>
                {pending.length === 1 ? "1 proposal" : `${pending.length} proposals`} waiting for you · Review
              </AiMarker>
            </OpenAskButton>
          ) : null}
        </div>
      </div>
      <OfferingTabs id={offering.id} />
    </>
  );
}

function HeaderFallback() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-12 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="flex h-10 items-center gap-6 shadow-[inset_0_-1px_0_var(--border)]">
        {[16, 12, 13, 15, 22, 11].map((width, index) => (
          <Skeleton key={index} className="h-3.5" style={{ width: `${width * 4}px` }} />
        ))}
      </div>
    </div>
  );
}
