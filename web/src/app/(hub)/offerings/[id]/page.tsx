import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SkeletonRows } from "@/components/flowhub/loading";
import { ProvenanceMarker, SourceChips } from "@/components/flowhub/provenance";
import { EmptyRow, SectionCard, TabFallback } from "@/components/flowhub/section-card";
import { offeringSummary, scopeRules } from "@/lib/offerings/view";
import { PersonMarker } from "@/components/flowhub/markers";
import { loadOffering } from "@/server/graph/offering";
import { getChangesFor, getDealsFor } from "@/server/workspace/queries";
import { DealList } from "./deal-list";

export const metadata: Metadata = { title: "Offering" };

/** FR-OFR-3, the Overview tab. */
export default function OverviewPage({ params }: PageProps<"/offerings/[id]">) {
  return (
    <Suspense fallback={<TabFallback label="Loading overview" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { offering, graph, currency, documents } = await loadOffering(id);
  const summary = offeringSummary(graph, offering, currency);
  const region = scopeRules(graph, offering.id).companyWide.find((rule) => rule.kind === "region");

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Starts from" value={summary.price.text.replace(/^From /, "")} detail={summary.price.detail} />
        <Suspense fallback={<Kpi label="Deals this year" value="…" detail={null} />}>
          <DealsKpi ids={[offering.id, ...graph.offerings.filter((child) => child.parentId === offering.id).map((child) => child.id)]} />
        </Suspense>
        <Kpi label="Results you can cite" value={String(summary.publicProof.length)} detail={summary.privateProof.length ? `plus ${summary.privateProof.length} not public` : null} />
        <Kpi label="Partners" value={String(summary.partners.length)} detail={summary.partners.map((partner) => partner.name).join(", ") || null} />
      </dl>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title="What it is" id="what" marker={<ProvenanceMarker provenance={offering.provenance} sources={offering.sources} documents={documents} withSource />}>
            <p className="px-4 py-4 leading-relaxed">{offering.description || offering.summary || "No description yet."}</p>
          </SectionCard>

          <SectionCard title="Key facts" id="facts">
            <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Typical length</dt>
              <dd>{offering.facts.typicalLength ?? "Not set"}</dd>
              <dt className="text-muted-foreground">Best for</dt>
              <dd>{offering.facts.bestFor ?? "Not set"}</dd>
              {summary.subOfferings.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Includes</dt>
                  <dd>
                    {summary.subOfferings.map((child) => child.name).join(", ")}
                    <span className="text-muted-foreground"> · sub-offerings with their own pricing</span>
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Technology</dt>
              <dd className="flex flex-wrap gap-1.5">
                {offering.technology.length === 0 ? "Not set" : null}
                {offering.technology.map((tech) => (
                  <span key={`${tech.category}-${tech.value}`} className="rounded-full bg-muted px-2 py-px text-xs">
                    {tech.label}
                  </span>
                ))}
              </dd>
              <dt className="text-muted-foreground">Where we sell it</dt>
              <dd>
                {region ? region.statement : "Anywhere"}
                <span className="text-muted-foreground"> · from Settings, Selling rules</span>
              </dd>
            </dl>
          </SectionCard>

          <SectionCard title="Results you can cite" id="results" action={<Link href={`/offerings/${offering.id}/sales`} className="text-sm text-primary hover:underline">All in Sales material</Link>}>
            {summary.publicProof.length === 0 ? (
              <EmptyRow>No public results yet. Proposals for this offering will have no case studies to cite.</EmptyRow>
            ) : (
              <ul className="flex flex-col divide-y">
                {summary.publicProof.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <span className="rounded-full bg-fit-strong-soft px-2 py-px text-xs font-semibold text-fit-strong">Public</span>
                    <b>{item.title}</b>
                    <SourceChips sources={item.sources} documents={documents} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-5">
          <SectionCard title="Recent deals" id="deals" action={<Link href="/opportunities" className="text-sm text-primary hover:underline">All opportunities</Link>}>
            <Suspense fallback={<SkeletonRows rows={2} />}>
              <RecentDeals ids={[offering.id, ...graph.offerings.filter((child) => child.parentId === offering.id).map((child) => child.id)]} />
            </Suspense>
          </SectionCard>
          <SectionCard title="Recent changes" id="changes">
            <Suspense fallback={<SkeletonRows rows={3} />}>
              <RecentChanges
                ids={[
                  offering.id,
                  ...graph.rateCards.filter((card) => card.offeringId === offering.id).map((card) => card.id),
                  ...graph.feeSchedules.filter((schedule) => schedule.offeringId === offering.id).map((schedule) => schedule.id),
                  ...graph.constraints.filter((rule) => rule.offeringIds.includes(offering.id)).map((rule) => rule.id),
                  ...graph.proof.filter((item) => item.offeringIds.includes(offering.id)).map((item) => item.id),
                ]}
              />
            </Suspense>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

/** FR-OFR-2: the headline count of this year's deals that involve the offering, and how many were won. */
async function DealsKpi({ ids }: { ids: string[] }) {
  const year = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  const deals = (await getDealsFor(ids, 500)).filter((deal) => new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(deal.createdAt)) === year);
  if (deals.length === 0) return <Kpi label="Deals this year" value="None yet" detail="Deals appear once opportunities use this offering" />;
  const won = deals.filter((deal) => deal.status === "won").length;
  const open = deals.filter((deal) => !["won", "lost", "no_decision"].includes(deal.status)).length;
  return <Kpi label="Deals this year" value={String(deals.length)} detail={[won ? `${won} won` : null, open ? `${open} open` : null].filter(Boolean).join(", ") || null} />;
}

/** FR-OG-13: the deals this offering was part of, with their fit and outcome. */
async function RecentDeals({ ids }: { ids: string[] }) {
  const deals = await getDealsFor(ids);
  if (deals.length === 0) return <EmptyRow>No deals yet. When an opportunity is matched to this offering, it shows here with its fit and outcome.</EmptyRow>;
  return <DealList deals={deals} />;
}

async function RecentChanges({ ids }: { ids: string[] }) {
  const changes = await getChangesFor(ids);
  if (changes.length === 0) return <EmptyRow>No changes since it was added. Edits to its scope, prices and results show here.</EmptyRow>;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
  return (
    <ol className="flex flex-col px-4 pt-1 pb-2 text-[13px]">
      {changes.map((change, index) => (
        <li key={`${change.at}-${index}`} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 border-b border-dashed border-line-soft py-2 last:border-b-0">
          <time dateTime={change.at} className="text-muted-foreground">
            {date.format(new Date(change.at))}
          </time>
          <span className="flex flex-col items-start gap-1">
            <PersonMarker name={change.byName} />
            <span>{change.summary}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold">{value}</dd>
      {detail ? <dd className="text-sm text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}
