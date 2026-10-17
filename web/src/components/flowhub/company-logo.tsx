import { logoDataUri, monogram } from "@/lib/sample/logos";
import type { SampleSeller } from "@/lib/schema";
import { cn } from "cn";

/**
 * ADR-0016 D6: a sample company's mark on a white tile, or a monogram for the
 * person's own company. Decorative: the company's name is always set beside it.
 */
export function CompanyLogo({ sample, name, className }: { sample: SampleSeller | null | undefined; name?: string; className?: string }) {
  if (sample)
    return (
      <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-lg border-2 border-ink bg-white p-0.5", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG from code, not a remote image */}
        <img src={logoDataUri(sample)} alt="" className="size-full" />
      </span>
    );
  return (
    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-lg border-2 border-ink bg-primary text-xs font-bold text-primary-foreground", className)}>
      {name ? monogram(name) : "+"}
    </span>
  );
}
