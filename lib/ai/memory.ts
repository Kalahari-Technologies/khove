import { redis } from "@/lib/redis";

const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const MAX_MEMORY_LENGTH = 2000; // chars

function getMemoryKey(userId: string): string {
  return `memory:user:${userId}`;
}

/**
 * Retrieve the persisted memory summary for a user.
 * Returns null if no memory exists yet.
 * Only used for paid tiers — callers must check plan before calling.
 */
export async function getUserMemory(userId: string): Promise<string | null> {
  return redis.get<string>(getMemoryKey(userId));
}

/**
 * Update the user's memory summary.
 * Called every 10 messages on paid tiers.
 * The AI generates a concise summary of the user's work patterns, preferences, and context.
 */
export async function updateUserMemory(
  userId: string,
  memorySummary: string
): Promise<void> {
  const truncated = memorySummary.slice(0, MAX_MEMORY_LENGTH);
  await redis.set(getMemoryKey(userId), truncated, { ex: MEMORY_TTL_SECONDS });
}

/**
 * Clear a user's memory — called when they explicitly ask to reset.
 */
export async function clearUserMemory(userId: string): Promise<void> {
  await redis.del(getMemoryKey(userId));
}

/**
 * Determine if memory should be updated this turn.
 * Updates every 10 messages to avoid expensive LLM calls on every turn.
 */
export function shouldUpdateMemory(messageCount: number): boolean {
  return messageCount > 0 && messageCount % 10 === 0;
}
