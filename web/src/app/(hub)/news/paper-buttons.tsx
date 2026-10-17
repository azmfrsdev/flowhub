"use client";

import { ArrowRight, Newspaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

/** FR-NEWS-7: opens a deal from a story and goes to its deal room. */
export function OpenDealButton({ day, storyId, company }: { day: string; storyId: string; company: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex flex-col items-start gap-1">
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
