"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type CompanionInput, type StageSignal, companionView, focusRunning, focusWrite } from "@/lib/companion/state";
import { useLiveCollection, useLiveDoc } from "@/lib/firebase/live";
import type { Opportunity, Proposal, Run, RunEvent, StageKey, WriteOutput } from "@/lib/schema";
import { useAsk } from "../ask/ask-context";

/**
 * What the dog companion reads (PRD FR-DOG-4, ADR-0023 D3): the same
 * read-only Firestore listeners as the rest of the hub, plus two browser-only
 * signals. Nothing here writes, and nothing calls a model. With the dog
 * hidden, no listener is opened.
 */

const STAGES: StageKey[] = ["intake", "research", "fit", "write"];
/** The most recently updated deals are enough: older ones have nothing running or waiting. */
const RECENT_DEALS = 25;
const TYPING_MS = 1800;

export function useCompanion(workspaceId: string, active: boolean) {
  const base = active ? `workspaces/${workspaceId}` : null;
  const now = useNow(active);
  const opportunities = useLiveCollection<Opportunity>(base && `${base}/opportunities`, "updatedAt", RECENT_DEALS);
  const proposals = useLiveCollection<Proposal>(base && `${base}/proposals`, "createdAt", 10);

  const stages = useMemo(() => toSignals(opportunities), [opportunities]);
  const deals = useMemo(() => new Map(opportunities.map((opp) => [opp.id, opp])), [opportunities]);

  // The running stage's latest event says whether a model or code is at work.
  const running = focusRunning(stages, now);
  const runningPath = base && running?.runId ? `${base}/opportunities/${running.opportunityId}/runs/${running.runId}` : null;
  const lastEvents = useLiveCollection<RunEvent>(runningPath && `${runningPath}/events`, "seq", 1);
  const lastEvent = lastEvents.at(-1);

  // The proposal waiting at its gate may hold claims with no source.
  const write = focusWrite(stages, now);
  const writePath = base && write?.runId ? `${base}/opportunities/${write.opportunityId}/runs/${write.runId}` : null;
  const writeRun = useLiveDoc<Run>(writePath, null).data;

  const approved = useApprovedTransition(stages);
  const typing = useAskTyping(active);
  const { pending } = useAsk();

  const input: CompanionInput = {
    now,
    stages,
    latestEvent: running?.runId && lastEvent ? { runId: running.runId, actor: lastEvent.actor.kind === "calc" ? "calc" : "ai", message: lastEvent.message } : null,
    unresolvedClaims: write?.runId && writeRun ? { runId: write.runId, count: unresolved(writeRun) } : null,
    proposals: proposals.filter((proposal) => proposal.status === "proposed"),
    askReading: Boolean(pending && !pending.error && !pending.id),
    typing,
    approved,
  };
  return { view: companionView(input), deals };
}

function toSignals(opportunities: Opportunity[]): StageSignal[] {
  return opportunities
    .filter((opp) => !opp.deletedAt)
    .flatMap((opp) =>
      STAGES.map((stage) => ({
        opportunityId: opp.id,
        prospect: opp.prospect?.name ?? "a new deal",
        stage,
        state: opp.stages[stage].state,
        runId: opp.stages[stage].currentRunId,
        updatedAt: opp.stages[stage].updatedAt,
      })),
    );
}

function unresolved(run: Run): number {
  const working = run.working as WriteOutput | null;
  return working?.claims?.filter((claim) => claim.support === "neither" && !claim.decision).length ?? 0;
}

/** A clock for the time windows, ticking every 2 seconds while the dog is shown. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** A stage this browser saw turn approved, for a few seconds of Happy. */
function useApprovedTransition(stages: StageSignal[]): CompanionInput["approved"] {
  const previous = useRef<Map<string, string> | null>(null);
  const [approved, setApproved] = useState<CompanionInput["approved"]>(null);
  useEffect(() => {
    const current = new Map(stages.map((signal) => [`${signal.opportunityId}/${signal.stage}`, signal.state]));
    const before = previous.current;
    previous.current = current;
    if (!before) return;
    const turned = stages.find((signal) => signal.state === "approved" && before.has(`${signal.opportunityId}/${signal.stage}`) && before.get(`${signal.opportunityId}/${signal.stage}`) !== "approved");
    if (turned) setApproved({ opportunityId: turned.opportunityId, stage: turned.stage, at: Date.now() });
  }, [stages]);
  return approved;
}

/** Typing in the Ask or tell box: a browser event, sent nowhere (FR-DOG-4). */
function useAskTyping(active: boolean): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const onInput = (event: Event) => {
      if ((event.target as HTMLElement | null)?.id !== "ask-input") return;
      setTyping(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTyping(false), TYPING_MS);
    };
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("input", onInput);
      window.clearTimeout(timer);
    };
  }, [active]);
  return typing;
}
