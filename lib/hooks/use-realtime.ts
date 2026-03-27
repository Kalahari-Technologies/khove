"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Connects to the SSE endpoint and calls router.refresh()
 * whenever a real-time event is received, re-fetching all
 * server components on the current page without a full navigation.
 *
 * EventSource auto-reconnects on error or when the stream closes
 * (every ~55s due to Vercel function limits).
 */
export function useRealtime() {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/events/stream");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") return; // heartbeat — ignore
        router.refresh();
      } catch {
        // Malformed message — ignore
      }
    };

    // EventSource auto-reconnects on error — no manual handling needed
    return () => es.close();
  }, [router]);
}
