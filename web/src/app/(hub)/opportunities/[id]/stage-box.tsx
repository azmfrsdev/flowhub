"use client";

import { Maximize2, X } from "lucide-react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { GoogleLogo } from "@/components/flowhub/google-logo";

/**
 * The deal room's fixed-size boxes (FR-RES-8, FR-FIT-9): a box with its title on the top
 * border, like a form field's label, and "View all" on the border too.
 */
export function Box({ title, marker, onMore, moreLabel = "View all", className, children }: { title: string; marker?: React.ReactNode; onMore?: () => void; moreLabel?: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={cn("relative flex min-w-0 flex-col rounded-xl border-2 border-ink bg-card pt-3.5 shadow-comic", className)}>
      <h2 className="absolute -top-3 left-3 flex items-center gap-1.5 bg-background px-1.5 text-[17px] leading-5 whitespace-nowrap">
        {title}
        {marker}
      </h2>
      {onMore ? (
        <button type="button" onClick={onMore} className="absolute -top-3 right-3 inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-ink bg-card px-2.5 text-xs font-bold hover:bg-attention-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {moreLabel}
          <Maximize2 aria-hidden="true" className="size-3" />
        </button>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A small tag on a box title. "ai" carries the Gemini mark, since every agent runs on Gemini;
 * "calc" marks work done by code.
 */
export function BoxTag({ kind, title, children }: { kind: "ai" | "calc"; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 font-sans text-[10px] leading-4 font-normal tracking-normal normal-case [font-size-adjust:none] [-webkit-text-stroke:0]", kind === "ai" ? "bg-ai-soft text-ai" : "bg-muted text-muted-foreground")}>
      {kind === "ai" ? <GoogleLogo product="gemini" className="size-2.5" /> : null}
      {children}
    </span>
  );
}

/** A side drawer from the right, on a native dialog so focus stays inside and Escape closes it. */
export const SideDrawer = forwardRef<HTMLDialogElement, { title: string | null; onClose: () => void; children: React.ReactNode }>(function SideDrawer({ title, onClose, children }, ref) {
  const close = () => (ref && typeof ref === "object" ? ref.current?.close() : undefined);
  return (
    <dialog
      ref={ref}
      aria-labelledby="side-drawer-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-xl border-l-2 border-ink bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      {title ? (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 border-b-2 border-ink px-5 py-3.5">
            <h2 id="side-drawer-title" className="min-w-0 flex-1 truncate text-2xl">
              {title}
            </h2>
            <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 text-[13.5px] leading-relaxed">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
});
