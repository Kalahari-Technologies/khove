import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/lib/workspace/get-workspace";
import { canAdminWorkspace } from "@/lib/workspace/authorization";
import { GitHubClient } from "./github-client";

export default async function GitHubPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  // Get user's role
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    select: { role: true },
  });
  const canAdmin = membership ? canAdminWorkspace(membership.role) : false;

  // Workspace-scoped integration check
  const integration = await db.integration.findFirst({
    where: { workspaceId: workspace.id, provider: "GITHUB", isActive: true },
    select: { id: true, metadata: true },
  });

  const isConnected = !!integration;
  const metadata = integration?.metadata as Record<string, unknown> | null;

  // Workspace-scoped GitHub tasks
  const tasks = isConnected
    ? await db.task.findMany({
        where: {
          workspaceId: workspace.id,
          source: { has: "GITHUB" },
        },
        include: { status: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <GitHubClient
      isConnected={isConnected}
      canAdmin={canAdmin}
      workspaceId={workspace.id}
      githubLogin={(metadata?.login as string) ?? null}
      githubAvatar={(metadata?.avatarUrl as string) ?? null}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status?.name ?? "No status",
        statusColor: t.status?.color ?? "#71717A",
        externalUrl: t.externalUrl,
        metadata: t.metadata as Record<string, unknown> | null,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
