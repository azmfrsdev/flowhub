import { ApiError } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelBusyError, ModelOutputError } from "@/server/ai/generate";
import { ScoutError } from "@/server/pipelines/scout";
import { scanToday } from "./actions";

const { printEdition, refresh } = vi.hoisted(() => ({ printEdition: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/firebase/admin", () => ({ db: vi.fn() }));
vi.mock("@/server/deal-room/runs", () => ({ StageError: class extends Error {}, startStage: vi.fn() }));
vi.mock("@/server/workspace/access", () => ({ requireRole: vi.fn(async () => ({ workspace: { id: "ws_1" }, user: { uid: "u_1", name: "Nadia" } })) }));
vi.mock("@/server/pipelines/scout", () => ({ ScoutError: class ScoutError extends Error {}, printEdition }));

beforeEach(() => {
  printEdition.mockReset();
  refresh.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("scanToday (FR-NEWS-8)", () => {
  it("shows a friendly message when Gemini stays busy, instead of the error page", async () => {
    printEdition.mockRejectedValue(new ModelBusyError("busy", { cause: new ApiError({ message: "Resource exhausted.", status: 429 }) }));
    await expect(scanToday()).resolves.toEqual({ error: "Gemini is busy right now. Try again in a minute." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says so when Gemini doesn't answer in time", async () => {
    printEdition.mockRejectedValue(new ModelBusyError("timeout"));
    await expect(scanToday()).resolves.toEqual({ error: "Gemini took too long to answer. Try again in a minute." });
  });

  it("passes the scout's own reasons through, such as the daily cap", async () => {
    printEdition.mockRejectedValue(new ScoutError("Today's limit of 60 AI runs is used up. It resets at midnight, Malaysia time."));
    await expect(scanToday()).resolves.toEqual({ error: "Today's limit of 60 AI runs is used up. It resets at midnight, Malaysia time." });
  });

  it("turns an answer with the wrong shape, or anything unexpected, into a message too", async () => {
    printEdition.mockRejectedValueOnce(new ModelOutputError("bad shape"));
    await expect(scanToday()).resolves.toEqual({ error: "Gemini's answer didn't have the expected shape. Try again." });
    printEdition.mockRejectedValueOnce(new Error("Firestore unavailable"));
    await expect(scanToday()).resolves.toEqual({ error: "The scan didn't finish. Try again in a minute." });
    expect(console.error).toHaveBeenCalledWith("News scan failed:", expect.any(Error));
  });

  it("refreshes the page after a scan that worked", async () => {
    printEdition.mockResolvedValue({});
    await expect(scanToday()).resolves.toEqual({});
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
