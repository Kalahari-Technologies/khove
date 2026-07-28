import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { PlannerClient } from "./calendar-client";

export default async function PlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { workspace: slug } = await params;
  const { view: rawView } = await searchParams;
  const view = rawView === "week" || rawView === "day" ? rawView : ("month" as const);

  const base = await serverTRPC();
  const me = await base.workspace.me.query().catch(() => null);
  if (!me) redirect("/login");
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");
  const canAdmin = ws.currentRole === "OWNER" || ws.currentRole === "ADMIN";

  const trpc = await serverTRPC(ws.id);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const [tasksResult, calendarEntries, googleIntegration, sync, insights] = await Promise.all([
    trpc.task.list.query({ hasDueDate: true, limit: 200 }),
    trpc.calendarEntry.list.query({ from: monthStart, to: monthEnd }),
    trpc.integration.get.query({ provider: "GOOGLE_CALENDAR" }),
    trpc.integration.syncStatus.query(),
    trpc.insight.getForRange.query({ from: monthStart, to: monthEnd }).catch(() => []),
  ]);

  const tasks = tasksResult.items;
  const isGoogleConnected = !!googleIntegration;
  const isSyncing =
    (sync as { status?: string }).status === "syncing" &&
    isGoogleConnected &&
    tasks.filter((t) => t.source.includes("GOOGLE_CALENDAR")).length === 0;

  const isFirstTime = tasks.length === 0 && calendarEntries.length === 0 && !isSyncing;

  return (
    <PlannerClient
      isFirstTime={isFirstTime}
      isGoogleConnected={isGoogleConnected}
      isSyncing={isSyncing}
      canAdmin={canAdmin}
      workspaceId={ws.id}
      planTier={me.user.planTier}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        source: t.source,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hasMeetLink: !!(t.metadata as Record<string, any> | null)?.googleCalendar?.meetLink,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        endDateTime: (t.metadata as Record<string, any> | null)?.googleCalendar?.endDateTime ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isAllDay: (t.metadata as Record<string, any> | null)?.googleCalendar?.isAllDay ?? false,
        status: t.status
          ? { name: t.status.name, color: t.status.color }
          : { name: "No status", color: "#666666" },
      }))}
      view={view}
      calendarEntries={calendarEntries.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate.toISOString(),
        endDate: e.endDate?.toISOString(),
        isAllDay: e.isAllDay,
      }))}
      insights={insights.map((i) => ({
        id: i.id,
        type: i.type,
        severity: i.severity,
        title: i.title,
        detail: i.detail,
        day: i.day,
      }))}
    />
  );
}
