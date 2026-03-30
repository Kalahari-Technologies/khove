import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/lib/workspace/get-workspace";
import { TaskFormClient } from "./task-form-client";

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  const [workflowStatuses, integrations] = await Promise.all([
    db.workflowStatus.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { position: "asc" },
    }).then(async (wsStatuses) => {
      if (wsStatuses.length > 0) return wsStatuses;
      return db.workflowStatus.findMany({
        where: { workspaceId: null, isSystem: true },
        orderBy: { position: "asc" },
      });
    }),
    // Integrations are workspace-scoped
    db.integration.findMany({
      where: { workspaceId: workspace.id, isActive: true },
      select: { provider: true, isActive: true },
    }),
  ]);

  const connectedProviders = integrations.map(i => i.provider as string);

  return (
    <TaskFormClient
      statuses={workflowStatuses}
      connectedProviders={connectedProviders}
    />
  );
}
