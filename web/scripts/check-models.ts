/**
 * Confirms the pinned models (src/server/ai/models.ts) are served for this
 * project and location, with one tiny call each:  npm run check-models
 * Needs GOOGLE_CLOUD_PROJECT and Application Default Credentials.
 */
import { GoogleGenAI } from "@google/genai";
import { MODEL_LOCATION, MODELS } from "../src/server/ai/models";

const project = process.env.GOOGLE_CLOUD_PROJECT;

async function main() {
  if (!project) {
    console.error("Set GOOGLE_CLOUD_PROJECT first.");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ vertexai: true, project, location: MODEL_LOCATION });
  let failed = false;
  for (const [tier, model] of Object.entries(MODELS)) {
    try {
      const res = await ai.models.generateContent({ model, contents: "Reply with the single word: ok" });
      console.log(`${tier.padEnd(5)} ${model}  OK  (${(res.text ?? "").trim().slice(0, 20)})`);
    } catch (err) {
      failed = true;
      console.error(`${tier.padEnd(5)} ${model}  FAILED  ${(err as Error).message.slice(0, 300)}`);
    }
  }
  if (failed) {
    console.error(`\nSome pinned models aren't served in "${MODEL_LOCATION}". Check the Agent Platform model list, then update src/server/ai/models.ts.`);
    process.exit(1);
  }
}

void main();
