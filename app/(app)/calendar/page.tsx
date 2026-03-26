import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PlannerClient } from "./calendar-client";

export default async function PlannerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const tasks = await db.task.findMany({
    where: { userId: user.id, dueDate: { not: null } },
    include: { status: true },
    orderBy: { dueDate: "asc" },
  });

  const isFirstTime = tasks.length === 0;

  return (
    <PlannerClient
      isFirstTime={isFirstTime}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        status: t.status
          ? { name: t.status.name, color: t.status.color }
          : { name: "No status", color: "#666666" },
      }))}
    />
  );
}
