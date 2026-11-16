"use client";

import { Briefcase, Home, Inbox, Newspaper, Package, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "@/components/flowhub/loading";
import { cn } from "cn";

const ITEMS = [
  { href: "/home", label: "Home", icon: Home, count: null },
  { href: "/news", label: "Today's paper", icon: Newspaper, count: null },
  { href: "/inbox", label: "Inbox", icon: Inbox, count: "inbox" },
  { href: "/offerings", label: "Offerings", icon: Package, count: "offerings" },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase, count: "opportunities" },
] as const;

type Counts = { offerings: number; opportunities: number; inbox: number } | null;

export function HubNav({ counts }: { counts: Counts }) {
  return <NavItems pathname={usePathname()} counts={counts} />;
}

/** The nav before the path and counts are known: same links, nothing highlighted. Reads no hooks, so it can sit in the static shell. */
export function HubNavFallback() {
  return <NavItems pathname="" counts={null} />;
}

function NavItems({ pathname, counts }: { pathname: string; counts: Counts }) {
  return (
    // On a phone the links run in one row that scrolls sideways; from md up they stack, with Settings at the foot.
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:mx-0 md:flex-1 md:flex-col md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
      {ITEMS.map(({ href, label, icon: Icon, count }) => (
        <NavLink key={href} href={href} active={pathname === href || pathname.startsWith(`${href}/`)} trailing={count && counts && (count !== "inbox" || counts.inbox > 0) ? <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums text-muted-foreground", count === "inbox" ? "border-[1.5px] border-ink bg-primary font-bold text-primary-foreground" : "bg-muted")} title={count === "inbox" ? "Emails waiting for you" : undefined}>{counts[count]}</span> : null}>
          <Icon aria-hidden="true" className="size-4.5 shrink-0" />
          {label}
        </NavLink>
      ))}
      <span aria-hidden="true" className="hidden md:block md:flex-1" />
      <NavLink href="/settings" active={pathname.startsWith("/settings")}>
        <SlidersHorizontal aria-hidden="true" className="size-4.5 shrink-0" />
        Settings
      </NavLink>
    </nav>
  );
}

function NavLink({ href, active, trailing, children }: { href: string; active: boolean; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Every link keeps a 2px border so the active one, outlined in ink like the logo, doesn't shift the others.
        "flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg border-2 border-transparent px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "border-ink bg-primary font-bold text-primary-foreground shadow-comic-sm hover:bg-primary",
      )}
    >
      {children}
      <span className="ml-auto flex items-center gap-2">
        {trailing}
        <LinkPending />
      </span>
    </Link>
  );
}
