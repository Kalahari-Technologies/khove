import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";
import { JiraListView, type JiraRow } from "./jira-list-view";

type JiraMeta = {
  issueKey?: string;
  issueType?: string;
  status?: string;
  statusCategory?: string;
  priority?: string;
  epic?: { name?: string; key?: string };
};

export default async function JiraListPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const connected = !!(await trpc.integration.get.query({ provider: "JIRA" }).catch(() => null));
  if (!connected) return <ConnectNotice tool="Jira" href={`/${slug}/jira`} />;

  const tasks = (await trpc.task.list.query({ source: "JIRA", limit: 200 })).items;
  const rows: JiraRow[] = tasks
    .map((t) => {
      const j = ((t.metadata as { jira?: JiraMeta } | null)?.jira) ?? {};
      return {
        id: t.id,
        key: j.issueKey ?? "",
        title: t.title.replace(/^\[[^\]]+\]\s*/, ""),
        type: j.issueType ?? "",
        status: j.status ?? "",
        category: j.statusCategory ?? "",
        epic: j.epic?.name ?? j.epic?.key,
        priority: j.priority ?? "",
        url: t.externalUrl,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

  return <JiraListView rows={rows} />;
}
