"use client";

import { TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { BarTrend } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, WStat } from "./_kit";

/** GitHub merge throughput per week. */
export function GithubThroughputWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.flow.useQuery({ provider: "GITHUB" }, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={150} />;
  if (!data) return <WEmpty icon={<TrendingUp size={18} />}>No GitHub activity yet.</WEmpty>;

  const perWeek = Math.round((data.throughputPerWeek ?? 0) * 10) / 10;
  return (
    <div>
      <WStat value={perWeek} label="merges/wk" />
      <BarTrend points={data.throughputSeries ?? []} />
    </div>
  );
}
