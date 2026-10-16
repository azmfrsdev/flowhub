"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

/**
 * Browser SDK: sign-in and read-only Firestore listeners (invariants 9 and 10).
 * The browser never writes to Firestore; security rules deny every client write.
 * NEXT_PUBLIC_ values are fixed when the image is built.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "demo-flowhub.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-flowhub",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "demo-app",
};

let app: FirebaseApp | null = null;
let emulatorsConnected = false;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function clientAuth() {
  const auth = getAuth(firebaseApp());
  connectEmulators();
  return auth;
}

export function clientDb() {
  const db = getFirestore(firebaseApp());
  connectEmulators();
  return db;
}

function connectEmulators() {
  if (emulatorsConnected || process.env.NEXT_PUBLIC_USE_EMULATORS !== "true") return;
  emulatorsConnected = true;
  connectAuthEmulator(getAuth(firebaseApp()), "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(firebaseApp()), "127.0.0.1", 8080);
}
