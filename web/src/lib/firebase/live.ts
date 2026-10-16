"use client";

import { collection, doc, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { clientAuth, clientDb } from "./client";

/**
 * Read-only live views (invariant 9: the browser gets progress only through
 * Firestore listeners, and never writes). Listeners start once Firebase Auth
 * has restored the browser's sign-in, so security rules see the member.
 */

export type LiveStatus = "live" | "connecting" | "paused";

export function useLiveDoc<T>(path: string | null, initial: T | null): { data: T | null; status: LiveStatus } {
  const [state, setState] = useState<{ path: string | null; data: T | null; status: LiveStatus }>({ path, data: initial, status: "connecting" });
  useEffect(() => {
    if (!path) return;
    let unsubscribe = () => {};
    let cancelled = false;
    clientAuth()
      .authStateReady()
      .then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(clientDb(), path),
          (snap) => setState({ path, data: (snap.data() as T | undefined) ?? null, status: "live" }),
          () => setState((current) => ({ ...current, status: "paused" })),
        );
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [path]);
  // A new path starts from the server's copy until its listener reports.
  return state.path === path ? { data: state.data, status: state.status } : { data: initial, status: "connecting" };
}

/** A collection in `order`, ascending; with `limit`, only the last that many. */
export function useLiveCollection<T>(path: string | null, order: string, limit?: number): T[] {
  const [state, setState] = useState<{ path: string | null; items: T[] }>({ path, items: [] });
  useEffect(() => {
    if (!path) return;
    let unsubscribe = () => {};
    let cancelled = false;
    clientAuth()
      .authStateReady()
      .then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          limit ? query(collection(clientDb(), path), orderBy(order), limitToLast(limit)) : query(collection(clientDb(), path), orderBy(order)),
          (snap) => setState({ path, items: snap.docs.map((d) => d.data() as T) }),
          () => undefined,
        );
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [path, order, limit]);
  return state.path === path ? state.items : [];
}
