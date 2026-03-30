import { Redis } from "@upstash/redis";
import type { PlanTier } from "@prisma/client";

// Lazy singleton — deferred until first use so the build phase never
// instantiates the client with missing/placeholder env vars.
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

// Proxy forwards all calls to the lazily-created client while preserving
// the full Redis type (including generics) for callers.
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    const value = client[prop as keyof Redis];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

// ─────────────────────────────────────────────
// Plan Limits
// ─────────────────────────────────────────────

// AI action limits per month (V3 Concept Note)
// FREE: 20 actions/month (user-scoped)
// PRO: Unlimited
// TEAM: 500/workspace, SMB: 2000/workspace
export const PLAN_LIMITS: Record<PlanTier, number> = {
  FREE: 20,
  PRO: Infinity,
  TEAM: 500,
  SMB: 2000,
  ENTERPRISE: Infinity,
};

// ─────────────────────────────────────────────
// Usage Keys
// ─────────────────────────────────────────────

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getUserUsageKey(userId: string): string {
  return `usage:${userId}:${getMonthKey()}`;
}

export function getWorkspaceUsageKey(workspaceId: string): string {
  return `usage:ws:${workspaceId}:${getMonthKey()}`;
}

// ─────────────────────────────────────────────
// Usage Metering
// ─────────────────────────────────────────────

export interface UsageResult {
  allowed: boolean;
  current: number;
  limit: number;
  percentUsed: number;
}

/**
 * Check current usage without incrementing.
 * Returns blocked:true if at or over limit.
 */
export async function checkUsage(
  userId: string,
  planTier: PlanTier,
  workspaceId?: string
): Promise<UsageResult> {
  const key = workspaceId ? getWorkspaceUsageKey(workspaceId) : getUserUsageKey(userId);
  const limit = workspaceId ? PLAN_LIMITS[planTier] : PLAN_LIMITS[planTier];

  const current = (await redis.get<number>(key)) ?? 0;

  if (limit === Infinity) {
    return { allowed: true, current, limit: -1, percentUsed: 0 };
  }

  const percentUsed = Math.round((current / limit) * 100);
  return {
    allowed: current < limit,
    current,
    limit,
    percentUsed,
  };
}

/**
 * Atomically increment usage counter.
 * Sets a 35-day TTL on first increment so keys self-expire.
 * Call AFTER the AI response has been returned successfully.
 */
export async function incrementUsage(
  userId: string,
  planTier: PlanTier,
  workspaceId?: string
): Promise<number> {
  const key = workspaceId ? getWorkspaceUsageKey(workspaceId) : getUserUsageKey(userId);

  const newCount = await redis.incr(key);

  // Set TTL only on first increment (avoids resetting TTL on every call)
  if (newCount === 1) {
    await redis.expire(key, 60 * 60 * 24 * 35); // 35 days
  }

  return newCount;
}

/**
 * Clear usage cache for a user — called on plan upgrade so they start fresh.
 */
export async function clearUsageCache(userId: string, workspaceId?: string): Promise<void> {
  const keys = [getUserUsageKey(userId)];
  if (workspaceId) keys.push(getWorkspaceUsageKey(workspaceId));
  await Promise.all(keys.map((k) => redis.del(k)));
}
