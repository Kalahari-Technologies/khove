import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { TaskDetailClient } from "./task-detail-client";

export default async function TaskDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const task = await db.task.findFirst({
    where: { id: params.id, userId: user.id },
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
