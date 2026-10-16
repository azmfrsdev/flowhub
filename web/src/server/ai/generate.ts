import "server-only";
import { type Content, type GenerateContentResponse, type GroundingMetadata, ThinkingLevel, type Tool } from "@google/genai";
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
    const started = Date.now();
    const response = await genai().models.generateContent({ model: MODELS[options.tier], contents, config });
    debug(`${options.tier} attempt ${attempt + 1}: ${Date.now() - started} ms, ${response.usageMetadata?.promptTokenCount ?? "?"} in, ${response.usageMetadata?.candidatesTokenCount ?? "?"} out`);
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
    const response = await genai().models.generateContent({
      model: MODELS[options.tier],
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
  const response = await genai().models.generateContent({
    model: MODELS[options.tier],
    contents: toContents(options.prompt),
    config: { systemInstruction: options.system, tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: LEVEL[options.thinking ?? "low"] } },
  });
  track(options.usage, response);
  const candidate = response.candidates?.[0];
  return { parts: (candidate?.content?.parts ?? []).map((part) => (part.thought ? "" : (part.text ?? ""))), metadata: candidate?.groundingMetadata };
}
