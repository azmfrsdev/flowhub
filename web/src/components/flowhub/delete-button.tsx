"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { MENU_ITEM } from "@/components/flowhub/edit-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Deletes a record after a confirmation. Every delete is a soft delete: the
 * record goes to Settings › Recycle bin, where it can be restored with
 * whatever was deleted with it (CLAUDE.md conventions).
 */
export function DeleteButton({ action, label, confirm, text, menu = false }: { action: () => Promise<{ error?: string } | void>; label: string; confirm: string; text?: string; menu?: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = () => {
    if (!window.confirm(`${confirm}\n\nYou can restore it from Settings › Recycle bin.`)) return;
    startTransition(async () => {
      const result = await action();
      if (result && result.error) window.alert(result.error);
    });
  };
  // A row in a ⋯ menu, in the destructive colour, like the other rows there.
  if (menu)
    return (
      <button type="button" onClick={run} disabled={pending} className={cn(MENU_ITEM, "text-destructive [&_svg]:text-destructive")}>
        <Trash2 aria-hidden="true" />
        {pending ? "Deleting…" : (text ?? label)}
      </button>
    );
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
