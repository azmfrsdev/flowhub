"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { PersonMarker } from "@/components/flowhub/markers";
import { Button } from "@/components/ui/button";
import type { Run } from "@/lib/schema";
import { cn } from "cn";
import type { GateResult } from "./actions";

/** Building blocks shared by the stage views (deal room, PRD 7.5 to 7.9). */

export function Card({ title, id, marker, action, children, className }: { title: string; id?: string; marker?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("flex min-w-0 scroll-mt-4 flex-col rounded-xl border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-bold">{title}</h3>
        {marker}
        <span className="flex-1" />
        {action}
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

export function Approved({ run, gate }: { run: Run; gate: string }) {
  if (run.state !== "approved") return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <PersonMarker name={run.approvedBy ?? "Someone"} /> passed {gate}
      {run.approvedAt ? ` on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(run.approvedAt))}` : ""}.
    </p>
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
