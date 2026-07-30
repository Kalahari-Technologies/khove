"use client";

import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Compact table of active repos with open PR / issue counts. */
export function GithubReposWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.githubRepos.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const repos = (data ?? []).slice(0, 12);
  if (repos.length === 0) return <WEmpty>No repositories synced.</WEmpty>;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wide text-white/30">
        <span className="min-w-0 flex-1">Repo</span>
        <span className="w-14 text-right">Lang</span>
        <span className="w-14 text-right">PRs</span>
        <span className="w-14 text-right">Issues</span>
      </div>
      {repos.map((r) => (
        <a
          key={r.fullName}
          href={r.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-white/[0.03]"
        >
          <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">{r.fullName.split("/").pop()}</span>
          <span className="w-14 truncate text-right text-[10.5px] text-white/35">{r.language ?? "—"}</span>
          <span className="w-14 text-right text-[12px] tabular-nums text-white/70">{r.openPrs}</span>
          <span className="w-14 text-right text-[12px] tabular-nums text-white/70">{r.openIssues}</span>
        </a>
      ))}
    </div>
  );
}
