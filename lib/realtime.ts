import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Redis singleton (same lazy pattern as lib/redis.ts)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type RealtimeEvent =
  | { type: "task.created"; taskId: string }
  | { type: "task.updated"; taskId: string }
  | { type: "task.deleted"; taskId: string }
  | { type: "calendar.synced"; tasksCreated: number; tasksUpdated: number; entriesCreated: number }
  | { type: "calendar.disconnected" }
  | { type: "refresh" };

// ---------------------------------------------------------------------------
// Publish — 2 Redis commands per call (LPUSH + EXPIRE)
// ---------------------------------------------------------------------------

const EVENTS_KEY = (userId: string) => `events:${userId}`;
const EVENTS_TTL = 120; // seconds — auto-cleanup if client never reads

/**
 * Push a real-time event to the user's event queue.
 * The SSE endpoint polls this queue and streams events to the client.
 * Cost: 2 Redis commands (LPUSH + EXPIRE).
 */
export async function publishEvent(userId: string, event: RealtimeEvent): Promise<void> {
  const redis = getRedis();
  const key = EVENTS_KEY(userId);
  await redis.lpush(key, JSON.stringify(event));
  await redis.expire(key, EVENTS_TTL);
}

/**
 * Drain all pending events for a user. Called by the SSE endpoint.
 * Cost: 2 Redis commands (LRANGE + DEL) when there are events, 1 (LRANGE) when empty.
 */
export async function drainEvents(userId: string): Promise<string[]> {
  const redis = getRedis();
  const key = EVENTS_KEY(userId);
  const messages = await redis.lrange<string>(key, 0, -1);
  if (messages.length > 0) {
    await redis.del(key);
  }
  return messages;
}
