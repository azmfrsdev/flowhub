import { ArrowRight, FileText } from "lucide-react";
import { EmptyRow } from "@/components/flowhub/section-card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LinkPending, Skeleton, SkeletonRows } from "@/components/flowhub/loading";
import { AiMarker, CalcMarker, PersonMarker } from "@/components/flowhub/markers";
import { OfferingIcon } from "@/components/flowhub/offering-icon";
import { getDocumentsInProgress, getPendingProposals, getWaitingGates } from "@/server/proposals/queries";
import { getHubContext } from "@/server/workspace/access";
import { getRecentActivity, getTopLevelOfferings } from "@/server/workspace/queries";
import { OpenAskButton } from "../ask/ask-context";
import { TellBox } from "../ask/tell-box";
import { DocumentStatus } from "../offerings/[id]/sales/file-drop";

export const metadata: Metadata = { title: "Home" };

/** Home (v2 canvas "V2-Home"): Ask or tell, what's waiting, your offerings, today's activity. */
export default function HomePage() {
  return (
    <>
      <Suspense fallback={<HeadingFallback />}>
        <Heading />
      </Suspense>
      <Suspense fallback={<TellBox canEdit={false} />}>
        <HomeTellBox />
      </Suspense>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <Card title="Waiting for you" titleId="waiting">
            <Suspense fallback={<RowsFallback rows={1} />}>
              <Waiting />
            </Suspense>
          </Card>
          <Card title="Your offerings" titleId="offerings" action={<Link href="/offerings" className="text-sm text-link hover:underline">View all</Link>}>
            <Suspense fallback={<RowsFallback rows={2} />}>
              <Offerings />
            </Suspense>
          </Card>
        </div>
        <Card title="What happened recently" titleId="activity" footer={<Legend />}>
          <Suspense fallback={<RowsFallback rows={3} />}>
            <Activity />
          </Suspense>
        </Card>
      </div>
    </>
  );
}

async function Heading() {
  const { workspace } = await getHubContext();
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">Home</h1>
      <p className="text-muted-foreground">
        {today} · {workspace.name}
      </p>
    </div>
  );
}

function HeadingFallback() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">Home</h1>
      <Skeleton className="h-6 w-64" />
    </div>
  );
}

async function HomeTellBox() {
  const { role } = await getHubContext();
  return <TellBox canEdit={role !== "viewer"} />;
}

/** FR-ASK-5 and the deal-room gates: everything that needs a person, newest first. */
async function Waiting() {
  const [proposals, gates, files, { role }] = await Promise.all([getPendingProposals(), getWaitingGates(), getDocumentsInProgress(), getHubContext()]);
  if (proposals.length === 0 && gates.length === 0 && files.length === 0) {
    return <p className="px-4 py-5 text-sm text-muted-foreground">Nothing is waiting for you. Proposed changes and gates will show up here.</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {proposals.map((proposal) => {
        const pending = proposal.operations.filter((item) => item.status === "proposed");
        return (
          <li key={proposal.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <AiMarker waiting>Proposed</AiMarker>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-sm">
                {pending.length === 1 ? "1 change" : `${pending.length} changes`} from {proposal.via === "message" ? "a message" : (proposal.input.fileName ?? "a file")}
              </b>
              <span className="truncate text-xs text-muted-foreground">{pending.map((item) => item.path).join(" · ")}</span>
            </span>
            <OpenAskButton proposalId={proposal.id} className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
              Review <ArrowRight aria-hidden="true" className="size-3.5" />
            </OpenAskButton>
          </li>
        );
      })}
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <b className="truncate text-sm">{file.name}</b>
            <span className="flex flex-wrap items-center gap-2">
              <DocumentStatus doc={file} canEdit={role !== "viewer"} />
            </span>
          </span>
        </li>
      ))}
      {gates.map((gate) => (
        <li key={gate.opportunityId} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <AiMarker waiting>Waiting</AiMarker>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-sm">{gate.prospect}</b>
            <span className="truncate text-xs text-muted-foreground">{gate.gate}</span>
          </span>
          <Link href={`/opportunities/${gate.opportunityId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
            <LinkPending className="mr-1" />
            Open <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Offerings() {
  const offerings = await getTopLevelOfferings();
  if (offerings.length === 0) {
    return (
      <EmptyRow>
        No offerings yet. Add your first one from <Link href="/offerings" className="text-link underline">Offerings</Link>.
      </EmptyRow>
    );
  }
  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-2">
      {offerings.map((offering) => {
        return (
          <li key={offering.id}>
            <Link href={`/offerings/${offering.id}`} className="flex items-center gap-3 rounded-xl border p-3 text-foreground hover:border-ink/40 hover:bg-muted/40">
              <OfferingIcon name={offering.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate">{offering.name}</b>
                <span className="truncate text-sm text-muted-foreground">{offering.summary || offering.type}</span>
              </span>
              <LinkPending />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function Activity() {
  const events = await getRecentActivity();
  if (events.length === 0) return <EmptyRow>No activity yet.</EmptyRow>;
  const time = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  return (
    <ol className="flex flex-col px-4 pt-1 pb-2 text-[13px]">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 border-b border-dashed border-line-soft py-2 last:border-b-0">
          <time dateTime={event.at} className="text-muted-foreground tabular-nums">
            {time.format(new Date(event.at))}
          </time>
          <span className="flex flex-col items-start gap-1">
            <PersonMarker name={event.byName} />
            <span>{event.summary}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <AiMarker>AI did it</AiMarker>
      <AiMarker waiting>AI, waiting for you</AiMarker>
      <CalcMarker>Calculated</CalcMarker>
      <PersonMarker name="A person" />
    </div>
  );
}

function Card({ title, titleId, action, footer, children }: { title: string; titleId: string; action?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={titleId} className="flex flex-col rounded-xl border-2 border-ink bg-card shadow-comic">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 id={titleId} className="font-bold">
          {title}
        </h2>
        <span className="flex-1" />
        {action}
      </div>
      {children}
      {footer ? <div className="border-t px-4 py-3">{footer}</div> : null}
    </section>
  );
}

function RowsFallback({ rows }: { rows: number }) {
  return <SkeletonRows rows={rows} />;
}
