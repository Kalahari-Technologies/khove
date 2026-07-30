"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Typed localStorage-backed UI preference, keyed by workspace. Generalizes the
 * inline `planner:<thing>:${workspaceId}` convention used in calendar-client.tsx.
 *
 * - Reads once on mount (and when the key changes), guarded by try/catch.
 * - Writes on every set, JSON-serialized so objects/arrays round-trip.
 * - SSR-safe: returns `initial` until the mount effect runs (no hydration write).
 *
 * The returned setter accepts a value OR an updater fn, like `useState`.
 */
export function useLocalPref<T>(
  key: string | null,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  // Hydrate from storage once we have a concrete key (client-only).
  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed/blocked storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (key && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          } catch {
            /* ignore quota/blocked storage */
          }
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
