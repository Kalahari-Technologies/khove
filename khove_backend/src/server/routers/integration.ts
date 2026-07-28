import { z } from "zod";
import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { redis } from "@backend/lib/redis";

// SAFE integration fields only — NEVER expose accessTokenEnc / refreshTokenEnc.
const SAFE_SELECT = {
  id: true,
  provider: true,
  isActive: true,
  metadata: true,
  createdAt: true,
} as const;

export const integrationRouter = router({
  /** Active integrations for the workspace (safe fields only — no tokens). */
  list: workspaceProcedure.query(async ({ ctx }) => {
    return db.integration.findMany({
      where: { workspaceId: ctx.workspace.id, isActive: true },
      select: SAFE_SELECT,
    });
  }),

  /** A single active integration by provider (safe fields only). */
  get: workspaceProcedure
    .input(z.object({ provider: z.enum(["GITHUB", "GOOGLE_CALENDAR", "JIRA"]) }))
    .query(async ({ ctx, input }) => {
      return db.integration.findFirst({
        where: { workspaceId: ctx.workspace.id, provider: input.provider, isActive: true },
        select: SAFE_SELECT,
      });
    }),

  /** Google Calendar sync status (from Redis) for the planner. */
  syncStatus: workspaceProcedure.query(async ({ ctx }) => {
    const raw = await redis.get<string>(`cal-sync:${ctx.workspace.id}`);
    if (!raw) return { status: "idle" as const };
    if (raw === "syncing") return { status: "syncing" as const };
    try {
      return (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
    } catch {
      return { status: raw };
    }
  }),
});
