import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/lib/workspace/get-workspace";
import { notFound } from "next/navigation";
import { TaskDetailClient } from "./task-detail-client";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug, id } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  const task = await db.task.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      status: true,
      assignees: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!task) notFound();

  return <TaskDetailClient task={task} />;
}
