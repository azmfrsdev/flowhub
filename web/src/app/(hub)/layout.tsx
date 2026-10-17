import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/flowhub/loading";
import { SessionKeeper } from "@/components/flowhub/session-keeper";
import { SignOutButton } from "@/components/flowhub/sign-out-button";
import { Wordmark } from "@/components/flowhub/wordmark";
import { SAMPLES } from "@/lib/sample";
import { getHubContext } from "@/server/workspace/access";
import { getNavCounts, getOfferingNames, getUsageToday } from "@/server/workspace/queries";
import { AskShell, OpenAskButton } from "./ask/ask-context";
import { AskPanel } from "./ask/ask-panel";
import { CompanySwitcher, type SampleOption } from "./company-switcher";
import { HubNav, HubNavFallback } from "./hub-nav";

/**
 * The hub shell (PRD FR-HUB-1 as changed in 7.0): sidebar with Home,
 * Offerings, Opportunities and Settings; top bar with Ask or tell, today's
 * usage and the user. Everything that reads the session streams in behind
 * its own boundary, so the frame itself prerenders. The Ask or tell panel
 * (FR-ASK-1) opens from the top bar, Ctrl+J, Home or an offering page.
 */
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <AskShell className="flex min-h-screen flex-col md:flex-row">
      <aside aria-label="Hub navigation" className="flex flex-col gap-0.5 border-b-2 border-ink bg-card px-3 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r-2 md:border-b-0">
        <Link href="/home" className="px-2 pb-3.5" aria-label="FlowHub home">
          <Wordmark />
        </Link>
        <Suspense fallback={<HubNavFallback />}>
          <NavWithCounts />
        </Suspense>
        <Suspense fallback={null}>
          <SidebarFoot />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-15 flex-wrap items-center gap-3.5 border-b-2 border-ink bg-card px-4 py-2.5 sm:px-7">
          <Suspense fallback={<Skeleton className="h-5 w-40" />}>
            <TopBar />
          </Suspense>
        </header>
        <main className="flex w-full max-w-[1260px] flex-1 flex-col gap-5 px-4 pt-6 pb-12 sm:px-7">{children}</main>
      </div>
    </AskShell>
  );
}

async function NavWithCounts() {
  return <HubNav counts={await getNavCounts()} />;
}

/** FR-WS-3 to FR-WS-5: which company this is, and switching to another sample or your own. */
async function SidebarFoot() {
  const { workspace, role } = await getHubContext();
  const samples: SampleOption[] = Object.values(SAMPLES).map(({ seller, graph, initials, sells, city, blurb }) => ({ seller, name: graph.workspace.name, initials, sells, city, blurb }));
  return <CompanySwitcher current={{ workspaceId: workspace.id, name: workspace.name, sample: workspace.sample }} samples={samples} canSwitch={role === "owner"} />;
}

async function TopBar() {
  const [{ user, workspace, role }, usage, offerings] = await Promise.all([getHubContext(), getUsageToday(), getOfferingNames()]);
  const used = Math.min(100, Math.round((usage.stageRuns / usage.cap) * 100));
  return (
    <>
      <SessionKeeper exp={user.exp} />
      <span className="flex items-center gap-2 font-bold">
        {workspace.name}
        {workspace.sample ? (
          <span className="rounded-full border px-2 text-[11px] font-semibold text-muted-foreground">Sample</span>
        ) : null}
      </span>
      <span className="flex-1" />
      <OpenAskButton
        title="Ask or tell FlowHub (Ctrl+J)"
        className="inline-flex h-8 items-center gap-2 rounded-lg border-2 border-ai bg-ai-soft px-2.5 text-[13px] font-semibold text-ai shadow-[2px_2px_0_0_var(--ai)] hover:bg-ai-soft/70 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        <span aria-hidden="true" className="rounded bg-ai px-1.5 font-mono text-[10px] font-bold text-white dark:text-background">
          AI
        </span>
        Ask or tell FlowHub
        <kbd className="hidden rounded border border-ai/30 px-1 font-mono text-[10px] font-medium sm:inline">Ctrl J</kbd>
      </OpenAskButton>
      <AskPanel workspaceId={workspace.id} offerings={offerings} canEdit={role !== "viewer"} userName={user.name} />
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        AI runs today
        <span className="block h-1.5 w-18 overflow-hidden rounded-full bg-line-soft" aria-hidden="true">
          <span className="block h-full rounded-full bg-ai" style={{ width: `${used}%` }} />
        </span>
        <b className="text-foreground">
          {usage.stageRuns} / {usage.cap}
        </b>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border px-2 text-[11px] font-bold text-muted-foreground capitalize">{role}</span>
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="sr-only">Signed in as {user.name}</span>
        <SignOutButton />
      </div>
    </>
  );
}
