import { Calculator } from "lucide-react";
import { cn } from "cn";

/**
 * Who-did-what markers (ADR-0009 D4, PRD FR-MRK-1). Every block in FlowHub
 * carries exactly one: AI, AI waiting for you, Calculated, or a person.
 * Each has a text label, so colour is never the only signal.
 */

export function AiMarker({ children, waiting = false, className }: { children: React.ReactNode; waiting?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-px pr-2.5 pl-0.5 text-xs font-semibold whitespace-nowrap align-middle",
        waiting ? "bg-attention-soft text-attention" : "bg-ai-soft text-ai",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full px-1.5 font-mono text-[0.625rem] leading-4 font-bold text-white dark:text-background",
          waiting ? "bg-attention" : "bg-ai",
        )}
      >
        AI
      </span>
      <span className="sr-only">{waiting ? "AI, waiting for you:" : "AI:"} </span>
      {children}
    </span>
  );
}

export function CalcMarker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-calc-soft px-2.5 py-px text-xs font-semibold whitespace-nowrap text-calc align-middle",
        className,
      )}
    >
      <Calculator aria-hidden="true" className="size-3" />
      <span className="sr-only">Calculated by code:</span>
      {children}
    </span>
  );
}

export function PersonMarker({ name, children, className }: { name: string; children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card py-px pr-2.5 pl-0.5 text-xs font-semibold whitespace-nowrap align-middle",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-4 place-items-center rounded-full bg-accent text-[0.5625rem] font-bold text-accent-foreground"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {children ?? name}
    </span>
  );
}
