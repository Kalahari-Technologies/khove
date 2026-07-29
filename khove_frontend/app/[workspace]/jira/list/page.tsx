import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";

type JiraMeta = {
  issueKey?: string;
  issueType?: string;
  status?: string;
  statusCategory?: string;
  priority?: string;
  epic?: { name?: string; key?: string };
};

const CAT_COLOR: Record<string, string> = { NOT_STARTED: "#64748b", IN_PROGRESS: "#3b82f6", DONE: "#10b981" };

export default async function JiraListPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const connected = !!(await trpc.integration.get.query({ provider: "JIRA" }).catch(() => null));
  if (!connected) return <ConnectNotice tool="Jira" href={`/${slug}/jira`} />;

  const tasks = (await trpc.task.list.query({ source: "JIRA", limit: 200 })).items;
  const rows = tasks
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-[16px] font-semibold text-white">Issues</h1>
          <span className="text-[12px] text-white/35">{rows.length}</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-white/35">
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Epic</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Priority</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-white/45">{r.key}</td>
                  <td className="px-3 py-2 text-[13px] text-white/85">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="hover:text-white">{r.title}</a>
                    ) : (
                      r.title
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-[12px] text-white/50 sm:table-cell">{r.type}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-[12px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CAT_COLOR[r.category] ?? "#64748b" }} />
                      <span className="text-white/70">{r.status}</span>
                    </span>
                  </td>
                  <td className="hidden max-w-[180px] truncate px-3 py-2 text-[12px] text-white/50 md:table-cell">{r.epic ?? "—"}</td>
                  <td className="hidden px-3 py-2 text-[12px] text-white/50 sm:table-cell">{r.priority || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
