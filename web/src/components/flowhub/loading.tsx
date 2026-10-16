"use client";

import Image from "next/image";
import { useLinkStatus } from "next/link";
import { cn } from "cn";

/**
 * Loading states for the hub. A skeleton shimmers where content will land,
 * and the FlowHub dog hops while a page or a clicked link is on its way.
 * Under reduced motion it only breathes.
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

/** The FlowHub dog, hopping on a loop. Decorative: pair it with text a screen reader can read. */
export function FlowLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("fh-loader inline-grid size-7 shrink-0 place-items-center", className)}>
      <Image src="/brand/flowhub-mark-256.png" alt="" width={64} height={64} className="fh-pup size-full" />
    </span>
  );
}

/** A floating "Loading …" chip, centred over a page's skeleton. */
export function LoadingChip({ label }: { label: string }) {
  return (
    <div role="status" className="fh-fade-in flex items-center gap-2.5 rounded-full border-2 border-ink bg-card py-1.5 pr-4 pl-2 text-sm font-medium shadow-comic-sm">
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
      <FlowLoader className="size-4.5" />
      <span className="sr-only">Opening…</span>
    </span>
  );
}
