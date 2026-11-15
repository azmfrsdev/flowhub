import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type CompanionInput, type StageSignal, WINDOWS, companionView, focusRunning, focusWrite } from "./state";

const NOW = Date.parse("2026-11-15T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;

function stage(partial: Partial<StageSignal>): StageSignal {
  return { opportunityId: "opp_1", prospect: "Bina Logistik", stage: "research", state: "idle", runId: null, updatedAt: ago(MIN), ...partial };
}

function input(partial: Partial<CompanionInput> = {}): CompanionInput {
  return { now: NOW, stages: [], latestEvent: null, unresolvedClaims: null, proposals: [], askReading: false, typing: false, approved: null, ...partial };
}

describe("companionView (PRD FR-DOG-3)", () => {
  it("sleeps when nothing is going on", () => {
    expect(companionView(input())).toMatchObject({ state: "sleep", line: null, attention: 0, announce: false });
  });

  it("listens while the person types in Ask or tell", () => {
    expect(companionView(input({ typing: true }))).toMatchObject({ state: "listen", line: null });
  });

  it("thinks on an ai step and repeats the event's own message", () => {
    const view = companionView(
      input({
        stages: [stage({ state: "running", runId: "run_r" })],
        latestEvent: { runId: "run_r", actor: "ai", message: "Searching for recent news" },
      }),
    );
    expect(view).toMatchObject({ state: "think", line: "Searching for recent news", marker: "ai", focus: { opportunityId: "opp_1" } });
  });

  it("counts on a calc step", () => {
    const view = companionView(
      input({
        stages: [stage({ stage: "fit", state: "running", runId: "run_f" })],
        latestEvent: { runId: "run_f", actor: "calc", message: "Copying prices from the rate cards" },
      }),
    );
    expect(view).toMatchObject({ state: "count", marker: "calc", line: "Copying prices from the rate cards" });
  });

  it("ignores an event from another run, and says the stage is starting", () => {
    const view = companionView(input({ stages: [stage({ state: "running", runId: "run_r" })], latestEvent: { runId: "run_old", actor: "calc", message: "Old" } }));
    expect(view).toMatchObject({ state: "think", line: "Research for Bina Logistik is starting.", marker: "ai" });
  });

  it("thinks while Ask or tell reads a message", () => {
    expect(companionView(input({ askReading: true, typing: true }))).toMatchObject({ state: "think", line: "Ask or tell is reading your message." });
  });

  it("waits at a gate, with the badge and an announcement", () => {
    const view = companionView(input({ stages: [stage({ state: "waiting", runId: "run_r" })] }));
    expect(view).toMatchObject({ state: "wait", line: "Research for Bina Logistik is waiting for you.", marker: "person", attention: 1, announce: true });
  });

  it("waits for proposals to be applied", () => {
    const view = companionView(input({ proposals: [{ createdAt: ago(MIN) }, { createdAt: ago(2 * MIN) }] }));
    expect(view).toMatchObject({ state: "wait", line: "2 changes are waiting to be applied in Ask or tell.", proposals: 2, attention: 1 });
  });

  it("flags unsupported claims in the waiting proposal", () => {
    const view = companionView(
      input({
        stages: [stage({ stage: "write", state: "waiting", runId: "run_w" })],
        unresolvedClaims: { runId: "run_w", count: 1 },
      }),
    );
    expect(view).toMatchObject({ state: "flag", line: "1 claim in the proposal for Bina Logistik has no source. Have a look?", announce: true });
  });

  it("doesn't flag claims counted on another run", () => {
    const view = companionView(input({ stages: [stage({ stage: "write", state: "waiting", runId: "run_w" })], unresolvedClaims: { runId: "run_old", count: 3 } }));
    expect(view.state).toBe("wait");
  });

  it("is worried when a stage failed", () => {
    const view = companionView(input({ stages: [stage({ state: "failed", runId: "run_r" })] }));
    expect(view).toMatchObject({ state: "worried", line: "Research for Bina Logistik stopped. Open the deal to see why.", attention: 1, announce: true });
  });

  it("is happy for a few seconds after a stage is approved", () => {
    const approved = { opportunityId: "opp_1", stage: "research" as const, at: NOW - 2000 };
    expect(companionView(input({ stages: [stage({ state: "approved" })], approved }))).toMatchObject({ state: "happy", line: "Research for Bina Logistik approved." });
    expect(companionView(input({ stages: [stage({ state: "approved" })], approved: { ...approved, at: NOW - WINDOWS.approved - 1 } })).state).toBe("sleep");
  });

  it("follows the priority order when several apply", () => {
    const failed = stage({ opportunityId: "opp_a", state: "failed", runId: "a" });
    const write = stage({ opportunityId: "opp_b", stage: "write", state: "waiting", runId: "w" });
    const gate = stage({ opportunityId: "opp_c", state: "waiting", runId: "c" });
    const running = stage({ opportunityId: "opp_d", state: "running", runId: "d" });
    const all: Partial<CompanionInput> = {
      stages: [failed, write, gate, running],
      unresolvedClaims: { runId: "w", count: 2 },
      latestEvent: { runId: "d", actor: "ai", message: "Reading" },
      proposals: [{ createdAt: ago(MIN) }],
      askReading: true,
      typing: true,
      approved: { opportunityId: "opp_d", stage: "intake", at: NOW },
    };
    expect(companionView(input(all)).state).toBe("worried");
    expect(companionView(input({ ...all, stages: [write, gate, running] })).state).toBe("flag");
    expect(companionView(input({ ...all, stages: [gate, running] })).state).toBe("wait");
    expect(companionView(input({ ...all, stages: [running], proposals: [] })).state).toBe("think");
    expect(companionView(input({ ...all, stages: [], proposals: [] })).state).toBe("think");
    expect(companionView(input({ ...all, stages: [stage({ opportunityId: "opp_d", state: "approved" })], proposals: [], askReading: false })).state).toBe("happy");
    expect(companionView(input({ typing: true })).state).toBe("listen");
  });

  it("counts every thing waiting on a person in the badge", () => {
    const view = companionView(
      input({
        stages: [stage({ opportunityId: "a", state: "failed" }), stage({ opportunityId: "b", state: "waiting" }), stage({ opportunityId: "c", state: "waiting", stage: "fit" })],
        proposals: [{ createdAt: ago(MIN) }],
      }),
    );
    expect(view.attention).toBe(4);
  });

  it("leaves old failures, gates, runs and proposals to their own pages", () => {
    const view = companionView(
      input({
        stages: [
          stage({ opportunityId: "a", state: "failed", updatedAt: ago(WINDOWS.failed + MIN) }),
          stage({ opportunityId: "b", state: "waiting", updatedAt: ago(WINDOWS.waiting + MIN) }),
          stage({ opportunityId: "c", state: "running", runId: "c", updatedAt: ago(WINDOWS.running + MIN) }),
        ],
        proposals: [{ createdAt: ago(WINDOWS.proposal + MIN) }],
      }),
    );
    expect(view).toMatchObject({ state: "sleep", attention: 0 });
  });
});

describe("focusRunning and focusWrite", () => {
  it("pick the most recently updated stage", () => {
    const stages = [
      stage({ opportunityId: "old", state: "running", runId: "r1", updatedAt: ago(10 * MIN) }),
      stage({ opportunityId: "new", state: "running", runId: "r2", updatedAt: ago(MIN) }),
      stage({ opportunityId: "w", stage: "write", state: "waiting", runId: "w1", updatedAt: ago(MIN) }),
    ];
    expect(focusRunning(stages, NOW)?.runId).toBe("r2");
    expect(focusWrite(stages, NOW)?.runId).toBe("w1");
  });
});

describe("fixed lines (PRD FR-DOG-5)", () => {
  const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../fixtures/price-strings.json"), "utf8")) as { cases: { text: string }[] };

  it("never carry a price or a currency", () => {
    const scenarios: Partial<CompanionInput>[] = [
      { stages: [stage({ state: "failed" })] },
      { stages: [stage({ stage: "write", state: "waiting", runId: "w" })], unresolvedClaims: { runId: "w", count: 2 } },
      { stages: [stage({ state: "waiting" })] },
      { proposals: [{ createdAt: ago(MIN) }] },
      { stages: [stage({ state: "running", runId: "r" })] },
      { askReading: true },
      { stages: [stage({ state: "approved" })], approved: { opportunityId: "opp_1", stage: "fit", at: NOW } },
    ];
    for (const scenario of scenarios) {
      const line = companionView(input(scenario)).line ?? "";
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(/\bRM\b|MYR|USD|\$|%/);
      for (const { text } of fixture.cases) expect(line).not.toContain(text);
    }
  });
});
