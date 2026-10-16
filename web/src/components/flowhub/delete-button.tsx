"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Deletes a record after a confirmation. Every delete is a soft delete: the
 * record goes to Settings › Recycle bin, where it can be restored with
 * whatever was deleted with it (CLAUDE.md conventions).
 */
export function DeleteButton({ action, label, confirm, text }: { action: () => Promise<{ error?: string } | void>; label: string; confirm: string; text?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={text ? "outline" : "ghost"}
      size={text ? "sm" : "icon-sm"}
      aria-label={label}
      title={label}
      disabled={pending}
      className={text ? "text-destructive" : undefined}
      onClick={() => {
        if (!window.confirm(`${confirm}\n\nYou can restore it from Settings › Recycle bin.`)) return;
        startTransition(async () => {
          const result = await action();
          if (result && result.error) window.alert(result.error);
        });
      }}
    >
      <Trash2 aria-hidden="true" />
      {text ? (pending ? "Deleting…" : text) : null}
    </Button>
  );
}
