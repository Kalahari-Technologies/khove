import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { GitHubClient } from "./github-client";

export default async function GitHubPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const canAdmin = ws.currentRole === "OWNER" || ws.currentRole === "ADMIN";

  const trpc = await serverTRPC(ws.id);
  const integration = await trpc.integration.get.query({ provider: "GITHUB" });
  const isConnected = !!integration;
  const metadata = (integration?.metadata ?? null) as Record<string, unknown> | null;

  const tasks = isConnected
    ? (await trpc.task.list.query({ source: "GITHUB", limit: 100 })).items
    : [];

  return (
    <GitHubClient
      isConnected={isConnected}
      canAdmin={canAdmin}
      workspaceId={ws.id}
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
