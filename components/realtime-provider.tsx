"use client";

import { useRealtime } from "@/lib/hooks/use-realtime";

/**
 * Invisible client component that establishes the SSE connection.
 * Placed in the app layout so every authenticated page gets real-time updates.
 */
export function RealtimeProvider() {
  useRealtime();
  return null;
}
