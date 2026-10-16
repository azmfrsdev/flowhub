"use client";

import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clientAuth } from "@/lib/firebase/client";
import { startSession } from "@/server/auth/actions";

const POPUP_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "The Google window closed before sign-in finished. Try again.",
  "auth/cancelled-popup-request": "The Google window closed before sign-in finished. Try again.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site, then try again.",
  "auth/unauthorized-domain": "This address isn't allowed to sign in yet. Ask the workspace owner to add it in Firebase.",
  "auth/network-request-failed": "FlowHub couldn't reach Google. Check your connection and try again.",
};

/**
 * How long the Google window gets. Firebase loads Google's script before it
 * opens the window, with no time limit of its own, so a stalled load would
 * otherwise wait forever.
 */
const POPUP_TIMEOUT_MS = 90_000;
/** How long the server gets to store the session before the button offers a retry. */
const SESSION_TIMEOUT_MS = 20_000;
/** How long the move to the workspace gets before it becomes a full page load. */
const NAVIGATION_TIMEOUT_MS = 15_000;

type State = "idle" | "popup" | "working";

const LABELS: Record<State, string> = {
  idle: "Continue with Google",
  popup: "Finish in the Google window…",
  working: "Signing you in…",
};

class StepTimeout extends Error {}

/**
 * "Continue with Google" (FR-WS-1). Signs in with a popup, hands the ID token
 * to the server, then goes to the workspace or to setup. With `restore`, a
 * browser that is still signed in to Firebase gets a fresh session without a
 * click, which is how an expired session recovers. A step that stalls ends in
 * an error and the button again, never an endless spinner.
 */
export function GoogleSignIn({ next, restore = false }: { next?: string; restore?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>(restore ? "working" : "idle");
  const [error, setError] = useState<string | null>(null);
  // Numbers each attempt. A result for an attempt that has ended is dropped.
  const attempt = useRef(0);

  // Next keeps a page you leave mounted but hidden, and shows it again as you
  // left it (cacheComponents preserves routes with <Activity>). Hiding cleans
  // up effects, so this is where an attempt ends: when the page comes back,
  // the button is ready again instead of stuck at "Signing you in…".
  useEffect(
    () => () => {
      attempt.current += 1;
      setState(restore ? "working" : "idle");
      setError(null);
    },
    [restore],
  );

  async function run(getIdToken: () => Promise<string>) {
    const id = ++attempt.current;
    const current = () => id === attempt.current;
    setState("working");
    setError(null);
    try {
      const idToken = await getIdToken();
      if (!current()) return;
      setState("working");
      const result = await withTimeout(
        startSession(idToken),
        SESSION_TIMEOUT_MS,
        "FlowHub didn't hear back after Google signed you in. Try again.",
      ).catch((err) => {
        // A server action that never answers holds Next's action queue, so a
        // retry would wait behind it. A navigation discards it: stay on this page.
        if (err instanceof StepTimeout) router.replace(window.location.pathname + window.location.search);
        throw err;
      });
      if (!current()) return;
      const target = (result.next === "/home" && samePath(next)) || result.next;
      router.replace(target);
      // Arriving hides this page, which ends the attempt. If that hasn't happened in time, load the page in full.
      window.setTimeout(() => {
        if (current()) window.location.assign(target);
      }, NAVIGATION_TIMEOUT_MS);
    } catch (err) {
      if (!current()) return;
      setError(errorMessage(err));
      setState("idle");
    }
  }

  useEffect(() => {
    if (!restore) return;
    return onAuthStateChanged(clientAuth(), (user) => {
      if (user) run(() => user.getIdToken(true));
      else setState("idle");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore]);

  function signIn() {
    run(async () => {
      const auth = clientAuth();
      // A browser still signed in to Firebase needs no Google window.
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser.getIdToken();
      setState("popup");
      const { user } = await withTimeout(
        signInWithPopup(auth, new GoogleAuthProvider()),
        POPUP_TIMEOUT_MS,
        "The Google window didn't finish. Close it if it's still open, then try again.",
      );
      return user.getIdToken();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        size="lg"
        onClick={signIn}
        disabled={state !== "idle"}
        className="h-12 gap-3 bg-foreground text-base text-background hover:bg-foreground/85"
      >
        <GoogleMark />
        {LABELS[state]}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new StepTimeout(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function errorMessage(err: unknown): string {
  if (err instanceof StepTimeout) return err.message;
  // Only the code is shown: other fields of a Firebase error can carry Google tokens (invariant 12).
  const code = err instanceof FirebaseError ? err.code : "";
  return POPUP_ERRORS[code] ?? `Sign-in didn't work${code ? ` (${code})` : ""}. Try again in a moment.`;
}

/** `next` comes from the address bar, so it is followed only as a path on this site. */
function samePath(next: string | undefined): string | null {
  if (!next?.startsWith("/")) return null;
  const url = new URL(next, window.location.origin);
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : null;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
