"use client";

import { Building2, ChevronsUpDown, Info, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Field, SelectField } from "@/components/flowhub/edit-dialog";
import { PendingButton } from "@/components/flowhub/pending-button";
import { Button } from "@/components/ui/button";
import type { SampleSeller } from "@/lib/schema";
import { COUNTRIES, CURRENCIES } from "@/lib/schema/workspace";
import { cn } from "cn";
import { type OwnCompanyState, switchSample, switchToOwnCompany } from "./settings/actions";

export type SampleOption = { seller: SampleSeller; name: string; initials: string; sells: string; city: string; blurb: string };
type Current = { workspaceId: string; name: string; sample: SampleSeller | null };

const ABOUT = "Three made-up companies, each with offerings, prices and past deals, so you can try every feature. Or set up your own company and start empty. Switching replaces what you see now; today's AI runs carry over.";

/**
 * FR-WS-3, FR-WS-4, FR-WS-5: the company this workspace is, at the foot of
 * the sidebar, and a quick way to switch to another sample company, reset
 * this one, or start empty as your own company. The Owner confirms first.
 */
export function CompanySwitcher({ current, samples, canSwitch }: { current: Current; samples: SampleOption[]; canSwitch: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<SampleOption | "own" | null>(null);
  const mine = samples.find((sample) => sample.seller === current.sample);

  const show = () => {
    setChoice(null);
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-line-soft px-1 pt-3 md:mt-auto">
      <div className="flex items-center gap-1 px-1.5 text-[11px] font-bold tracking-[0.07em] text-muted-foreground uppercase">
        {current.sample ? "Sample company" : "Your company"}
        <span className="group relative inline-flex">
          <button type="button" aria-label="About sample companies" aria-describedby="about-samples" className="grid size-5 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <Info aria-hidden="true" className="size-3.5" />
          </button>
          <span id="about-samples" role="tooltip" className="invisible absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg border-2 border-ink bg-card p-2.5 text-xs leading-snug font-normal tracking-normal text-foreground normal-case opacity-0 shadow-comic-sm transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
            {ABOUT}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={show}
        disabled={!canSwitch}
        title={canSwitch ? "Switch company" : "Only the Owner can switch companies"}
        className="flex items-center gap-2.5 rounded-lg border-2 border-ink bg-card px-2 py-1.5 text-left shadow-comic-sm hover:bg-accent active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-default disabled:hover:bg-card"
      >
        <Avatar initials={mine?.initials} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{current.name}</span>
          <span className="truncate text-xs text-muted-foreground">{mine ? `${mine.sells} · ${mine.city}` : "Your own data"}</span>
        </span>
        {canSwitch ? <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="switch-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border-2 border-ink bg-card p-0 text-foreground shadow-comic-lg backdrop:bg-black/40"
      >
        {open ? (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <h2 id="switch-title" className="text-2xl">
                  Switch company
                </h2>
                <p className="text-sm text-muted-foreground">{ABOUT}</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={close}>
                <X aria-hidden="true" />
              </Button>
            </div>

            {choice === null ? (
              <ul className="flex flex-col gap-2">
                {samples.map((sample) => (
                  <li key={sample.seller}>
                    <button type="button" onClick={() => setChoice(sample)} className="flex w-full items-start gap-3 rounded-lg border-2 border-ink/20 px-3 py-2.5 text-left hover:border-ink hover:bg-accent/50">
                      <Avatar initials={sample.initials} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{sample.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {sample.sells} · {sample.city}
                          </span>
                          {sample.seller === current.sample ? <span className="rounded-full bg-primary px-2 text-[11px] font-semibold text-primary-foreground">Current · reset</span> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{sample.blurb}</span>
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={() => setChoice("own")} className={cn("flex w-full items-start gap-3 rounded-lg border-2 border-dashed border-ink/30 px-3 py-2.5 text-left hover:border-ink hover:bg-accent/50")}>
                    <Avatar />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">Your own company</span>
                      <span className="text-xs text-muted-foreground">Start empty with your company&apos;s name, then add what you sell by hand or from a brochure.</span>
                    </span>
                  </button>
                </li>
              </ul>
            ) : choice === "own" ? (
              <OwnCompany current={current.name} onBack={() => setChoice(null)} />
            ) : (
              <ConfirmSample current={current} choice={choice} onBack={() => setChoice(null)} />
            )}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function Avatar({ initials }: { initials?: string }) {
  return (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-primary text-xs font-bold text-primary-foreground">
      {initials ?? <Building2 className="size-4" />}
    </span>
  );
}

function ConfirmSample({ current, choice, onBack }: { current: Current; choice: SampleOption; onBack: () => void }) {
  const reset = choice.seller === current.sample;
  return (
    <form action={switchSample} className="flex flex-col gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3 text-sm">
      <input type="hidden" name="seller" value={choice.seller} />
      {reset ? (
        <>
          <input type="hidden" name="reset" value="1" />
          <input type="hidden" name="workspaceId" value={current.workspaceId} />
        </>
      ) : null}
      <p>
        {reset ? (
          <>
            <b>Reset {current.name} to the original sample?</b> What you added to it, such as opportunities, notes and edits, will no longer be shown.
          </>
        ) : (
          <>
            <b>
              Replace {current.name} with {choice.name}?
            </b>{" "}
            {current.name} and what you added to it will no longer be shown. You can switch back any time, as a fresh copy.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <PendingButton size="sm" pendingLabel={reset ? `Resetting ${current.name}…` : `Setting up ${choice.name}…`}>
          {reset ? `Reset ${current.name}` : `Switch to ${choice.name}`}
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}

function OwnCompany({ current, onBack }: { current: string; onBack: () => void }) {
  const [state, action] = useActionState<OwnCompanyState, FormData>(switchToOwnCompany, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3 text-sm" noValidate>
      <Field label="Company name" name="name" maxLength={120} required placeholder="Your company Sdn Bhd" />
      {errors.name ? <span className="-mt-2 text-xs text-destructive">{errors.name}</span> : null}
      <Field label="Website" name="website" hint="optional" maxLength={200} placeholder="https://" type="url" />
      {errors.website ? <span className="-mt-2 text-xs text-destructive">{errors.website}</span> : null}
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Country" name="country" defaultValue="MY" options={Object.entries(COUNTRIES).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Currency" name="currency" defaultValue="MYR" options={CURRENCIES.map((value) => ({ value, label: value }))} />
      </div>
      <p className="text-xs text-muted-foreground">This replaces {current}. You can switch back to a sample company any time.</p>
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PendingButton size="sm" pendingLabel="Setting up…">
          Create and switch
        </PendingButton>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
