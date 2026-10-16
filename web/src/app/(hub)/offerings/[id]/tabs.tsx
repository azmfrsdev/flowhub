"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "@/components/flowhub/loading";
import { cn } from "cn";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "scope", label: "Scope" },
  { slug: "pricing", label: "Pricing" },
  { slug: "partners", label: "Partners" },
  { slug: "sales", label: "Sales material" },
  { slug: "notes", label: "Notes" },
] as const;

/** The six offering tabs, each its own URL (FR-OFR-2). */
export function OfferingTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/offerings/${id}`;
  return (
    // The baseline is an inset shadow, not a border, so the active underline sits on it without overflowing:
    // an overflowing strip showed a scrollbar. It still scrolls sideways on a narrow screen, with the bar hidden.
    <nav aria-label="Offering tabs" className="-mb-1 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(({ slug, label }) => {
        const href = slug ? `${base}/${slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
              active ? "border-ink font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
