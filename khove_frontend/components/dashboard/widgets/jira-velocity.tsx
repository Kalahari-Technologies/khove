"use client";

import { trpc } from "@/lib/trpc/client";
import { StackedBar } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Sprint velocity — committed vs. completed points across closed sprints. */
export function JiraVelocityWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.sprints.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const rows = (data ?? [])
    .filter((s) => s.state === "closed" && s.hasPoints)
    .map((s) => ({
      sprint: s.name,
      committedPoints: s.committedPoints,
      donePoints: s.donePoints,
    }));

  if (rows.length === 0) return <WEmpty>No completed sprints with points.</WEmpty>;

  return (
    <StackedBar
      data={rows}
      xKey="sprint"
      keys={[
        { key: "committedPoints", name: "Committed", color: "rgba(255,255,255,0.22)" },
        { key: "donePoints", name: "Completed", color: "rgb(99,102,241)" },
      ]}
    />
  );
}
