import { cn } from "cn";

/** A red-pen mark at the top right, like a marked paper (FR-PREP-4, FR-REH-5). */
export function TeacherMark({ mark, capped }: { mark: number; capped: boolean }) {
  return (
    <span title={capped ? "Capped at 6 by code: an amount you said isn't an approved price" : `Marked ${mark} out of 10`} className="pointer-events-none absolute -top-1 right-0 -rotate-6 select-none">
      <span aria-hidden="true" className="flex size-16 flex-col items-center justify-center rounded-[52%_46%_55%_48%] border-[2.5px] border-destructive text-destructive">
        <span className="fh-hand text-3xl leading-none">{mark}</span>
        <span className="fh-hand -mt-0.5 text-[11px] leading-none">/10</span>
      </span>
      <span className="sr-only">Marked {mark} out of 10{capped ? ", capped by code" : ""}</span>
    </span>
  );
}

/** The same mark at text size, for a line in a box or a list (FR-PREP-6). */
export function SmallMark({ mark, capped = false, className }: { mark: number; capped?: boolean; className?: string }) {
  return (
    <span title={capped ? `${mark} out of 10, capped by code: a wrong amount` : `${mark} out of 10`} className={cn("fh-hand inline-flex h-5 min-w-9 shrink-0 -rotate-[5deg] items-center justify-center rounded-[52%_46%_55%_48%] border-2 border-destructive px-1 text-sm leading-none whitespace-nowrap text-destructive", className)}>
      {mark}/10
    </span>
  );
}
