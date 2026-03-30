import { NextRequest, NextResponse } from "next/server";
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
 * GET /api/integrations/google/sync-status?workspaceId=xxx
 * Returns the current sync status from Redis. Workspace-scoped.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const redis = getRedis();
  const raw = await redis.get<string>(`cal-sync:${workspaceId}`);

  if (!raw) {
    return NextResponse.json({ status: "idle" });
  }

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
