"use client";

import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dismissInboxItem, openInboxDeal, rereadInboxItem } from "./actions";

type Action = "open" | "dismiss" | "reread";
const RUN: Record<Action, (itemId: string) => Promise<{ error?: string } | undefined>> = { open: openInboxDeal, dismiss: dismissInboxItem, reread: rereadInboxItem };
const LABEL: Record<Action, [string, string]> = { open: ["Open a deal", "Opening…"], dismiss: ["Not a lead", "Saving…"], reread: ["This is a lead", "Saving…"] };

/** FR-INBOX-12: a person's decision on an email. Each is a server action; the page refreshes with the result. */
export function InboxAction({ itemId, action, variant = "default", confirm }: { itemId: string; action: Action; variant?: "default" | "outline"; confirm?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          startTransition(async () => {
            setError(undefined);
            const result = await RUN[action](itemId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? LABEL[action][1] : LABEL[action][0]}
        {action === "open" && !pending ? <ArrowRight aria-hidden="true" /> : null}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
