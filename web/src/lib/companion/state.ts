import type { StageKey, StageState } from "@/lib/schema";

/**
 * The dog companion's state (PRD 7.31, ADR-0023 D3, D4). A pure function from
 * what FlowHub already writes: stage summaries, the running stage's latest
 * event, unresolved claims, proposals not yet applied, and two browser-only
 * signals (typing in Ask or tell, Ask or tell reading a message). The highest
 * state in PRIORITY wins. Words come only from an event's own message or the
 * fixed lines below, with a prospect's name and a stage's label filled in:
 * never a price, a claim about a prospect, or a figure of its own.
 */

export const COMPANION_STATES = ["worried", "flag", "wait", "think", "count", "happy", "listen", "sleep"] as const;
export type CompanionState = (typeof COMPANION_STATES)[number];

/** Who did it, as the who-did-what markers say (ADR-0009 D4). */
export type CompanionMarker = "ai" | "calc" | "person";

export const STAGE_LABEL: Record<StageKey, string> = {
  intake: "Intake",
  research: "Research",
  fit: "Fit and pricing",
  write: "The proposal",
};

/** How recent a stage's state must be to count. Older ones stay on their own pages and in the nav counts. */
export const WINDOWS = {
  failed: 60 * 60 * 1000,
  waiting: 12 * 60 * 60 * 1000,
  running: 30 * 60 * 1000,
  proposal: 12 * 60 * 60 * 1000,
  approved: 6 * 1000,
} as const;

export type StageSignal = {
  opportunityId: string;
  prospect: string;
  stage: StageKey;
  state: StageState;
  runId: string | null;
  updatedAt: string;
};

export type CompanionInput = {
  now: number;
  stages: StageSignal[];
  /** The latest event of the running stage the companion follows (`focusRunning`). */
  latestEvent: { runId: string; actor: "ai" | "calc"; message: string } | null;
  /** Claims marked Neither and not yet decided, in the write run waiting at its gate (`focusWrite`). */
  unresolvedClaims: { runId: string; count: number } | null;
  /** Proposals still `proposed`. */
  proposals: { createdAt: string }[];
  askReading: boolean;
  typing: boolean;
  /** A stage this browser saw turn approved. */
  approved: { opportunityId: string; stage: StageKey; at: number } | null;
};

export type CompanionView = {
  state: CompanionState;
  line: string | null;
  marker: CompanionMarker | null;
  /** The deal the dog is reacting to, if any. */
  focus: { opportunityId: string; prospect: string } | null;
  /** Things waiting on a person: the badge. */
  attention: number;
  /** Proposals waiting to be applied, for the panel's Ask or tell button. */
  proposals: number;
  /** Only states that need a person are announced to screen readers (D6). */
  announce: boolean;
};

const STAGE_ORDER: StageKey[] = ["intake", "research", "fit", "write"];

function age(now: number, iso: string): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : now - at;
}

function newest(signals: StageSignal[]): StageSignal | null {
  let best: StageSignal | null = null;
  for (const signal of signals) {
    if (!best || Date.parse(signal.updatedAt) > Date.parse(best.updatedAt) || (signal.updatedAt === best.updatedAt && STAGE_ORDER.indexOf(signal.stage) > STAGE_ORDER.indexOf(best.stage))) best = signal;
  }
  return best;
}

function recent(input: CompanionInput, state: StageState, window: number): StageSignal[] {
  return input.stages.filter((signal) => signal.state === state && age(input.now, signal.updatedAt) <= window);
}

/** The running stage to follow: its events give Thinking or Counting. */
export function focusRunning(stages: StageSignal[], now: number): StageSignal | null {
  return newest(stages.filter((signal) => signal.state === "running" && signal.runId && age(now, signal.updatedAt) <= WINDOWS.running));
}

/** The write run waiting at its gate, whose claims may be flagged. */
export function focusWrite(stages: StageSignal[], now: number): StageSignal | null {
  return newest(stages.filter((signal) => signal.stage === "write" && signal.state === "waiting" && signal.runId && age(now, signal.updatedAt) <= WINDOWS.waiting));
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function companionView(input: CompanionInput): CompanionView {
  const failed = recent(input, "failed", WINDOWS.failed);
  const waiting = recent(input, "waiting", WINDOWS.waiting);
  const proposals = input.proposals.filter((proposal) => age(input.now, proposal.createdAt) <= WINDOWS.proposal).length;
  const attention = failed.length + waiting.length + (proposals > 0 ? 1 : 0);
  const base = { attention, proposals };
  const focusOf = (signal: StageSignal) => ({ opportunityId: signal.opportunityId, prospect: signal.prospect });

  const stopped = newest(failed);
  if (stopped) {
    return { ...base, state: "worried", line: `${STAGE_LABEL[stopped.stage]} for ${stopped.prospect} stopped. Open the deal to see why.`, marker: null, focus: focusOf(stopped), announce: true };
  }

  const write = focusWrite(input.stages, input.now);
  const claims = input.unresolvedClaims;
  if (write && claims && claims.runId === write.runId && claims.count > 0) {
    const line = `${claims.count} ${plural(claims.count, "claim", "claims")} in the proposal for ${write.prospect} ${plural(claims.count, "has", "have")} no source. Have a look?`;
    return { ...base, state: "flag", line, marker: null, focus: focusOf(write), announce: true };
  }

  const gate = newest(waiting);
  if (gate) {
    return { ...base, state: "wait", line: `${STAGE_LABEL[gate.stage]} for ${gate.prospect} is waiting for you.`, marker: "person", focus: focusOf(gate), announce: true };
  }
  if (proposals > 0) {
    return { ...base, state: "wait", line: `${proposals} ${plural(proposals, "change is", "changes are")} waiting to be applied in Ask or tell.`, marker: "person", focus: null, announce: true };
  }

  const running = focusRunning(input.stages, input.now);
  if (running) {
    const event = input.latestEvent && input.latestEvent.runId === running.runId ? input.latestEvent : null;
    const actor = event?.actor ?? "ai";
    const line = event?.message.trim() || `${STAGE_LABEL[running.stage]} for ${running.prospect} is starting.`;
    return { ...base, state: actor === "calc" ? "count" : "think", line, marker: actor, focus: focusOf(running), announce: false };
  }
  if (input.askReading) {
    return { ...base, state: "think", line: "Ask or tell is reading your message.", marker: "ai", focus: null, announce: false };
  }

  const approved = input.approved && input.now - input.approved.at <= WINDOWS.approved ? input.approved : null;
  if (approved) {
    const prospect = input.stages.find((signal) => signal.opportunityId === approved.opportunityId)?.prospect ?? "this deal";
    return { ...base, state: "happy", line: `${STAGE_LABEL[approved.stage]} for ${prospect} approved.`, marker: "person", focus: { opportunityId: approved.opportunityId, prospect }, announce: false };
  }

  if (input.typing) return { ...base, state: "listen", line: null, marker: null, focus: null, announce: false };
  return { ...base, state: "sleep", line: null, marker: null, focus: null, announce: false };
}
