import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PlannerClient } from "./calendar-client";

export default async function PlannerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // Fetch Khove tasks with due dates (includes GOOGLE_CALENDAR source tasks)
  const tasks = await db.task.findMany({
    where: { userId: user.id, dueDate: { not: null } },
    include: { status: true },
    orderBy: { dueDate: "asc" },
  });

  // Fetch external calendar entries (holidays, birthdays — display only)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const calendarEntries = await db.calendarEntry.findMany({
    where: {
      userId: user.id,
      startDate: { gte: monthStart, lte: monthEnd },
    },
    orderBy: { startDate: "asc" },
  });

  // Check if Google Calendar is connected
  const googleIntegration = await db.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE_CALENDAR", isActive: true },
    select: { id: true },
  });
  const isGoogleConnected = !!googleIntegration;

  const isFirstTime = tasks.length === 0 && calendarEntries.length === 0;

  return (
    <PlannerClient
      isFirstTime={isFirstTime}
      isGoogleConnected={isGoogleConnected}
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
