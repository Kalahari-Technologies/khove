import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { JiraClient } from "./jira-client";

export default async function JiraPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const integration = await trpc.integration.get.query({ provider: "JIRA" });
  const isConnected = !!integration;
  const metadata = (integration?.metadata ?? null) as Record<string, unknown> | null;

  const tasks = isConnected
    ? (await trpc.task.list.query({ source: "JIRA", limit: 200 })).items
    : [];

  return (
    <JiraClient
      isConnected={isConnected}
      workspaceId={ws.id}
      siteName={(metadata?.siteName as string) ?? null}
      siteUrl={(metadata?.siteUrl as string) ?? null}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        externalUrl: t.externalUrl,
        metadata: t.metadata as Record<string, unknown> | null,
        updatedAt: t.updatedAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      }))}
    />
  );
}
