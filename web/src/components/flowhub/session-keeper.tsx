"use client";

import { onIdTokenChanged } from "firebase/auth";
import { useEffect } from "react";
import { clientAuth } from "@/lib/firebase/client";
import { startSession } from "@/server/auth/actions";

/**
 * Keeps the session cookie current while the hub is open. Firebase renews the
 * ID token about hourly; each renewal is handed to the server. `exp` is when
 * the cookie the server saw expires, so the first callback doesn't resend it.
 */
export function SessionKeeper({ exp }: { exp: number }) {
  useEffect(() => {
    let current = exp;
    return onIdTokenChanged(clientAuth(), async (user) => {
      if (!user) return;
      const result = await user.getIdTokenResult();
      const tokenExp = Math.floor(new Date(result.expirationTime).getTime() / 1000);
      if (tokenExp <= current + 60) return;
      current = tokenExp;
      await startSession(result.token).catch(() => undefined);
    });
  }, [exp]);
  return null;
}
