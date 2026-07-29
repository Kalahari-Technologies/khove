import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";
import { JiraBoardClient, type BoardCard } from "./board-client";

type JiraMeta = {
  issueKey?: string;
  issueType?: string;
  status?: string;
  statusCategory?: string;
  epic?: { name?: string; key?: string };
};

export default async function JiraBoardPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const connected = !!(await trpc.integration.get.query({ provider: "JIRA" }).catch(() => null));
  if (!connected) return <ConnectNotice tool="Jira" href={`/${slug}/jira`} />;

  const tasks = (await trpc.task.list.query({ source: "JIRA", limit: 200 })).items;
  const cards: BoardCard[] = tasks.map((t) => {
    const j = ((t.metadata as { jira?: JiraMeta } | null)?.jira) ?? {};
    return {
      id: t.id,
      key: j.issueKey ?? "",
      title: t.title.replace(/^\[[^\]]+\]\s*/, ""),
      type: j.issueType ?? "",
      category: j.statusCategory ?? "NOT_STARTED",
      epic: j.epic?.name ?? j.epic?.key,
      url: t.externalUrl,
    };
  });

  return <JiraBoardClient cards={cards} />;
}
