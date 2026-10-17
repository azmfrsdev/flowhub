import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ModelBusyError, type RetryNotice, converseWithTools, generateGrounded, generateJson, newUsage, withModelScope } from "./generate";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ genai: () => ({ models: { generateContent } }) }));

const apiError = (status: number) => new ApiError({ message: JSON.stringify({ error: { code: status, message: "Resource exhausted. Please try again later.", status: "RESOURCE_EXHAUSTED" } }), status });
const reply = (text: string) => ({ text, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, candidates: [{ content: { role: "model", parts: [{ text }] } }] });
const ok = reply('{"ok":true}');

type Request = { config: { abortSignal: AbortSignal } };
/** A call that never answers until it is aborted, like the Pricing call that hung on 2026-10-17. */
const hang = (request: Request) => new Promise((_, reject) => request.config.abortSignal.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError"))));
const signalOf = (call: number) => (generateContent.mock.calls[call][0] as Request).config.abortSignal;

const Answer = z.object({ ok: z.boolean() });
const json = (options: { tier?: "flash" | "pro"; timeoutMs?: number } = {}) => generateJson({ tier: options.tier ?? "flash", system: "Answer.", prompt: "Answer.", schema: Answer, timeoutMs: options.timeoutMs });

/** Lets a call settle while fake timers run, without an unhandled rejection. */
const settle = <T>(promise: Promise<T>) => promise.then((value) => ({ value }), (error: unknown) => ({ error }));
async function failure(promise: Promise<{ value?: unknown; error?: unknown }>): Promise<unknown> {
  const outcome = await promise;
  expect(outcome).toHaveProperty("error");
  return outcome.error;
}

beforeEach(() => {
  vi.useFakeTimers();
  // No jitter, so the delays are exactly 2, 4, 8 and 16 s.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  generateContent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("retries on a busy or failing Gemini", () => {
  it("backs off exponentially on 429, then returns the answer", async () => {
    generateContent.mockRejectedValueOnce(apiError(429)).mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(ok);
    const usage = newUsage();
    const result = settle(generateJson({ tier: "flash", system: "Answer.", prompt: "Answer.", schema: Answer, usage }));

    await vi.advanceTimersByTimeAsync(1_999);
    expect(generateContent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(generateContent).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(generateContent).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(generateContent).toHaveBeenCalledTimes(3);

    expect(await result).toEqual({ value: { ok: true } });
    expect(usage.calls).toBe(1);
    expect(console.warn).toHaveBeenCalledWith("[ai] flash attempt 1 of 5 failed (429); trying again in 2 s.");
    expect(console.warn).toHaveBeenCalledWith("[ai] flash attempt 2 of 5 failed (429); trying again in 4 s.");
  });

  it("spreads each delay between 50% and 150% of the backoff, so parallel calls don't retry in step", async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0);
    generateContent.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(ok);
    const early = settle(json());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await early).toEqual({ value: { ok: true } });

    vi.mocked(Math.random).mockReturnValueOnce(0.999);
    generateContent.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(ok);
    const late = settle(json());
    await vi.advanceTimersByTimeAsync(2_996);
    expect(generateContent).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2);
    expect(await late).toEqual({ value: { ok: true } });
  });

  it.each([408, 500, 502, 503, 504])("retries a %i", async (status) => {
    generateContent.mockRejectedValueOnce(apiError(status)).mockResolvedValueOnce(ok);
    const result = settle(json());
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toEqual({ value: { ok: true } });
  });

  it("retries a dropped connection", async () => {
    const reset = new TypeError("fetch failed", { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
    generateContent.mockRejectedValueOnce(reset).mockResolvedValueOnce(ok);
    const result = settle(json());
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toEqual({ value: { ok: true } });
    expect(console.warn).toHaveBeenCalledWith("[ai] flash attempt 1 of 5 failed (network); trying again in 2 s.");
  });

  it("gives up after five attempts with an error that is safe to show", async () => {
    generateContent.mockRejectedValue(apiError(429));
    const result = settle(json({ tier: "pro" }));
    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 16_000);

    const error = await failure(result);
    expect(generateContent).toHaveBeenCalledTimes(5);
    expect(error).toBeInstanceOf(ModelBusyError);
    expect(error).toMatchObject({ reason: "busy", message: "Gemini is busy right now. Try again in a minute." });
    expect((error as Error).cause).toBeInstanceOf(ApiError);
    expect(console.warn).toHaveBeenLastCalledWith("[ai] pro attempt 5 of 5 failed (429); giving up.");
  });

  it.each([400, 403, 404])("doesn't retry a %i, which another attempt won't fix", async (status) => {
    const refused = apiError(status);
    generateContent.mockRejectedValue(refused);
    await expect(json()).rejects.toBe(refused);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("goes through the wrapper for grounded calls and tool calls too", async () => {
    generateContent.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(reply("A sourced fact."));
    const grounded = settle(generateGrounded({ tier: "flash", system: "Search.", prompt: "Search." }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await grounded).toEqual({ value: { parts: ["A sourced fact."], metadata: undefined } });

    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(reply("No tool needed."));
    const conversation = settle(converseWithTools({ tier: "flash", system: "Price it.", prompt: "Price it.", tools: {} }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await conversation).toMatchObject({ value: [{ role: "user" }, { role: "model", parts: [{ text: "No tool needed." }] }] });
    expect(generateContent).toHaveBeenCalledTimes(4);
  });
});

describe("timeouts", () => {
  it("cuts off an attempt with no answer in 2 minutes (Flash) and tries again", async () => {
    generateContent.mockImplementationOnce(hang).mockResolvedValueOnce(ok);
    const result = settle(json());

    await vi.advanceTimersByTimeAsync(119_999);
    expect(signalOf(0).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signalOf(0).aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await result).toEqual({ value: { ok: true } });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith("[ai] flash attempt 1 of 5 failed (no answer within 120 s); trying again in 2 s.");
  });

  it("stops waiting even if the SDK ignores the abort", async () => {
    generateContent.mockImplementationOnce(() => new Promise(() => undefined)).mockResolvedValueOnce(ok);
    const result = settle(json());
    await vi.advanceTimersByTimeAsync(120_000 + 2_000);
    expect(await result).toEqual({ value: { ok: true } });
  });

  it("gives Pro 3 minutes, and doesn't try a third time after two hangs", async () => {
    generateContent.mockImplementation(hang);
    const result = settle(json({ tier: "pro" }));
    await vi.advanceTimersByTimeAsync(179_999);
    expect(signalOf(0).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1 + 2_000 + 180_000 + 60_000);

    const error = await failure(result);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(ModelBusyError);
    expect(error).toMatchObject({ reason: "timeout", message: "Gemini took too long to answer. Try again in a minute." });
  });

  it("lets a call set a longer timeout, such as reading a long scan", async () => {
    generateContent.mockImplementationOnce(hang).mockResolvedValueOnce(ok);
    const result = settle(json({ timeoutMs: 240_000 }));
    await vi.advanceTimersByTimeAsync(239_999);
    expect(signalOf(0).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1 + 2_000);
    expect(await result).toEqual({ value: { ok: true } });
  });
});

describe("withModelScope", () => {
  it("tells the scope about each retry, with a message for the deal room", async () => {
    const notices: RetryNotice[] = [];
    generateContent.mockRejectedValueOnce(apiError(429)).mockImplementationOnce(hang).mockResolvedValueOnce(ok);
    const result = settle(withModelScope({ onRetry: (notice) => notices.push(notice) }, () => json()));
    await vi.advanceTimersByTimeAsync(2_000 + 120_000 + 4_000);

    expect(await result).toEqual({ value: { ok: true } });
    expect(notices).toEqual([
      { tier: "flash", attempt: 1, reason: "busy", delayMs: 2_000, message: "Gemini is busy. Trying again in 2 s." },
      { tier: "flash", attempt: 2, reason: "timeout", delayMs: 4_000, message: "Gemini didn't answer within 120 s. Trying again in 4 s." },
    ]);
  });

  it("retries even when the notice can't be recorded", async () => {
    generateContent.mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce(ok);
    const result = settle(withModelScope({ onRetry: () => Promise.reject(new Error("Firestore is down")) }, () => json()));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toEqual({ value: { ok: true } });
  });

  it("starts no attempt that couldn't finish before the deadline", async () => {
    generateContent.mockRejectedValue(apiError(429));
    const result = settle(withModelScope({ deadline: Date.now() + 10_000 }, () => json()));
    await vi.advanceTimersByTimeAsync(0);

    expect(await failure(result)).toBeInstanceOf(ModelBusyError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("shortens an attempt to the time left before the deadline", async () => {
    generateContent.mockImplementation(hang);
    const result = settle(withModelScope({ deadline: Date.now() + 60_000 }, () => json()));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signalOf(0).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await failure(result)).toMatchObject({ reason: "timeout" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("keeps the earlier deadline and the outer hook when scopes nest", async () => {
    const notices: RetryNotice[] = [];
    generateContent.mockRejectedValueOnce(apiError(429)).mockRejectedValue(apiError(429));
    const result = settle(
      withModelScope({ deadline: Date.now() + 20_000, onRetry: (notice) => notices.push(notice) }, () => withModelScope({ deadline: Date.now() + 600_000 }, () => json())),
    );
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await failure(result)).toBeInstanceOf(ModelBusyError);
    // 2 s backoff leaves 18 s, enough for one more attempt; a 4 s backoff then wouldn't leave 15 s.
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(notices).toHaveLength(1);
  });
});
