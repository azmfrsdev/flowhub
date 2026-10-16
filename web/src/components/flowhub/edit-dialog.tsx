"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export type FormResult = { error?: string; ok?: number };

/**
 * A record's edit or create form in a dialog (ADR-0009 D3 as amended
 * 2026-10-16: every record can be edited by hand). The form posts to a server
 * action, which validates with Zod and checks the role (invariant 10).
 */
export function EditDialog({
  title,
  action,
  children,
  trigger = "edit",
  triggerLabel,
  submitLabel = "Save",
  className,
}: {
  title: string;
  action: (previous: FormResult, formData: FormData) => Promise<FormResult>;
  children: React.ReactNode;
  trigger?: "edit" | "add" | "text";
  triggerLabel?: string;
  submitLabel?: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Close once a save succeeds; an error keeps the form open with the message.
  const [state, formAction] = useActionState(async (previous: FormResult, formData: FormData) => {
    const result = await action(previous, formData);
    if (!result.error) dialog.current?.close();
    return result;
  }, {});

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };

  return (
    <>
      {trigger === "edit" ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={triggerLabel ?? title} title={triggerLabel ?? title} onClick={show} className={className}>
          <Pencil aria-hidden="true" />
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={show} className={className}>
          {trigger === "add" ? <Plus aria-hidden="true" /> : null}
          {triggerLabel ?? title}
        </Button>
      )}
      <dialog
        ref={dialog}
        aria-label={title}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        {open ? (
          <form action={formAction} className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-base font-bold">{title}</h2>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => dialog.current?.close()}>
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="flex flex-col gap-3 text-sm">{children}</div>
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <PendingButton size="sm" pendingLabel="Saving…">
                {submitLabel}
              </PendingButton>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}

const CONTROL = "w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** A labelled field for EditDialog forms. */
export function Field({ label, name, defaultValue, hint, multiline, maxLength = 300, required, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string; hint?: string; multiline?: boolean; maxLength?: number; required?: boolean; placeholder?: string; type?: string }) {
  const id = `f-${name}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="font-medium">
        {label}
        {hint ? <span className="font-normal text-muted-foreground"> ({hint})</span> : null}
      </span>
      {multiline ? (
        <textarea id={id} name={name} defaultValue={defaultValue} maxLength={maxLength} required={required} placeholder={placeholder} rows={3} className={CONTROL} />
      ) : (
        <input id={id} name={name} type={type} defaultValue={defaultValue} maxLength={maxLength} required={required} placeholder={placeholder} className={cn(CONTROL, "h-8 py-0")} />
      )}
    </label>
  );
}

/** A labelled select for EditDialog forms. */
export function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[] }) {
  const id = `f-${name}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <select id={id} name={name} defaultValue={defaultValue} className={cn(CONTROL, "h-8 py-0")}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A checkbox for EditDialog forms. It posts "on" when ticked. */
export function CheckField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}
