"use client";

import { Timer } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { LineTrend, fmtHours } from "@/components/integrations/metric-charts";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, WStat } from "./_kit";

/** GitHub PR cycle time (open → merge), p50 trend. */
export function GithubCycleTimeWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.flow.useQuery({ provider: "GITHUB" }, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={150} />;
  if (!data) return <WEmpty icon={<Timer size={18} />}>No GitHub activity yet.</WEmpty>;

  return (
    <div>
      <WStat value={fmtHours(data.cycleTimeP50Hours ?? null)} label="median cycle" />
      <LineTrend points={data.cycleTimeSeries ?? []} format={fmtHours} />
    </div>
  );
}
