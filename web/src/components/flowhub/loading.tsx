"use client";

import { useLinkStatus } from "next/link";
import { cn } from "cn";

/**
 * Loading states for the hub. A skeleton shimmers where content will land,
 * and the FlowHub mark draws itself (two flow lines, then the node) while a
 * page or a clicked link is on its way. Motion stops under reduced motion.
 */

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn("fh-skeleton rounded-md", className)} style={style} />;
}

/** A list on its way inside a card: a few shimmering rows. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-3 p-4", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${72 - ((index * 17) % 30)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The FlowHub mark, drawing itself on a loop. Decorative: pair it with text a screen reader can read. */
export function FlowLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("fh-loader grid size-7 shrink-0 place-items-center rounded-lg bg-foreground", className)}>
      <svg viewBox="0 0 16 16" className="size-[57%] overflow-visible">
        <path className="fh-loader-top" d="M3 5h10" pathLength={1} stroke="var(--background)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path className="fh-loader-bottom" d="M3 11h6" pathLength={1} stroke="var(--background)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <circle className="fh-loader-node" cx="12" cy="11" r="1.7" fill="var(--background)" />
      </svg>
    </span>
  );
}

/** A floating "Loading …" chip, centred over a page's skeleton. */
export function LoadingChip({ label }: { label: string }) {
  return (
    <div role="status" className="fh-fade-in flex items-center gap-2.5 rounded-full border bg-card/95 py-1.5 pr-4 pl-1.5 text-sm font-medium text-muted-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--foreground)_10%,transparent)]">
      <FlowLoader className="size-7" />
      {label}…
    </div>
  );
}

/** A page section's skeleton with the loading chip over it. */
export function SkeletonWithChip({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden="true">{children}</div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full max-h-80 items-center justify-center">
        <LoadingChip label={label} />
      </div>
    </div>
  );
}

/**
 * Feedback the moment a link is clicked, before the next page arrives. Must
 * sit inside a next/link. It stays hidden for a fast navigation (the CSS
 * waits 120 ms before showing it), so it only appears when there's a wait.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className={cn("fh-link-pending inline-flex", className)}>
      <FlowLoader className="size-4.5 rounded-[5px]" />
      <span className="sr-only">Opening…</span>
    </span>
  );
}
