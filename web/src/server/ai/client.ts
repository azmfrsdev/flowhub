import "server-only";
import { GoogleGenAI } from "@google/genai";
import { LIVE_LOCATION, MODEL_LOCATION } from "./models";

/**
 * Gemini through the Gen AI SDK on Agent Platform (ADR-0010 D3).
 * Credentials come from Application Default Credentials: the Cloud Run
 * service identity when deployed, `gcloud auth application-default login`
 * locally. No API keys.
 */
let client: GoogleGenAI | null = null;
let liveClient: GoogleGenAI | null = null;

/** The rehearsal relay's client: Gemini Live isn't served on `global`, so it has its own location (ADR-0017 D6). */
export function genaiLive(): GoogleGenAI {
  if (!liveClient) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set.");
    liveClient = new GoogleGenAI({ vertexai: true, project, location: LIVE_LOCATION });
  }
  return liveClient;
}

export function genai(): GoogleGenAI {
  if (!client) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set.");
    client = new GoogleGenAI({ vertexai: true, project, location: MODEL_LOCATION });
  }
  return client;
}
