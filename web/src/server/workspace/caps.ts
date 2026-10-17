/** FR-CAP-1: per-workspace daily caps, counted in Malaysia time and shared by all members. */
export const CAPS = { stageRuns: 60, researchRuns: 20, uploads: 20, askRuns: 60 } as const;

/**
 * FR-CAP-3 (PRD Q29): a daily ceiling across every workspace. A workspace's own
 * cap doesn't bound total spend: anyone with a Google account can sign in, and
 * a new sample workspace starts a fresh count. The ceiling keeps the trial
 * credit, and so the live demo, from running out.
 */
export const GLOBAL_CAPS = { stageRuns: 1500, researchRuns: 400 } as const;

/** `globalUsage/{yyyy-mm-dd}`: the day's count across every workspace. Server only (security rules deny it). */
export const globalUsagePath = (day: string) => `globalUsage/${day}`;

type Counts = { stageRuns: number; researchRuns: number };

/** Why a run can't start today, or null. The ceiling across all workspaces is checked first. */
export function capReached(workspace: Counts, global: Counts, research: boolean): string | null {
  if (global.stageRuns >= GLOBAL_CAPS.stageRuns || (research && global.researchRuns >= GLOBAL_CAPS.researchRuns))
    return "FlowHub has reached today's limit for all users together. It resets at midnight, Malaysia time.";
  if (workspace.stageRuns >= CAPS.stageRuns) return `Today's limit of ${CAPS.stageRuns} AI runs is used up. It resets at midnight, Malaysia time.`;
  if (research && workspace.researchRuns >= CAPS.researchRuns) return `Today's limit of ${CAPS.researchRuns} research runs is used up. It resets at midnight, Malaysia time.`;
  return null;
}
