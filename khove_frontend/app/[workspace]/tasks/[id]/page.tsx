import { redirect, notFound } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { TaskDetailClient } from "./task-detail-client";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace: slug, id } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const task = await trpc.task.get.query({ id }).catch(() => null);
  if (!task) notFound();

  return <TaskDetailClient task={task} />;
}
