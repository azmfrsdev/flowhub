import { cn } from "cn";

/** FlowHub wordmark: two flow lines meeting a node. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-base font-bold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-foreground" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M3 5h10M3 11h6" stroke="var(--background)" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="11" r="1.7" fill="var(--background)" />
        </svg>
      </span>
      FlowHub
    </span>
  );
}
