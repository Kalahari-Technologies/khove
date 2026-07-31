import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { AgentFeed } from "./agent-feed";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;

  const base = await serverTRPC();
  const me = await base.workspace.me.query().catch(() => null);
  if (!me) redirect("/login");
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const actions = await trpc.agentAction.list.query().catch(() => []);

  return (
    <AgentFeed
      actions={actions.map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        title: a.title,
        rationale: a.rationale,
        confidence: a.confidence,
        error: a.error,
        buttons: a.buttons,
      }))}
    />
  );
}
