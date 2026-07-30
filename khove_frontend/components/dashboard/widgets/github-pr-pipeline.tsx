"use client";

import { trpc } from "@/lib/trpc/client";
import { Donut } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, metaKey } from "./_kit";

/** Triage all open PRs into pipeline buckets and render a donut. */
export function GithubPrPipelineWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "GITHUB", limit: 100 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={150} />;

  const prs = (data?.items ?? []).filter((t) => metaKey(t.metadata, "github").type === "pull_request");
  if (prs.length === 0) return <WEmpty>No open pull requests.</WEmpty>;

  const buckets = { draft: 0, ci: 0, changes: 0, ready: 0, noReviewer: 0, review: 0 };
  for (const t of prs) {
    const gh = metaKey(t.metadata, "github");
    const reviewers = Array.isArray(gh.requestedReviewers) ? (gh.requestedReviewers as string[]) : [];
    if (gh.isDraft) buckets.draft++;
    else if (gh.ciStatus === "failure") buckets.ci++;
    else if (gh.reviewDecision === "changes_requested") buckets.changes++;
    else if (gh.reviewDecision === "approved") buckets.ready++;
    else if (reviewers.length === 0) buckets.noReviewer++;
    else buckets.review++;
  }

  const data2 = [
    { name: "Draft", value: buckets.draft },
    { name: "CI failing", value: buckets.ci },
    { name: "Changes requested", value: buckets.changes },
    { name: "Approved, ready", value: buckets.ready },
    { name: "No reviewer", value: buckets.noReviewer },
    { name: "Awaiting review", value: buckets.review },
  ].filter((d) => d.value > 0);

  return <Donut data={data2} centerLabel="open PRs" />;
}
