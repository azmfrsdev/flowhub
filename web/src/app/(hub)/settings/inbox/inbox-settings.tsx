"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { makeInboxKey, setAutoIntake } from "./actions";

/** FR-INBOX-2: the workspace key. Shown once when it's made; after that only its last four characters. */
export function KeyPanel({ hint, canEdit }: { hint: string | null; canEdit: boolean }) {
  const [key, setKey] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const make = () => {
    if (hint && !window.confirm("Make a new key? The old one stops working at once, so paste the new key into the script straight away.")) return;
    startTransition(async () => {
      setCopied(false);
      setKey((await makeInboxKey()).key);
    });
  };
  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key).catch(() => undefined);
    setCopied(true);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className={cn("max-w-full rounded-lg border-[1.5px] border-dashed border-ink bg-subtle px-2 py-1 font-mono text-[12.5px] break-all", !key && !hint && "text-muted-foreground")}>
          {key ?? (hint ? `fhk_••••••••••••${hint}` : "No key yet")}
        </code>
        {key ? (
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
        {canEdit ? (
          <Button type="button" variant={hint || key ? "outline" : "default"} size="sm" disabled={pending} onClick={make}>
            <KeyRound aria-hidden="true" />
            {pending ? "Making…" : hint || key ? "Make a new key" : "Make a key"}
          </Button>
        ) : null}
      </div>
      {key ? (
        <p role="status" className="text-xs font-semibold text-attention">
          Copy it now. FlowHub keeps only a fingerprint of the key, so it can&apos;t show it again.
        </p>
      ) : null}
    </div>
  );
}

/** Decision 1: whether a clear lead starts intake on its own. */
export function AutoIntakeSwitch({ on, canEdit }: { on: boolean; canEdit: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby="auto-intake-label"
        disabled={!canEdit || pending}
        onClick={() => {
          const next = !value;
          setValue(next);
          startTransition(() => setAutoIntake(next));
        }}
        className={cn("relative mt-0.5 h-5.5 w-10 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-60", value ? "bg-primary" : "bg-subtle")}
      >
        <span aria-hidden="true" className={cn("absolute top-0.5 left-0.5 size-3.5 rounded-full bg-ink transition-transform", value && "translate-x-[18px]")} />
      </button>
      <div className="flex flex-col">
        <b id="auto-intake-label">Start intake on its own for clear leads</b>
        <span className="text-sm text-muted-foreground">A score of 70 or more starts intake, which stops at Gate A. Below that, or with this off, the email waits for a person.</span>
      </div>
    </div>
  );
}
