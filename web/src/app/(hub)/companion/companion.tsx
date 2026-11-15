"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { StickerDog } from "@/components/flowhub/sticker-dog";
import { type CompanionMarker, type CompanionView, STAGE_LABEL } from "@/lib/companion/state";
import type { Opportunity, StageKey, StageState } from "@/lib/schema";
import { useAsk } from "../ask/ask-context";
import { useCompanion } from "./use-companion";

/**
 * The dog companion (PRD 7.31, ADR-0023): bottom right of every signed-in
 * screen, showing what the agents are doing and when a person is needed. It
 * reads only (use-companion.ts); hiding it is a browser preference, never
 * workspace data (invariant 10).
 */

const BUBBLE_MS = 5000;
const BUBBLE_GAP_MS = 3000;
const HIDDEN_KEY = "flowhub:companion-hidden";
const VISIBILITY_EVENT = "flowhub:companion-visibility";

/* ---------- Hide and show: a browser preference ---------- */

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function setHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(HIDDEN_KEY, "1");
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
  window.dispatchEvent(new CustomEvent(VISIBILITY_EVENT, { detail: hidden }));
}

let hiddenFallback = false;
function subscribeHidden(onChange: () => void) {
  const handler = (event: Event) => {
    hiddenFallback = Boolean((event as CustomEvent<boolean>).detail);
    onChange();
  };
  window.addEventListener(VISIBILITY_EVENT, handler);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(VISIBILITY_EVENT, handler);
    window.removeEventListener("storage", onChange);
  };
}

function useHidden(): boolean {
  return useSyncExternalStore(
    subscribeHidden,
    () => readHidden() || hiddenFallback,
    () => true,
  );
}

/** "Show the dog", in the sidebar foot, only while it is hidden (FR-DOG-7). */
export function ShowDogButton() {
  const hidden = useHidden();
  if (!hidden) return null;
  return (
    <button type="button" onClick={() => setHidden(false)} className="mx-2 mt-1 self-start rounded-md px-1 text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
      Show the dog
    </button>
  );
}

/* ---------- The companion ---------- */

export function Companion({ workspaceId }: { workspaceId: string }) {
  const hidden = useHidden();
  const { view, deals } = useCompanion(workspaceId, !hidden);
  const { open: askOpen, openAsk } = useAsk();
  const bubble = useBubble(view, !hidden);
  const [panelOpen, setPanelOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const closePanel = useCallback((refocus: boolean) => {
    setPanelOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  if (hidden) return null;
  const deal = view.focus ? deals.get(view.focus.opportunityId) : undefined;

  return (
    <div className={cn("pointer-events-none fixed right-4 bottom-4 z-40 flex items-end gap-3", askOpen && "max-sm:hidden sm:right-[456px]")}>
      <div aria-live="polite" className="sr-only">
        {view.announce ? view.line : ""}
      </div>
      <div
        data-shown={bubble.shown && !panelOpen}
        aria-hidden="true"
        className="fh-dog-bubble relative mb-7 max-w-[240px] rounded-2xl border-2 border-ink bg-card px-3 py-2 text-[13px] leading-snug shadow-comic-sm max-sm:max-w-[190px]"
      >
        <span className="fh-hand block text-[15px] leading-tight">{bubble.line}</span>
        {bubble.marker ? <Marker kind={bubble.marker} /> : null}
      </div>
      <div className="pointer-events-auto relative">
        {panelOpen ? <Panel id={panelId} view={view} deal={deal} onClose={closePanel} onOpenAsk={() => openAsk()} /> : null}
        <button
          ref={button}
          type="button"
          aria-expanded={panelOpen}
          aria-controls={panelOpen ? panelId : undefined}
          aria-label={`FlowHub dog: ${STATE_NAME[view.state]}. Show what it's reacting to`}
          onClick={() => setPanelOpen((value) => !value)}
          className="relative block size-14 rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-link sm:size-[72px]"
        >
          <StickerDog state={view.state} className="size-full" />
          {view.attention > 0 ? (
            <span aria-hidden="true" className="absolute -top-1 -left-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[oklch(0.205_0.012_75)] bg-primary px-1 text-[11px] font-bold text-[oklch(0.205_0.012_75)]">
              {view.attention}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

const STATE_NAME: Record<CompanionView["state"], string> = {
  worried: "something stopped",
  flag: "a claim needs a look",
  wait: "waiting for you",
  think: "an agent is working",
  count: "code is calculating",
  happy: "approved",
  listen: "listening",
  sleep: "nothing running",
};

function Marker({ kind }: { kind: CompanionMarker }) {
  const label = kind === "ai" ? "AI" : kind === "calc" ? "Code" : "You";
  const tone = kind === "ai" ? "border-ai bg-ai-soft text-ai" : kind === "calc" ? "border-calc bg-calc-soft text-calc" : "border-stage-approved bg-stage-approved-soft text-stage-approved";
  return <span className={cn("mt-1 inline-flex rounded-full border px-2 text-[11px] font-semibold", tone)}>{label}</span>;
}

/** Shows a line when the state changes, at most every 3 seconds, and fades it after 5 (FR-DOG-5). */
function useBubble(view: CompanionView, active: boolean) {
  const [bubble, setBubble] = useState<{ line: string; marker: CompanionMarker | null; shown: boolean }>({ line: "", marker: null, shown: false });
  const lastShown = useRef(0);
  const key = `${view.state}|${view.line ?? ""}`;
  const { line, marker } = view;
  useEffect(() => {
    if (!active || !line) return;
    let hide = 0;
    const show = window.setTimeout(
      () => {
        lastShown.current = Date.now();
        setBubble({ line, marker, shown: true });
        hide = window.setTimeout(() => setBubble((current) => ({ ...current, shown: false })), BUBBLE_MS);
      },
      Math.max(0, lastShown.current + BUBBLE_GAP_MS - Date.now()),
    );
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
    // The key holds the state and the line; a new one replaces the bubble.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  // A state with nothing to say hides the bubble at once.
  return { ...bubble, shown: bubble.shown && active && Boolean(line) };
}

const STATE_TEXT: Record<StageState, string> = {
  idle: "Not started",
  running: "Working",
  waiting: "Waiting for you",
  approved: "Approved",
  stale: "Needs a rerun",
  failed: "Stopped",
};
const STATE_TONE: Record<StageState, string> = {
  idle: "text-muted-foreground",
  running: "text-stage-running font-semibold",
  waiting: "text-stage-waiting font-semibold",
  approved: "text-stage-approved",
  stale: "text-muted-foreground",
  failed: "text-stage-failed font-semibold",
};

/** Clicking the dog (FR-DOG-6): the deal it's reacting to, where to go, and Hide. */
function Panel({ id, view, deal, onClose, onOpenAsk }: { id: string; view: CompanionView; deal: Opportunity | undefined; onClose: (refocus: boolean) => void; onOpenAsk: () => void }) {
  return (
    <div id={id} role="dialog" aria-label="What the dog is reacting to" className="absolute right-0 bottom-[calc(100%+12px)] grid w-[min(300px,calc(100vw-32px))] gap-2.5 rounded-2xl border-2 border-ink bg-card p-3.5 shadow-comic">
      {deal ? (
        <>
          <div>
            <h2 className="fh-hand text-lg leading-tight">{deal.prospect?.name ?? "A new deal"}</h2>
            {view.line ? <p className="text-[12.5px] text-muted-foreground">{view.line}</p> : null}
          </div>
          <ul className="grid gap-1 text-[12.5px]">
            {(Object.keys(STAGE_LABEL) as StageKey[]).map((stage) => (
              <li key={stage} className="flex justify-between gap-3">
                <span>{STAGE_LABEL[stage]}</span>
                <span className={STATE_TONE[deal.stages[stage].state]}>{STATE_TEXT[deal.stages[stage].state]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div>
          <h2 className="fh-hand text-lg leading-tight">{view.proposals > 0 ? "Ask or tell" : "Nothing is running"}</h2>
          <p className="text-[12.5px] text-muted-foreground">{view.line ?? "When an agent works on a deal, you'll see it here."}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {deal ? (
          <Link
            href={`/opportunities/${deal.id}`}
            onClick={() => onClose(false)}
            className="inline-flex h-8 items-center rounded-lg border-2 border-ink bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-comic-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Open the deal room
          </Link>
        ) : view.proposals > 0 ? (
          <button
            type="button"
            onClick={() => {
              onClose(false);
              onOpenAsk();
            }}
            className="inline-flex h-8 items-center rounded-lg border-2 border-ink bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-comic-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Open Ask or tell
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            onClose(false);
            setHidden(true);
          }}
          className="inline-flex h-8 items-center rounded-lg border-2 border-ink bg-card px-3 text-[13px] font-semibold shadow-comic-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Hide the dog
        </button>
      </div>
    </div>
  );
}
