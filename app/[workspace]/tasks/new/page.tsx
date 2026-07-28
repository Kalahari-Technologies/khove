import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { TaskFormClient } from "./task-form-client";

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const [workflowStatuses, integrations] = await Promise.all([
    trpc.workflowStatus.list.query(),
    trpc.integration.list.query(),
  ]);

  const connectedProviders = integrations.map((i) => i.provider as string);

  return (
    <TaskFormClient
      statuses={workflowStatuses}
      connectedProviders={connectedProviders}
    />
  );
}
