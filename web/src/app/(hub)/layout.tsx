import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/flowhub/loading";
import { MenuCloser } from "@/components/flowhub/menu-closer";
import { SessionKeeper } from "@/components/flowhub/session-keeper";
import { SignOutButton } from "@/components/flowhub/sign-out-button";
import { Wordmark } from "@/components/flowhub/wordmark";
import { SAMPLES } from "@/lib/sample";
import { getHubContext } from "@/server/workspace/access";
import { getNavCounts, getOfferingNames, getUsageToday } from "@/server/workspace/queries";
import { AskShell, OpenAskButton } from "./ask/ask-context";
import { AskPanel } from "./ask/ask-panel";
import { Companion, ShowDogButton } from "./companion/companion";
import { CompanySwitcher, type SampleOption } from "./company-switcher";
import { HubNav, HubNavFallback } from "./hub-nav";

/**
 * The hub shell (PRD FR-HUB-1 as changed in 7.0): sidebar with Home,
 * Offerings, Opportunities and Settings; top bar with Ask or tell, today's
 * usage and the user. Everything that reads the session streams in behind
 * its own boundary, so the frame itself prerenders. The Ask or tell panel
 * (FR-ASK-1) opens from the top bar, Ctrl+J, Home or an offering page. The dog
 * companion (PRD 7.31, ADR-0023) sits bottom right when its flag is on.
 */
const COMPANION_ON = process.env.NEXT_PUBLIC_FLOWHUB_COMPANION === "1";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <AskShell className="flex min-h-screen flex-col md:flex-row">
      <MenuCloser />
      <aside aria-label="Hub navigation" className="flex flex-col gap-0.5 border-b-2 border-ink bg-card px-3 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-r-2 md:border-b-0 md:py-4 md:[scrollbar-width:thin]">
        <Link href="/home" className="px-2 pb-2 md:pb-4" aria-label="FlowHub home">
          <Wordmark />
        </Link>
        <Suspense fallback={<HubNavFallback />}>
          <NavWithCounts />
        </Suspense>
        <Suspense fallback={null}>
          <SidebarFoot />
        </Suspense>
        {COMPANION_ON ? <ShowDogButton /> : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-15 flex-wrap items-center gap-3.5 border-b-2 border-ink bg-card px-4 py-2.5 sm:px-7">
          <Suspense fallback={<Skeleton className="h-5 w-40" />}>
            <TopBar />
          </Suspense>
        </header>
        <main className="flex w-full max-w-[1260px] flex-1 flex-col gap-5 px-4 pt-6 pb-12 sm:px-7">{children}</main>
      </div>
      {COMPANION_ON ? (
        <Suspense fallback={null}>
          <CompanionMount />
        </Suspense>
      ) : null}
    </AskShell>
  );
}

/** FR-DOG-2: the dog companion, for this workspace. */
async function CompanionMount() {
  const { workspace } = await getHubContext();
  return <Companion workspaceId={workspace.id} />;
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
      {/* The company name lives at the foot of the sidebar; the top bar leads with the one thing you can always do: ask or tell FlowHub. */}
      <OpenAskButton
        title="Ask or tell FlowHub (Ctrl+J)"
        className="inline-flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-ai bg-ai-soft px-2.5 text-left text-sm font-semibold text-ai shadow-[2px_2px_0_0_var(--ai)] hover:bg-ai-soft/70 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:max-w-md"
      >
        <span aria-hidden="true" className="rounded bg-ai px-1.5 font-mono text-[10px] font-bold text-white dark:text-background">
          AI
        </span>
        <span className="min-w-0 flex-1 truncate">Ask or tell FlowHub…</span>
        <kbd className="hidden rounded border border-ai/30 px-1 font-mono text-[10px] font-medium sm:inline">Ctrl J</kbd>
      </OpenAskButton>
      <span className="hidden flex-1 sm:block" />
      <AskPanel workspaceId={workspace.id} offerings={offerings} canEdit={role !== "viewer"} userName={user.name} />
      {/* The account menu holds what a glance at the page doesn't need: who is signed in, today's usage, and sign out. */}
      <details data-menu className="relative">
        <summary aria-label={`Account: ${user.name}, ${role}`} title={user.name} className="grid size-9 cursor-pointer list-none place-items-center rounded-full border-2 border-ink bg-accent text-xs font-bold text-accent-foreground hover:shadow-comic-sm [&::-webkit-details-marker]:hidden">
          {user.name.slice(0, 1).toUpperCase()}
        </summary>
        <div className="absolute right-0 z-40 mt-2 flex w-60 flex-col gap-3 rounded-xl border-2 border-ink bg-card p-3.5 text-sm shadow-comic">
          <div className="flex items-center gap-2">
            <b className="min-w-0 flex-1 truncate">{user.name}</b>
            <span className="rounded-full border px-2 text-[11px] font-bold text-muted-foreground capitalize">{role}</span>
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            AI runs today
            <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft" aria-hidden="true">
              <span className="block h-full rounded-full bg-ai" style={{ width: `${used}%` }} />
            </span>
            <b className="text-foreground">
              {usage.stageRuns} / {usage.cap}
            </b>
          </div>
          <SignOutButton />
        </div>
      </details>
    </>
  );
}
