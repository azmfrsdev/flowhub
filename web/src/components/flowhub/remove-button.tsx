"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Removes a row through a server action, after a confirmation. Removal is a soft delete. */
export function RemoveButton({ action, label }: { action: () => Promise<void>; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => {
        if (window.confirm(`${label}?`)) startTransition(() => action());
      }}
    >
      <X aria-hidden="true" />
    </Button>
  );
}
