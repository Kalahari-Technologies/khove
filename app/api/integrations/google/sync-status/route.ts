import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { Redis } from "@upstash/redis";

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

/**
 * GET /api/integrations/google/sync-status
 * Returns the current sync status from Redis. 1 Redis GET per poll.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  const raw = await redis.get<string>(`cal-sync:${user.id}`);

  if (!raw) {
    return NextResponse.json({ status: "idle" });
  }

  // Could be "syncing" or a JSON string like {"status":"done","tasksCreated":5,...}
  if (raw === "syncing") {
    return NextResponse.json({ status: "syncing" });
  }

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ status: raw });
  }
}
