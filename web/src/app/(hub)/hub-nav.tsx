"use client";

import { Briefcase, Home, Newspaper, Package, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "@/components/flowhub/loading";
import { cn } from "cn";

const ITEMS = [
  { href: "/news", label: "Today's paper", icon: Newspaper, count: null },
  { href: "/home", label: "Home", icon: Home, count: null },
  { href: "/offerings", label: "Offerings", icon: Package, count: "offerings" },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase, count: "opportunities" },
] as const;

type Counts = { offerings: number; opportunities: number } | null;

export function HubNav({ counts }: { counts: Counts }) {
  return <NavItems pathname={usePathname()} counts={counts} />;
}

/** The nav before the path and counts are known: same links, nothing highlighted. Reads no hooks, so it can sit in the static shell. */
export function HubNavFallback() {
  return <NavItems pathname="" counts={null} />;
}

function NavItems({ pathname, counts }: { pathname: string; counts: Counts }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon, count }) => (
        <NavLink key={href} href={href} active={pathname === href || pathname.startsWith(`${href}/`)} trailing={count && counts ? <span className="text-xs font-medium text-muted-foreground">{counts[count]}</span> : null}>
          <Icon aria-hidden="true" className="size-4.5" />
          {label}
        </NavLink>
      ))}
      <div className="px-2.5 pt-3.5 pb-1 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">Workspace</div>
      <NavLink href="/settings" active={pathname.startsWith("/settings")}>
        <SlidersHorizontal aria-hidden="true" className="size-4.5" />
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
        "flex min-h-9.5 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted",
        active && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
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
