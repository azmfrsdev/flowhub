/**
 * Confirms the pinned models (src/server/ai/models.ts) are served for this
 * project and location, with one tiny call each:  npm run check-models
 * Needs GOOGLE_CLOUD_PROJECT and Application Default Credentials.
 */
import { GoogleGenAI, Modality } from "@google/genai";
import { LIVE_LOCATION, LIVE_MODEL, LIVE_VOICE, MODEL_LOCATION, MODELS } from "../src/server/ai/models";

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
  }

  // ADR-0017 D6: the rehearsal voice model, on its own location. Opens a Live session and waits for setup.
  const live = new GoogleGenAI({ vertexai: true, project, location: LIVE_LOCATION });
  try {
    const session = await live.live.connect({
      model: LIVE_MODEL,
      config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE } } } },
      callbacks: { onmessage: () => {}, onerror: () => {}, onclose: () => {} },
    });
    session.close();
    console.log(`live  ${LIVE_MODEL}  OK  (${LIVE_LOCATION})`);
  } catch (err) {
    failed = true;
    console.error(`live  ${LIVE_MODEL}  FAILED in ${LIVE_LOCATION}  ${(err as Error).message.slice(0, 300)}`);
  }
  if (failed) process.exit(1);
}

void main();
