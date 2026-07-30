"use client";

import { trpc } from "@/lib/trpc/client";
import { BreakdownList } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, metaKey } from "./_kit";

/** Open-PR review load per requested reviewer. */
export function GithubReviewLoadWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "GITHUB", limit: 100 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={120} />;

  const counts = new Map<string, number>();
  for (const t of data?.items ?? []) {
    const gh = metaKey(t.metadata, "github");
    if (gh.type !== "pull_request") continue;
    const reviewers = Array.isArray(gh.requestedReviewers) ? (gh.requestedReviewers as string[]) : [];
    for (const r of reviewers) counts.set(r, (counts.get(r) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return <BreakdownList rows={rows} emptyLabel="No reviewers requested." max={8} />;
}
