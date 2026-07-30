"use client";

import { Users } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { BreakdownList } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, metaKey } from "./_kit";

/** Open Jira issues per assignee — the current work-in-flight load across the team. */
export function JiraTeamWorkloadWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "JIRA", limit: 200 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={120} />;

  const counts = new Map<string, number>();
  for (const t of data?.items ?? []) {
    const cat = t.status?.category;
    if (cat === "DONE" || cat === "CANCELLED") continue;
    const assignee = metaKey(t.metadata, "jira").assignee as
      | { displayName?: string }
      | null
      | undefined;
    const label = assignee?.displayName?.trim() || "Unassigned";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0)
    return <WEmpty icon={<Users size={18} />}>No open Jira issues.</WEmpty>;

  return <BreakdownList rows={rows} color="rgb(56,189,248)" emptyLabel="No open Jira issues" />;
}
