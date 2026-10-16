import { cn } from "cn";
import { Skeleton, SkeletonWithChip } from "./loading";
import { PupMark } from "./wordmark";

/** The card every hub section sits in: a titled header, optional actions, body and footer. */
export function SectionCard({
  title,
  id,
  subtitle,
  count,
  marker,
  action,
  footer,
  className,
  children,
}: {
  title: string;
  id: string;
  subtitle?: string;
  count?: number;
  marker?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col rounded-xl border-2 border-ink bg-card shadow-comic", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex flex-col">
          <h2 id={id} className="font-bold">
            {title}
          </h2>
          {subtitle ? <span className="text-sm text-muted-foreground">{subtitle}</span> : null}
        </div>
        {count !== undefined ? <span className="rounded-full border px-2 text-xs font-semibold text-muted-foreground">{count}</span> : null}
        {marker}
        <span className="flex-1" />
        {action}
      </div>
      {children}
      {footer ? <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-sm">{footer}</div> : null}
    </section>
  );
}

/** A tab or page body on its way: skeleton cards shaped like section cards, with the loading chip over them. */
export function TabFallback({ label = "Loading" }: { label?: string }) {
  return (
    <SkeletonWithChip label={label}>
      <div className="flex flex-col gap-4">
        {[3, 4].map((rows, card) => (
          <div key={card} className="flex flex-col rounded-xl border-2 border-ink bg-card shadow-comic">
            <div className="flex items-center gap-3 border-b px-4 py-3.5">
              <Skeleton className="h-4 w-36" />
              <span className="flex-1" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-4">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3.5 w-1/5" />
                  <Skeleton className="ml-auto h-3.5 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonWithChip>
  );
}

/** An empty list inside a card: the dog says so in a speech bubble (ADR-0013). */
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 px-4 py-4">
      <PupMark className="size-8" />
      <p className="fh-bubble fh-hand max-w-prose px-3 py-1 text-sm leading-snug">{children}</p>
    </div>
  );
}

/** An empty page: a bigger dog, its line in a bubble, and what to do next. */
export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-xl border-2 border-ink bg-card px-6 py-10 text-center shadow-comic", className)}>
      <div className="flex items-start gap-4 text-left">
        <PupMark className="size-16" />
        <div className="fh-bubble flex max-w-md flex-col gap-1 px-4 py-2.5">
          <p className="fh-hand text-lg leading-tight">{title}</p>
          {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
