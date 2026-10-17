import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { type Content, type GenerateContentConfig, type GenerateContentResponse, type GroundingMetadata, ThinkingLevel, type Tool } from "@google/genai";
import { z } from "zod";
import { genai } from "./client";
import { MODELS, type ModelTier } from "./models";

/**
 * The only way pipelines call Gemini (invariant 9, ADR-0010 D3). Every call
 * gets just its instruction and the inputs code passes in: no history
 * (ADR-0006, stateless stages). Thinking defaults to LOW: on 2026-10-15 a
 * Flash call took about 3 s at LOW against 19 s at the default.
 */

export type Thinking = "low" | "medium" | "high";
const LEVEL: Record<Thinking, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };

export type Usage = { inputTokens: number; outputTokens: number; groundedQueries: number; calls: number };
export const newUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, groundedQueries: 0, calls: 0 });

/** FLOWHUB_DEBUG_AI=1 logs each model call's time and tokens, never its content. */
const debug = (message: string) => {
  if (process.env.FLOWHUB_DEBUG_AI === "1") console.log(`[ai] ${message}`);
};

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export type Unavailable = "busy" | "timeout" | "network";

/** Gemini stayed busy, silent or unreachable through every retry. The message is safe to show. */
export class ModelBusyError extends Error {
  constructor(
    readonly reason: Unavailable,
    options?: { cause?: unknown },
  ) {
    super(reason === "timeout" ? "Gemini took too long to answer. Try again in a minute." : "Gemini is busy right now. Try again in a minute.", options);
    this.name = "ModelBusyError";
  }
}

/**
 * Retries. The pinned models are served on `global`, a shared quota that
 * answers 429 when it is busy; Google's advice is exponential backoff with
 * jitter. On 2026-10-17 the live app's stages failed on single 429s and 503s,
 * and a Pricing call hung for over 3 minutes. So every call goes through
 * `callModel`: 429, 408 and 5xx answers and dropped connections are tried
 * again after about 2, 4, 8 and 16 s (each 50% to 150% of that, so parallel
 * calls don't retry in step), and an attempt with no answer in time is cut off
 * and tried once more.
 */
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
/** Per attempt, unless a call sets its own. Pro calls write whole proposals, so they get the deal room's 3-minute stall limit. */
export const ATTEMPT_TIMEOUT_MS: Record<ModelTier, number> = { flash: 120_000, pro: 180_000 };
/** A call that hangs twice isn't tried a third time. */
const MAX_TIMEOUTS = 2;
/** No attempt starts with less time than this before the scope's deadline. */
const MIN_ATTEMPT_MS = 15_000;
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

export type RetryNotice = { tier: ModelTier; attempt: number; reason: Unavailable; delayMs: number; message: string };
type ModelScope = { deadline?: number; onRetry?: (notice: RetryNotice) => unknown };
const scope = new AsyncLocalStorage<ModelScope>();

/**
 * Runs `fn` with a deadline for model retries (epoch ms) and a hook told about
 * each retry: the stage runner records retries as progress events, so the
 * deal room shows them and doesn't read a retry as a stall. Scopes nest: the
 * earlier deadline wins, and an inner hook replaces an outer one.
 */
export function withModelScope<T>(options: ModelScope, fn: () => Promise<T>): Promise<T> {
  const outer = scope.getStore();
  const deadline = Math.min(outer?.deadline ?? Infinity, options.deadline ?? Infinity);
  return scope.run({ deadline, onRetry: options.onRetry ?? outer?.onRetry }, fn);
}

class AttemptTimeout extends Error {}

/** Why an error is worth another attempt, or null. */
function unavailable(err: unknown): Unavailable | null {
  if (err instanceof AttemptTimeout) return "timeout";
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return RETRY_STATUS.has(status) ? "busy" : null;
  for (let cause = err, depth = 0; cause && typeof cause === "object" && depth < 4; cause = (cause as { cause?: unknown }).cause, depth += 1) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && NETWORK_CODES.has(code)) return "network";
  }
  // Node's fetch reports a dropped socket as TypeError("fetch failed").
  return err instanceof TypeError && err.message === "fetch failed" ? "network" : null;
}

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

function retryMessage(reason: Unavailable, timeoutMs: number, delayMs: number): string {
  const what = reason === "timeout" ? `Gemini didn't answer within ${seconds(timeoutMs)}` : reason === "network" ? "The connection to Gemini dropped" : "Gemini is busy";
  return `${what}. Trying again in ${seconds(delayMs)}.`;
}

type ModelRequest = { contents: Content[]; config: GenerateContentConfig };

/** One attempt, given up after `timeoutMs` even if the SDK doesn't stop on the abort. */
async function attemptOnce(tier: ModelTier, request: ModelRequest, timeoutMs: number): Promise<GenerateContentResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AttemptTimeout(`No answer within ${timeoutMs} ms`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([genai().models.generateContent({ model: MODELS[tier], contents: request.contents, config: { ...request.config, abortSignal: controller.signal } }), timedOut]);
  } catch (err) {
    // Only the timer aborts, so whatever the SDK threw after that, the attempt timed out.
    throw controller.signal.aborted ? new AttemptTimeout(`No answer within ${timeoutMs} ms`, { cause: err }) : err;
  } finally {
    clearTimeout(timer);
  }
}

/** Every Gemini call goes through here: retries with backoff and jitter, and a timeout per attempt. */
async function callModel(tier: ModelTier, request: ModelRequest, attemptTimeoutMs = ATTEMPT_TIMEOUT_MS[tier]): Promise<GenerateContentResponse> {
  const { deadline = Infinity, onRetry } = scope.getStore() ?? {};
  let timeouts = 0;
  for (let attempt = 1; ; attempt += 1) {
    const timeoutMs = Math.max(MIN_ATTEMPT_MS, Math.min(attemptTimeoutMs, deadline - Date.now()));
    const started = Date.now();
    try {
      const response = await attemptOnce(tier, request, timeoutMs);
      debug(`${tier} attempt ${attempt}: ${Date.now() - started} ms, ${response.usageMetadata?.promptTokenCount ?? "?"} in, ${response.usageMetadata?.candidatesTokenCount ?? "?"} out`);
      return response;
    } catch (err) {
      const reason = unavailable(err);
      if (!reason) throw err;
      if (reason === "timeout") timeouts += 1;
      const base = BACKOFF_MS[attempt - 1];
      const delayMs = base === undefined ? 0 : Math.round(base * (0.5 + Math.random()));
      const status = (err as { status?: unknown }).status;
      const detail = reason === "timeout" ? `no answer within ${seconds(timeoutMs)}` : typeof status === "number" ? String(status) : reason;
      if (base === undefined || timeouts >= MAX_TIMEOUTS || Date.now() + delayMs + MIN_ATTEMPT_MS > deadline) {
        console.warn(`[ai] ${tier} attempt ${attempt} of ${MAX_ATTEMPTS} failed (${detail}); giving up.`);
        throw new ModelBusyError(reason, { cause: err });
      }
      console.warn(`[ai] ${tier} attempt ${attempt} of ${MAX_ATTEMPTS} failed (${detail}); trying again in ${seconds(delayMs)}.`);
      try {
        await onRetry?.({ tier, attempt, reason, delayMs, message: retryMessage(reason, timeoutMs, delayMs) });
      } catch {
        // A notice that can't be recorded doesn't stop the retry.
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function track(usage: Usage | undefined, response: GenerateContentResponse) {
  if (!usage) return;
  usage.calls += 1;
  usage.inputTokens += response.usageMetadata?.promptTokenCount ?? 0;
  usage.outputTokens += (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0);
  usage.groundedQueries += response.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length ?? 0;
}

function toContents(prompt: string | Content[]): Content[] {
  return typeof prompt === "string" ? [{ role: "user", parts: [{ text: prompt }] }] : prompt;
}

/** Array-size keywords Gemini rejects in larger schemas (400 INVALID_ARGUMENT, found 2026-10-15). Zod still enforces them on the answer. */
const UNSUPPORTED = new Set(["maxItems", "minItems"]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node).filter(([key]) => !UNSUPPORTED.has(key)).map(([key, value]) => [key, strip(value)]));
}

/** JSON Schema for Gemini's structured output, from the same Zod schema the result is validated with (ADR-0010 D4). */
export function jsonSchemaFor(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  return strip(json);
}

/**
 * Structured output, validated with Zod. One corrective retry with the
 * validation error; after that the step fails visibly rather than guessing.
 */
export async function generateJson<T>(options: {
  tier: ModelTier;
  system: string;
  prompt: string | Content[];
  schema: z.ZodType<T>;
  thinking?: Thinking;
  tools?: Tool[];
  usage?: Usage;
  /** Per attempt, for calls that can be slow when healthy, such as transcribing a long scan. Defaults to the tier's. */
  timeoutMs?: number;
}): Promise<T> {
  const contents = toContents(options.prompt);
  const config = {
    systemInstruction: options.system,
    responseMimeType: "application/json",
    responseJsonSchema: jsonSchemaFor(options.schema),
    thinkingConfig: { thinkingLevel: LEVEL[options.thinking ?? "low"] },
    ...(options.tools ? { tools: options.tools } : {}),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callModel(options.tier, { contents, config }, options.timeoutMs);
    track(options.usage, response);
    const text = response.text ?? "";
    let problem: string;
    try {
      const parsed = options.schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    } catch {
      problem = "The answer was not valid JSON.";
    }
    debug(`${options.tier} answer didn't match the schema: ${problem}`);
    contents.push({ role: "model", parts: [{ text }] }, { role: "user", parts: [{ text: `That didn't match the required schema (${problem}). Answer again with valid JSON only.` }] });
  }
  throw new ModelOutputError("The model's answer didn't match the expected shape twice in a row.");
}

export type ToolHandler = { description: string; parameters: Record<string, unknown>; handler: (args: Record<string, unknown>) => unknown };

/**
 * Function calling (invariant 1: prices are read through tools). Lets the
 * model call the given tools for up to `rounds` turns, executing each call in
 * code, and returns the conversation for a final structured call. Tools and
 * structured output are kept in separate calls: on 2026-10-15, combining them
 * returned an empty answer after the first tool result.
 */
export async function converseWithTools(options: {
  tier: ModelTier;
  system: string;
  prompt: string;
  tools: Record<string, ToolHandler>;
  usage?: Usage;
  rounds?: number;
  onCall?: (name: string, args: Record<string, unknown>) => Promise<void> | void;
}): Promise<Content[]> {
  const contents = toContents(options.prompt);
  const declarations = Object.entries(options.tools).map(([name, tool]) => ({ name, description: tool.description, parametersJsonSchema: tool.parameters }));
  for (let round = 0; round < (options.rounds ?? 4); round += 1) {
    const response = await callModel(options.tier, {
      contents,
      config: { systemInstruction: options.system, tools: [{ functionDeclarations: declarations }], thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    track(options.usage, response);
    const calls = response.functionCalls ?? [];
    const content = response.candidates?.[0]?.content;
    if (content) contents.push(content);
    if (calls.length === 0) break;
    const responses = [];
    for (const call of calls) {
      const tool = call.name ? options.tools[call.name] : undefined;
      const args = (call.args ?? {}) as Record<string, unknown>;
      await options.onCall?.(call.name ?? "", args);
      responses.push({ functionResponse: { id: call.id, name: call.name, response: tool ? { result: tool.handler(args) } : { error: `No tool named ${call.name}` } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return contents;
}

/** A call grounded with Google Search. Returns the raw parts and metadata for claim cutting in code (ADR-0006 D2). */
export async function generateGrounded(options: { tier: ModelTier; system: string; prompt: string; thinking?: Thinking; usage?: Usage }): Promise<{
  parts: string[];
  metadata: GroundingMetadata | undefined;
}> {
  const response = await callModel(options.tier, {
    contents: toContents(options.prompt),
    config: { systemInstruction: options.system, tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: LEVEL[options.thinking ?? "low"] } },
  });
  track(options.usage, response);
  const candidate = response.candidates?.[0];
  return { parts: (candidate?.content?.parts ?? []).map((part) => (part.thought ? "" : (part.text ?? ""))), metadata: candidate?.groundingMetadata };
}
