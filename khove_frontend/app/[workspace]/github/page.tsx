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

  // Which PR Tasks are linked into a Connectivity Thread (for the thread chip).
  const threads = isConnected ? await trpc.thread.list.query({}).catch(() => []) : [];
  const threadByTaskId: Record<string, { id: string; title: string }> = {};
  for (const thread of threads) {
    for (const link of thread.links) {
      if (link.kind === "GITHUB_PR") {
        threadByTaskId[link.refId] = { id: thread.id, title: thread.title };
      }
    }
  }

  // Open PR Shepherd proposals (NUDGE_REVIEWER / REQUEST_REVIEW / FLAG_PR).
  const GITHUB_ACTION_TYPES = new Set(["NUDGE_REVIEWER", "REQUEST_REVIEW", "FLAG_PR"]);
  const allActions = isConnected ? await trpc.agentAction.list.query({}).catch(() => []) : [];
  const shepherdActions = allActions
    .filter((a) => GITHUB_ACTION_TYPES.has(a.type))
    .map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      title: a.title,
      rationale: a.rationale,
      confidence: a.confidence,
      error: a.error,
    }));

  return (
    <GitHubClient
      isConnected={isConnected}
      canAdmin={canAdmin}
      workspaceId={ws.id}
      githubLogin={(metadata?.login as string) ?? null}
      githubAvatar={(metadata?.avatarUrl as string) ?? null}
      repoCount={typeof metadata?.repoCount === "number" ? (metadata.repoCount as number) : null}
      threadByTaskId={threadByTaskId}
      shepherdActions={shepherdActions}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status?.name ?? "No status",
        statusColor: t.status?.color ?? "#71717A",
        externalUrl: t.externalUrl,
        metadata: t.metadata as Record<string, unknown> | null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
