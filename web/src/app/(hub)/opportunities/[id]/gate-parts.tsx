"use client";

import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { createContext, useContext, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { Run } from "@/lib/schema";
import { cn } from "cn";
import type { GateResult } from "./actions";

/** Building blocks shared by the stage views (deal room, PRD 7.5 to 7.9). */

/**
 * The deal header's action slot. Each stage renders its one main action into
 * it, so the way forward is always in view however long the page is.
 */
export const GateSlotContext = createContext<HTMLElement | null>(null);

export function GateSlot({ children }: { children: React.ReactNode }) {
  const slot = useContext(GateSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/** A gate's main action as one button in the header. Its form (what the person confirms or adds) opens beneath it and stays mounted, so nothing typed is lost. */
export function GatePopover({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GateSlot>
      <div className="relative order-last">
        <Button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="h-10 px-4 text-[15px] font-bold shadow-comic">
          {label}
          <ArrowRight aria-hidden="true" />
        </Button>
        <div hidden={!open} className="absolute right-0 z-30 mt-2.5 w-[min(92vw,28rem)] rounded-xl border-2 border-ink bg-card p-4 text-left shadow-comic">
          {children}
        </div>
      </div>
    </GateSlot>
  );
}

/** A card. `caption` is one short line on how its content was made; anything longer belongs in the content. */
export function Card({ title, id, marker, action, caption, children, className }: { title: string; id?: string; marker?: React.ReactNode; action?: React.ReactNode; caption?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("flex min-w-0 scroll-mt-44 flex-col rounded-xl border-2 border-ink bg-card shadow-comic", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-bold">{title}</h3>
        {marker}
        <span className="flex-1" />
        {action}
        {caption ? <p className="w-full text-[13px] text-muted-foreground">{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ColumnHeading({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">{children}</div>;
}

export function GateBar({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-attention/40 bg-attention-soft/40 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-bold tracking-wider text-attention uppercase">{label} · your decision</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </div>
      {children}
    </div>
  );
}

/** A passed gate, in the header: who approved it. The date is in the tooltip. */
export function Approved({ run, gate }: { run: Run; gate: string }) {
  if (run.state !== "approved") return null;
  const when = run.approvedAt ? ` on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(run.approvedAt))}` : "";
  return (
    <GateSlot>
      <span title={`${gate} passed${when}`} className="flex items-center gap-1.5 text-sm font-semibold text-fit-strong">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        Approved by {run.approvedBy ?? "someone"}
      </span>
    </GateSlot>
  );
}

export function useGate(action: () => Promise<GateResult>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return {
    pending,
    error,
    run: () =>
      startTransition(async () => {
        const result = await action();
        setError(result.error ?? null);
      }),
  };
}

export function RowRemove({ action, label, restore = false }: { action: () => Promise<GateResult>; label: string; restore?: boolean }) {
  const gate = useGate(action);
  return (
    <Button type="button" variant="ghost" size="icon-xs" disabled={gate.pending} onClick={gate.run} aria-label={label} title={gate.error ?? label} className="shrink-0">
      {restore ? <span aria-hidden="true" className="text-xs">↺</span> : <X aria-hidden="true" />}
    </Button>
  );
}
