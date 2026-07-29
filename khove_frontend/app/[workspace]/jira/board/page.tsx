import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";

type JiraMeta = {
  issueKey?: string;
  issueType?: string;
  status?: string;
  statusCategory?: string;
  epic?: { name?: string; key?: string };
};

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "NOT_STARTED", label: "To Do", color: "#64748b" },
  { key: "IN_PROGRESS", label: "In Progress", color: "#3b82f6" },
  { key: "DONE", label: "Done", color: "#10b981" },
];

export default async function JiraBoardPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const connected = !!(await trpc.integration.get.query({ provider: "JIRA" }).catch(() => null));
  if (!connected) return <ConnectNotice tool="Jira" href={`/${slug}/jira`} />;

  const tasks = (await trpc.task.list.query({ source: "JIRA", limit: 200 })).items;
  const cards = tasks.map((t) => {
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = cards.filter((c) => c.category === col.key);
            return (
              <div key={col.key} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-[12.5px] font-semibold text-white/80">{col.label}</span>
                  <span className="text-[11px] text-white/35">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((c) => {
                    const card = (
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/[0.05]">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[10.5px] text-white/40">{c.key}</span>
                          {c.type && <span className="text-[10px] text-white/30">{c.type}</span>}
                        </div>
                        <div className="text-[12.5px] leading-snug text-white/85">{c.title}</div>
                        {c.epic && (
                          <div className="mt-1.5 inline-block rounded border border-indigo-400/20 bg-indigo-400/[0.08] px-1.5 py-0.5 text-[10px] text-indigo-300/80">
                            {c.epic}
                          </div>
                        )}
                      </div>
                    );
                    return c.url ? (
                      <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="block">{card}</a>
                    ) : (
                      <div key={c.id}>{card}</div>
                    );
                  })}
                  {items.length === 0 && <div className="px-1 py-4 text-center text-[11.5px] text-white/25">Nothing here.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
