"use client";

import { TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { StackedBar } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, WNarrative } from "./_kit";

/** Sprint velocity — committed vs. completed points across closed sprints. */
export function JiraVelocityWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.sprints.useQuery(undefined, { staleTime: 60_000 });

  // Server-cached AI reading (regenerated only when the closed-sprint data changes).
  const narrative = trpc.metrics.velocityNarrative.useQuery(undefined, {
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <WLoading height={140} />;

  const rows = (data ?? [])
    .filter((s) => s.state === "closed" && s.hasPoints)
    .map((s) => ({
      sprint: s.name,
      committedPoints: s.committedPoints,
      donePoints: s.donePoints,
    }));

  if (rows.length === 0) return <WEmpty icon={<TrendingUp size={18} />}>No completed sprints with points.</WEmpty>;

  return (
    <div>
      <StackedBar
        data={rows}
        xKey="sprint"
        keys={[
          { key: "committedPoints", name: "Committed", color: "rgba(255,255,255,0.22)" },
          { key: "donePoints", name: "Completed", color: "rgb(99,102,241)" },
        ]}
      />
      <WNarrative text={narrative.data?.text} />
    </div>
  );
}
