import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [tasks, statuses] = await Promise.all([
    db.task.findMany({
      where: { userId: user.id },
      include: { status: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.workflowStatus.findMany({
      where: { workspaceId: null },
      orderBy: { position: "asc" },
    }),
  ]);

  return <TasksClient tasks={tasks} statuses={statuses} />;
}
