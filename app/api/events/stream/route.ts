import { getCurrentUser } from "@/lib/auth";
import { drainEvents } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/stream
 *
 * SSE endpoint — polls Redis every 3s for pending events and streams them to the client.
 * Closes after ~55s (before Vercel's 60s limit); EventSource auto-reconnects.
 *
 * Cost: ~40 Redis commands/min per active tab (LRANGE + conditional DEL every 3s).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Heartbeat so the client knows the connection is alive
      send(JSON.stringify({ type: "connected" }));

      const interval = setInterval(async () => {
        try {
          const messages = await drainEvents(userId);
          for (const msg of messages) {
            send(typeof msg === "string" ? msg : JSON.stringify(msg));
          }
        } catch {
          // Redis error — skip this tick
        }
      }, 3000);

      // Close before Vercel's function timeout (60s hobby / 300s pro)
      // EventSource will auto-reconnect immediately
      setTimeout(() => {
        clearInterval(interval);
        try { controller.close(); } catch {}
      }, 55000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
