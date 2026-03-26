import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TaskFormClient } from "./task-form-client";

export default async function NewTaskPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [workflowStatuses, integrations] = await Promise.all([
    db.workflowStatus.findMany({
      where: { workspaceId: null },
      orderBy: { position: "asc" },
    }),
    db.integration.findMany({
      where: { userId: user.id, isActive: true },
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
