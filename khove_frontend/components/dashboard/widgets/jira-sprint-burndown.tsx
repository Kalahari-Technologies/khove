"use client";

import { trpc } from "@/lib/trpc/client";
import { Burndown } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Active-sprint burndown: remaining vs. ideal. */
export function JiraSprintBurndownWidget(_props: WidgetProps) {
  const sprints = trpc.metrics.sprints.useQuery(undefined, { staleTime: 60_000 });

  const list = sprints.data ?? [];
  const active = list.find((s) => s.state === "active") ?? list[0];
  const sprintName = active?.name;

  const burndown = trpc.metrics.sprintBurndown.useQuery(
    { sprintName: sprintName ?? "" },
    { staleTime: 60_000, enabled: !!sprintName },
  );

  if (sprints.isLoading) return <WLoading height={170} />;
  if (!active) return <WEmpty>No active sprint.</WEmpty>;
  if (burndown.isLoading) return <WLoading height={170} />;
  if (!burndown.data) return <WEmpty>No burndown data for this sprint.</WEmpty>;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-white/80">{active.name}</span>
        <span className="shrink-0 text-[10.5px] text-white/40">{active.daysRemaining}d left</span>
      </div>
      <Burndown committed={burndown.data.committed} series={burndown.data.series} />
    </div>
  );
}
