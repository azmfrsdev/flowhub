/**
 * The only place model names live (ADR-0010 D3). Plain constants, so scripts
 * such as check-models can import them too.
 *
 * Checked on 2026-10-14 by calling each model from flowhub-cup26 (npm run check-models):
 *  - Gemini 3.8 Flash, `gemini-3.8-flash`, GA since 2026-09-02. Served on `global`.
 *  - Gemini 4 Argon, `gemini-4-argon`, GA since 2026-10-13: the newest GA Pro-tier
 *    model. Served on `global` (not asia-southeast1). Google Search grounding and
 *    structured output both work. It ignores temperature, top_p and top_k, and takes
 *    `thinkingLevel` (LOW, MEDIUM default, HIGH), not `thinkingBudget`, which errors.
 *    Launch pricing runs to 2026-11-30, then rises.
 *  - Fallback if Argon misbehaves: `gemini-3.1-pro-preview` (preview, also on `global`).
 *    There is no Gemini 3.5 Pro ID.
 */
export const MODELS = {
  /** Intake, extraction, Ask or tell, grounded research sections, Pricing selection. */
  flash: "gemini-3.8-flash",
  /** Research inferences, Fit Analyst, Writer, Reviewer. */
  pro: "gemini-4-argon",
} as const;

export type ModelTier = keyof typeof MODELS;

/** Where the models are served. Both pinned models need `global`. */
export const MODEL_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
