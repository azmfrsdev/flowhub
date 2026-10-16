"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Flip a result between Public and Not public. Making one public is confirmed, because proposals may then cite it. */
export function PublicToggle({ action, isPublic, title }: { action: () => Promise<void>; isPublic: boolean; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={pending}
      onClick={() => {
        if (!isPublic && !window.confirm(`Make "${title}" public? Proposals will be allowed to cite it.`)) return;
        startTransition(() => action());
      }}
    >
      {pending ? "Saving…" : isPublic ? "Make not public" : "Make public"}
    </Button>
  );
}
