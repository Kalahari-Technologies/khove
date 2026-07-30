"use client";

import { PieChart } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Donut } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, metaKey } from "./_kit";

/** Jira issues bucketed by status category. */
export function JiraStatusDistributionWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "JIRA", limit: 200 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={150} />;

  const buckets = { todo: 0, inProgress: 0, done: 0 };
  for (const t of data?.items ?? []) {
    const cat = metaKey(t.metadata, "jira").statusCategory;
    if (cat === "DONE") buckets.done++;
    else if (cat === "IN_PROGRESS") buckets.inProgress++;
    else buckets.todo++;
  }

  const all = [
    { name: "To Do", value: buckets.todo, color: "rgba(255,255,255,0.28)" },
    { name: "In Progress", value: buckets.inProgress, color: "rgba(255,255,255,0.55)" },
    { name: "Done", value: buckets.done, color: "rgb(99,102,241)" },
  ].filter((d) => d.value > 0);

  if (all.length === 0) return <WEmpty icon={<PieChart size={18} />}>No Jira issues.</WEmpty>;

  return (
    <Donut
      data={all.map(({ name, value }) => ({ name, value }))}
      centerLabel="issues"
      colors={all.map((d) => d.color)}
    />
  );
}
