import { describe, expect, it } from "vitest";
import { CAPS, GLOBAL_CAPS, capReached } from "./caps";

const none = { stageRuns: 0, researchRuns: 0 };

describe("capReached (FR-CAP-1, FR-CAP-3)", () => {
  it("lets a run start under both caps", () => {
    expect(capReached({ stageRuns: CAPS.stageRuns - 1, researchRuns: CAPS.researchRuns - 1 }, none, true)).toBeNull();
  });
  it("stops a workspace at its own daily caps", () => {
    expect(capReached({ stageRuns: CAPS.stageRuns, researchRuns: 0 }, none, false)).toContain(`${CAPS.stageRuns} AI runs`);
    expect(capReached({ stageRuns: 1, researchRuns: CAPS.researchRuns }, none, true)).toContain(`${CAPS.researchRuns} research runs`);
    expect(capReached({ stageRuns: 1, researchRuns: CAPS.researchRuns }, none, false)).toBeNull();
  });
  it("stops every workspace at the ceiling across all of them, even a fresh one", () => {
    expect(capReached(none, { stageRuns: GLOBAL_CAPS.stageRuns, researchRuns: 0 }, false)).toContain("all users together");
    expect(capReached(none, { stageRuns: 0, researchRuns: GLOBAL_CAPS.researchRuns }, true)).toContain("all users together");
    expect(capReached(none, { stageRuns: 0, researchRuns: GLOBAL_CAPS.researchRuns }, false)).toBeNull();
  });
});
