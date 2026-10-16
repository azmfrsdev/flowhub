"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getUserWorkspaceId } from "@/server/workspace/access";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Stores a freshly issued Firebase ID token as the session (FR-WS-1).
 * Server actions only accept same-origin POSTs, so another site can't plant a
 * session. Returns where the user goes next: their workspace, or setup.
 */
export async function startSession(idToken: string): Promise<{ next: "/home" | "/start" }> {
  const token = z.string().min(20).max(8000).parse(idToken);
  const user = await verifySessionToken(token);
  if (!user) throw new Error("FlowHub couldn't verify your Google sign-in. Try again.");

  const maxAge = Math.max(60, user.exp - Math.floor(Date.now() / 1000));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return { next: (await getUserWorkspaceId(user.uid)) ? "/home" : "/start" };
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
