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

  const [tasksResult, calendarEntries, googleIntegration, sync, insights, threads, agentActions] =
    await Promise.all([
      trpc.task.list.query({ hasDueDate: true, limit: 200 }),
      trpc.calendarEntry.list.query({ from: monthStart, to: monthEnd }),
      trpc.integration.get.query({ provider: "GOOGLE_CALENDAR" }),
      trpc.integration.syncStatus.query(),
      trpc.insight.getForRange.query({ from: monthStart, to: monthEnd }).catch(() => []),
      trpc.thread.list.query().catch(() => []),
      trpc.agentAction.list.query().catch(() => []),
    ]);

  const tasks = tasksResult.items;

  // Map each meeting task → the thread it's linked to (via TASK ThreadLinks).
  const taskThread = new Map<string, { id: string; title: string }>();
  for (const t of threads) {
    for (const link of t.links) {
      if (link.kind === "TASK") taskThread.set(link.refId, { id: t.id, title: t.title });
    }
  }
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
      tasks={tasks.map((t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gcal = (t.metadata as Record<string, any> | null)?.googleCalendar;
        const thread = taskThread.get(t.id);
        return {
          id: t.id,
          title: t.title,
          dueDate: t.dueDate!.toISOString(),
          source: t.source,
          hasMeetLink: !!gcal?.meetLink,
          meetLink: gcal?.meetLink ?? null,
          location: gcal?.location ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          attendees: (gcal?.attendeeStatus as any[] | undefined)?.map((a) => ({
            email: a.email,
            displayName: a.displayName ?? null,
            responseStatus: a.responseStatus ?? "needsAction",
          })) ?? [],
          endDateTime: gcal?.endDateTime ?? undefined,
          isAllDay: gcal?.isAllDay ?? false,
          threadId: thread?.id ?? null,
          threadTitle: thread?.title ?? null,
          status: t.status
            ? { name: t.status.name, color: t.status.color }
            : { name: "No status", color: "#666666" },
        };
      })}
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
      agentActions={agentActions.map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        title: a.title,
        rationale: a.rationale,
        confidence: a.confidence,
        error: a.error,
      }))}
    />
  );
}
