import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/lib/workspace/get-workspace";
import { canAdminWorkspace } from "@/lib/workspace/authorization";
import { PlannerClient } from "./calendar-client";
import { Redis } from "@upstash/redis";

export default async function PlannerPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  // Get user's role in this workspace
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    select: { role: true },
  });
  const canAdmin = membership ? canAdminWorkspace(membership.role) : false;

  // Workspace-scoped tasks with due dates
  const tasks = await db.task.findMany({
    where: { workspaceId: workspace.id, dueDate: { not: null } },
    include: { status: true },
    orderBy: { dueDate: "asc" },
  });

  // Workspace-scoped calendar entries
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const calendarEntries = await db.calendarEntry.findMany({
    where: {
      workspaceId: workspace.id,
      startDate: { gte: monthStart, lte: monthEnd },
    },
    orderBy: { startDate: "asc" },
  });

  // Workspace-scoped integration check
  const googleIntegration = await db.integration.findFirst({
    where: { workspaceId: workspace.id, provider: "GOOGLE_CALENDAR", isActive: true },
    select: { id: true },
  });
  const isGoogleConnected = !!googleIntegration;

  // Check if calendar is currently syncing (Redis key from Inngest job)
  let isSyncing = false;
  if (isGoogleConnected && tasks.filter((t) => t.source.includes("GOOGLE_CALENDAR")).length === 0) {
    // Integration exists but no synced tasks yet — check if sync is actively running
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      const syncStatus = await redis.get(`cal-sync:${workspace.id}`);
      isSyncing = syncStatus === "syncing"; // only true if actively syncing — null means done or never set
    } catch {
      // Redis error — don't assume syncing, show empty state instead
    }
  }

  const isFirstTime = tasks.length === 0 && calendarEntries.length === 0 && !isSyncing;

  return (
    <PlannerClient
      isFirstTime={isFirstTime}
      isGoogleConnected={isGoogleConnected}
      isSyncing={isSyncing}
      canAdmin={canAdmin}
      workspaceId={workspace.id}
      planTier={user.planTier}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        source: t.source,
        hasMeetLink: !!(t.metadata as Record<string, any> | null)?.googleCalendar?.meetLink,
        status: t.status
          ? { name: t.status.name, color: t.status.color }
          : { name: "No status", color: "#666666" },
      }))}
      calendarEntries={calendarEntries.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate.toISOString(),
        endDate: e.endDate?.toISOString(),
        isAllDay: e.isAllDay,
      }))}
    />
  );
}
