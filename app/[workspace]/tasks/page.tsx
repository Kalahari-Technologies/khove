import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/lib/workspace/get-workspace";
import { TasksClient } from "./tasks-client";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  const [tasks, statuses] = await Promise.all([
    db.task.findMany({
      where: { workspaceId: workspace.id },
      include: { status: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.workflowStatus.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { position: "asc" },
    }).then(async (wsStatuses) => {
      // If workspace has its own statuses, use those. Otherwise fall back to system defaults.
      if (wsStatuses.length > 0) return wsStatuses;
      return db.workflowStatus.findMany({
        where: { workspaceId: null, isSystem: true },
        orderBy: { position: "asc" },
      });
    }),
  ]);

  return <TasksClient tasks={tasks} statuses={statuses} isPersonalWorkspace={workspace.isPersonal} />;
}
