import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectionsClient } from "./connections-client";

// The Connectivity Cockpit — the cross-tool home. Where Jira + GitHub + Calendar
// meet, and where Khove flags when they disagree. Full-width; the client fetches
// everything via tRPC hooks (activity timeline, cross-tool gaps, scope integrity).
export default async function ConnectionsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const [github, jira] = await Promise.all([
    trpc.integration.get.query({ provider: "GITHUB" }).catch(() => null),
    trpc.integration.get.query({ provider: "JIRA" }).catch(() => null),
  ]);

  return (
    <ConnectionsClient
      workspaceId={ws.id}
      githubConnected={!!github}
      jiraConnected={!!jira}
    />
  );
}
