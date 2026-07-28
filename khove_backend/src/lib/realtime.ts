import type { RealtimeEvent } from "@khove/shared";
import { getIo } from "@backend/realtime/io";

/**
 * Realtime publishers — socket.io room emits. Signatures are preserved from the
 * old SSE/Redis implementation so every existing call site (task routes, OAuth
 * callbacks, tRPC mutations, Inngest functions) keeps working unchanged.
 * `drainEvents` and the Redis LPUSH/EXPIRE queue are gone (push, not poll).
 */

export type { RealtimeEvent };

/** Emit an event to a single user's connected sockets. */
export async function publishEvent(userId: string, event: RealtimeEvent): Promise<void> {
  getIo().to(`user:${userId}`).emit("realtime", event);
}

/** Emit an event to every member currently in a workspace's room. */
export async function publishWorkspaceEvent(
  workspaceId: string,
  event: RealtimeEvent
): Promise<void> {
  getIo().to(`workspace:${workspaceId}`).emit("realtime", event);
}
