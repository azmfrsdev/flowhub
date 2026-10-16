"use client";

import { RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Restores a recycle-bin entry, with everything that was deleted with it. */
export function RestoreButton({ action, label }: { action: () => Promise<void>; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" size="sm" variant="outline" aria-label={label} disabled={pending} onClick={() => startTransition(() => action())}>
      <RotateCcw aria-hidden="true" />
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
