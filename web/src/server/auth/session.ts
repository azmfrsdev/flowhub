import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { adminAuth } from "@/server/firebase/admin";

/**
 * Sign-in (PRD FR-WS-1). The browser signs in with Google through Firebase
 * Auth and hands its ID token to the `startSession` server action, which
 * stores it in an httpOnly cookie. Every request verifies it against Google's
 * public keys, which needs no credentials. The browser refreshes it hourly
 * (SessionKeeper). Google user tokens for Drive are a separate thing and are
 * never stored (ADR-0007).
 */
export const SESSION_COOKIE = "__session";

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
  picture: string | null;
  /** When the ID token in the cookie expires, in seconds since the epoch. */
  exp: number;
};

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    if (decoded.firebase.sign_in_provider !== "google.com" || !decoded.email) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded.name === "string" && decoded.name ? decoded.name : decoded.email,
      picture: decoded.picture ?? null,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

/** The signed-in user for this request, or null. Read once per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Verifying compares the token's expiry with the clock, so it only ever
  // happens at request time, never in a prerendered or prefetched shell.
  await connection();
  return verifySessionToken(token);
});

/** For pages and server actions: the signed-in user, or a redirect to sign in. */
export async function requireUser(next = "/home"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return user;
}
