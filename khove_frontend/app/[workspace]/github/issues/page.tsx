import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";

type GhMeta = { type?: string; repo?: string; number?: number; author?: string; labels?: string[] };

export default async function GithubIssuesPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const trpc = await serverTRPC(ws.id);
  const connected = !!(await trpc.integration.get.query({ provider: "GITHUB" }).catch(() => null));
  if (!connected) return <ConnectNotice tool="GitHub" href={`/${slug}/github`} />;

  const tasks = (await trpc.task.list.query({ source: "GITHUB", limit: 200 })).items;
  const rows = tasks
    .map((t) => ({ t, g: ((t.metadata as { github?: GhMeta } | null)?.github) ?? {} }))
    .filter(({ g }) => g.type === "issue")
    .map(({ t, g }) => ({
      id: t.id,
      number: g.number,
      title: t.title.replace(/^Issue #\d+:\s*/, ""),
      repo: g.repo ?? "",
      author: g.author ?? "",
      labels: Array.isArray(g.labels) ? g.labels : [],
      url: t.externalUrl,
    }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-[16px] font-semibold text-white">Issues</h1>
          <span className="text-[12px] text-white/35">{rows.length} open</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] py-12 text-center text-[13px] text-white/30">No open issues.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const inner = (
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition-colors hover:bg-white/[0.04]">
                  <span className="font-mono text-[11px] text-white/35">#{r.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-white/85">{r.title}</div>
                    <div className="mt-0.5 text-[11px] text-white/35">{r.repo}{r.author ? ` · ${r.author}` : ""}</div>
                  </div>
                  <div className="hidden flex-wrap gap-1 sm:flex">
                    {r.labels.slice(0, 3).map((l) => (
                      <span key={l} className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/45">{l}</span>
                    ))}
                  </div>
                </div>
              );
              return r.url ? (
                <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block">{inner}</a>
              ) : (
                <div key={r.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
