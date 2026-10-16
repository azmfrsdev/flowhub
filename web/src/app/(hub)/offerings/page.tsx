import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LinkPending, Skeleton, SkeletonWithChip } from "@/components/flowhub/loading";
import { AiMarker } from "@/components/flowhub/markers";
import { OfferingIcon, StatusBadge } from "@/components/flowhub/offering-icon";
import { Button } from "@/components/ui/button";
import { startingPrice } from "@/lib/offerings/view";
import type { Offering } from "@/lib/schema";
import { cn } from "cn";
import { getWorkspaceGraph } from "@/server/graph/read";
import { getPendingProposals } from "@/server/proposals/queries";
import { getHubContext } from "@/server/workspace/access";
import { OpenAskButton } from "../ask/ask-context";

export const metadata: Metadata = { title: "Offerings" };

const TYPES = [
  { key: "service", label: "Services" },
  { key: "package", label: "Packages" },
  { key: "product", label: "Products" },
] as const;

/**
 * FR-OFR-1 (simplified 2026-10-15): one card per offering with only what a
 * first-time reader needs to tell them apart: name, type, summary and the
 * starting price, plus a marker when changes wait for review. Everything else
 * is one click away, on the offering's tabs.
 */
export default function OfferingsPage({ searchParams }: PageProps<"/offerings">) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Offerings</h1>
          <p className="text-muted-foreground">Everything your company sells. Open one to see its scope, prices, partners and sales material.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Suspense fallback={null}>
            <AddFromBrochure />
          </Suspense>
          <Button asChild>
            <Link href="/offerings/new">
              <Plus aria-hidden="true" />
              New offering
            </Link>
          </Button>
        </div>
      </div>
      <Suspense fallback={<CardsFallback />}>
        <OfferingCards searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** FR-OFR-1: Add from a brochure opens Ask or tell, where a PDF can be dropped. */
async function AddFromBrochure() {
  const { role } = await getHubContext();
  if (role === "viewer") return null;
  return (
    <OpenAskButton
      title="Drop a brochure or price list into Ask or tell"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-ai/35 bg-ai-soft px-3 text-sm font-semibold text-ai hover:bg-ai-soft/70"
    >
      <span aria-hidden="true" className="rounded bg-ai px-1.5 font-mono text-[10px] font-bold text-white dark:text-background">
        AI
      </span>
      Add from a brochure
    </OpenAskButton>
  );
}

async function OfferingCards({ searchParams }: { searchParams: PageProps<"/offerings">["searchParams"] }) {
  const [{ type }, graph, { workspace }, proposals] = await Promise.all([searchParams, getWorkspaceGraph(), getHubContext(), getPendingProposals()]);
  const topLevel = graph.offerings.filter((offering) => offering.parentId === null).sort((a, b) => a.name.localeCompare(b.name));
  const filter = TYPES.some((t) => t.key === type) ? (type as Offering["type"]) : null;
  const shown = filter ? topLevel.filter((offering) => offering.type === filter) : topLevel;
  const types = TYPES.map((t) => ({ ...t, count: topLevel.filter((offering) => offering.type === t.key).length })).filter((t) => t.count > 0);

  return (
    <>
      {types.length > 1 ? (
        <nav aria-label="Filter by type" className="flex flex-wrap gap-1 self-start rounded-lg bg-muted p-1 text-sm">
          <FilterLink href="/offerings" active={!filter}>
            All · {topLevel.length}
          </FilterLink>
          {types.map(({ key, label, count }) => (
            <FilterLink key={key} href={`/offerings?type=${key}`} active={filter === key}>
              {label} · {count}
            </FilterLink>
          ))}
        </nav>
      ) : null}
      {topLevel.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="font-semibold">No offerings yet</p>
          <p className="text-sm text-muted-foreground">Add what you sell, by hand or from a brochure.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((offering) => {
            const price = startingPrice(graph, offering.id, workspace.currency);
            const waiting = proposals.filter((proposal) => proposal.offeringIds.includes(offering.id)).length;
            return (
              <li key={offering.id}>
                <Link
                  href={`/offerings/${offering.id}`}
                  className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-foreground transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_6px_20px_color-mix(in_oklch,var(--foreground)_6%,transparent)]"
                >
                  <div className="flex items-center gap-3">
                    <OfferingIcon name={offering.name} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="text-[15px]">{offering.name}</b>
                        {offering.status !== "active" ? <StatusBadge status={offering.status} /> : null}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{offering.type}</span>
                    </div>
                    <LinkPending />
                    <ChevronRight aria-hidden="true" className="size-4.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  {offering.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{offering.summary}</p> : null}
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
                    <Price text={price.text} />
                    {waiting > 0 ? <AiMarker waiting>{waiting === 1 ? "1 change to review" : `${waiting} changes to review`}</AiMarker> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** The starting price, as a label and a value a reader takes in at a glance. */
function Price({ text }: { text: string }) {
  const from = text.startsWith("From ");
  return (
    <span className="flex flex-col">
      <span className="text-xs text-muted-foreground">{from ? "Starts at" : "Price"}</span>
      <b className={cn("text-[15px]", text === "No prices yet" && "font-medium text-muted-foreground")}>{from ? text.slice(5) : text}</b>
    </span>
  );
}

function CardsFallback() {
  return (
    <SkeletonWithChip label="Loading offerings">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <div className="flex flex-col gap-1.5 pt-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonWithChip>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("rounded-md px-3 py-1", active ? "bg-card font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}
