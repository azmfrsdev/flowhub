import "server-only";
import { type App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Admin SDK: the only way FlowHub writes data (invariant 10, ADR-0005 D4).
 * Deployed, it uses the Cloud Run service identity. Locally and in tests, the
 * FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST variables point it at
 * the emulators, with a `demo-` project ID so nothing can reach a real project.
 *
 * FIREBASE_PROJECT_ID is separate from GOOGLE_CLOUD_PROJECT so local runs can
 * keep data on the emulators while Gemini calls go to the real project.
 */
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "demo-flowhub";
  if (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith("demo-")) {
    throw new Error("With the emulators on, FIREBASE_PROJECT_ID must start with demo-.");
  }
  return initializeApp({
    projectId,
    storageBucket: process.env.STORAGE_BUCKET ?? `${projectId}.appspot.com`,
  });
}

export const db = () => getFirestore(app());
export const adminAuth = () => getAuth(app());
export const bucket = () => getStorage(app()).bucket();
