import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { TasksClient } from "./tasks-client";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const [tasksResult, statuses] = await Promise.all([
    trpc.task.list.query({ limit: 200 }),
    trpc.workflowStatus.list.query(),
  ]);

  return (
    <TasksClient
      tasks={tasksResult.items}
      statuses={statuses}
      isPersonalWorkspace={ws.isPersonal}
    />
  );
}
