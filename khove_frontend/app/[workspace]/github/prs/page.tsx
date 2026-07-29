import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ConnectNotice } from "@/components/integrations/connect-notice";

type GhMeta = {
  type?: string;
  repo?: string;
  number?: number;
  author?: string;
  isDraft?: boolean;
  reviewDecision?: string;
  ciStatus?: string;
};

const REVIEW: Record<string, { label: string; color: string }> = {
  approved: { label: "Approved", color: "#10b981" },
  changes_requested: { label: "Changes requested", color: "#f43f5e" },
  pending: { label: "Review pending", color: "#f59e0b" },
};
const CI: Record<string, { label: string; color: string }> = {
  success: { label: "CI ✓", color: "#10b981" },
  failure: { label: "CI ✗", color: "#f43f5e" },
  pending: { label: "CI …", color: "#71717a" },
};

export default async function GithubPrsPage({ params }: { params: Promise<{ workspace: string }> }) {
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
    .filter(({ g }) => g.type === "pull_request")
    .map(({ t, g }) => ({
      id: t.id,
      number: g.number,
      title: t.title.replace(/^PR #\d+:\s*/, ""),
      repo: g.repo ?? "",
      author: g.author ?? "",
      draft: !!g.isDraft,
      review: g.reviewDecision ?? "pending",
      ci: g.ciStatus ?? "pending",
      url: t.externalUrl,
    }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-6 py-6 xl:px-10">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-[16px] font-semibold text-white">Pull requests</h1>
          <span className="text-[12px] text-white/35">{rows.length} open</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] py-12 text-center text-[13px] text-white/30">No open pull requests.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const rv = REVIEW[r.review] ?? REVIEW.pending;
              const ci = CI[r.ci] ?? CI.pending;
              const inner = (
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition-colors hover:bg-white/[0.04]">
                  <span className="font-mono text-[11px] text-white/35">#{r.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-white/85">{r.title}</div>
                    <div className="mt-0.5 text-[11px] text-white/35">
                      {r.repo}
                      {r.author ? ` · ${r.author}` : ""}
                      {r.draft ? " · draft" : ""}
                    </div>
                  </div>
                  <span className="hidden text-[11px] sm:inline" style={{ color: rv.color }}>{rv.label}</span>
                  <span className="text-[11px]" style={{ color: ci.color }}>{ci.label}</span>
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
