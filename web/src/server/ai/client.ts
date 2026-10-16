import "server-only";
import { GoogleGenAI } from "@google/genai";
import { MODEL_LOCATION } from "./models";

/**
 * Gemini through the Gen AI SDK on Agent Platform (ADR-0010 D3).
 * Credentials come from Application Default Credentials: the Cloud Run
 * service identity when deployed, `gcloud auth application-default login`
 * locally. No API keys.
 */
let client: GoogleGenAI | null = null;

export function genai(): GoogleGenAI {
  if (!client) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set.");
    client = new GoogleGenAI({ vertexai: true, project, location: MODEL_LOCATION });
  }
  return client;
}
