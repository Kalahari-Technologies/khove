"use client";

import { Shapes } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { BreakdownList } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, metaKey } from "./_kit";

/** Jira issues counted by issue type (Story / Bug / Task / …), ranked. */
export function JiraTypesWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "JIRA", limit: 200 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={120} />;

  const counts = new Map<string, number>();
  for (const t of data?.items ?? []) {
    const raw = metaKey(t.metadata, "jira").issueType;
    const label = typeof raw === "string" && raw ? raw : "Other";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0)
    return <WEmpty icon={<Shapes size={18} />}>No Jira issues.</WEmpty>;

  return <BreakdownList rows={rows} color="rgb(99,102,241)" emptyLabel="No Jira issues" />;
}
