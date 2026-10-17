"use client";

import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, reauthenticateWithPopup } from "firebase/auth";
import { clientAuth } from "./client";

/**
 * FR-WRI-7, FR-DECK-6, ADR-0007 (as amended): asks Google for the narrowest
 * Drive permission, drive.file, through the same Google sign-in. The
 * short-lived token goes straight to a server action; the browser keeps nothing.
 */
export async function requestDriveToken(): Promise<string> {
  const user = clientAuth().currentUser;
  if (!user) throw new Error("signed-out");
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  const result = await reauthenticateWithPopup(user, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error("no-token");
  return token;
}

/** What to tell the person when the Google window didn't give a token. */
export function driveTokenError(err: unknown, fallback: string): string {
  const code = err instanceof FirebaseError ? err.code : err instanceof Error ? err.message : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "The Google window closed before you allowed Drive access. Try again when you're ready.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google window. Allow pop-ups for this site, then try again.";
  if (code === "auth/user-mismatch") return "Choose the same Google account you signed in to FlowHub with.";
  if (code === "signed-out") return "Your sign-in expired. Reload the page and try again.";
  return fallback;
}
