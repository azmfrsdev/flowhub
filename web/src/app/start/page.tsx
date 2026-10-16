import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/flowhub/wordmark";
import { Badge } from "@/components/ui/badge";
import { SAMPLES, type Sample } from "@/lib/sample";
import { getSessionUser, requireUser } from "@/server/auth/session";
import { getUserWorkspaceId } from "@/server/workspace/access";
import { graphSummary } from "@/server/workspace/import-graph";
import { startWithSample } from "./actions";
import { OwnCompanyForm } from "./own-company-form";
import { PendingButton } from "@/components/flowhub/pending-button";

export const metadata: Metadata = { title: "Set up your workspace" };

/** S2, workspace setup (FR-WS-2, FR-WS-3). Shown once, to a signed-in user with no workspace. */
export default function StartPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3.5 sm:px-10">
        <Wordmark />
        <Suspense fallback={null}>
          <SignedInAs />
        </Suspense>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-10">
        <div className="flex w-full max-w-[1120px] flex-col gap-7">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Step 1 of 1</span>
            <h1 className="text-3xl font-bold tracking-tight">Set up your workspace</h1>
            <p className="text-[15px] text-muted-foreground">Explore a ready-made sample company, or start your own.</p>
          </div>
          <Suspense fallback={<div className="h-96 rounded-xl border bg-card" />}>
            <SetupOptions />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function SignedInAs() {
  const user = await getSessionUser();
  return user ? <span className="text-sm text-muted-foreground">{user.email}</span> : null;
}

async function SetupOptions() {
  const user = await requireUser("/start");
  if (await getUserWorkspaceId(user.uid)) redirect("/home");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="flex flex-col rounded-xl border-2 border-primary bg-card shadow-[0_14px_34px_color-mix(in_oklch,var(--primary)_10%,transparent)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <Badge>Recommended for judges</Badge>
          <span className="text-sm text-muted-foreground">Ready in about 10 seconds</span>
        </div>
        <div className="flex flex-col gap-5 px-5 py-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">Try with sample data</h2>
            <p className="text-muted-foreground">
              Pick a sample company: one sells services, one software, one products. You become the Owner of your own copy. Nothing
              you do affects anyone else.
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {Object.values(SAMPLES).map((sample) => (
              <SampleCard key={sample.seller} sample={sample} />
            ))}
          </ul>

          <p className="text-sm text-muted-foreground">
            All sample companies, people and prices are fictional. Prospects are researched live from public web sources.
          </p>
        </div>
      </section>

      <section className="flex flex-col rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-bold">Set up your own company</h2>
        </div>
        <OwnCompanyForm />
      </section>
    </div>
  );
}

/** One sample seller (FR-WS-3): what it sells, where, and what its catalogue holds. */
function SampleCard({ sample }: { sample: Sample }) {
  const summary = graphSummary(sample.graph);
  const name = sample.graph.workspace.name;
  return (
    <li className="flex flex-col gap-3.5 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-foreground text-lg font-bold text-background">
          {sample.initials}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{name}</h3>
            <Badge variant="outline">{sample.sells}</Badge>
            <Badge variant="outline">{sample.city}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{sample.blurb}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Stat value={summary.offerings} label="offerings" />
          <Stat value={summary.proof} label="case studies and results" />
          <Stat value={summary.partners} label="partners and suppliers" />
        </dl>
        <form action={startWithSample}>
          <input type="hidden" name="seller" value={sample.seller} />
          <PendingButton pendingLabel={`Setting up ${name}…`}>
            Use {name}
            <ArrowRight aria-hidden="true" />
          </PendingButton>
        </form>
      </div>
    </li>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="order-last">{label}</dt>
      <dd className="font-bold text-foreground">{value}</dd>
    </div>
  );
}
