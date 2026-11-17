"use client";

import { ArrowRight, ChevronDown, Newspaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { cn } from "cn";
import { FlowLoader } from "@/components/flowhub/loading";
import { Button } from "@/components/ui/button";
import { openDeal, scanToday } from "./actions";

/** FR-NEWS-8: scans today's news into an edition, then shows it. About half a minute: four searches run at once, then the editor. */
export function ScanButton({ label, variant = "default" }: { label: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const result = await scanToday();
            if (result.error) setError(result.error);
            else router.push("/news");
          })
        }
      >
        {pending ? <FlowLoader className="size-4" /> : <Newspaper aria-hidden="true" />}
        {pending ? "Reading the news…" : label}
      </Button>
      {pending ? <span role="status" className="text-xs text-muted-foreground">Four searches at once, then the editor. About half a minute.</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A story's foot: "Why it fits" on the left, its action on the right, and the
 * details (what kind of news, the company, the offerings it fits and why)
 * folded underneath until the person opens them.
 */
export function StoryFoot({ action, children }: { action: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-8 items-center gap-1 rounded-md pr-1.5 text-[13px] font-bold text-ai hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {open ? "Hide details" : "Why it fits"}
          <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
        <span className="flex-1" />
        {action}
      </div>
      <div id={id} hidden={!open} className="flex flex-col gap-2 rounded-lg bg-ai-soft/60 px-3 py-2.5">
        {children}
      </div>
    </>
  );
}

/** FR-NEWS-7: opens a deal from a story and goes to its deal room. */
export function OpenDealButton({ day, storyId, company }: { day: string; storyId: string; company: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        aria-label={`Open a deal with ${company}`}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const result = await openDeal(day, storyId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Opening…" : "Open a deal"}
        <ArrowRight aria-hidden="true" />
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
