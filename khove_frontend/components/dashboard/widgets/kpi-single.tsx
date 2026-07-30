"use client";

import { Gauge } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { KpiCardView } from "@/components/dashboard/widgets/kpi-row";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

type Provider = "github" | "jira" | "all";

/** A single hero KPI card, chosen by `settings.metricKey`. */
export function KpiSingleWidget({ settings }: WidgetProps) {
  const provider = (settings.provider as Provider) ?? "all";
  const windowDays = (settings.windowDays as number) ?? 28;
  const metricKey = settings.metricKey as string | undefined;

  const { data, isLoading } = trpc.metrics.kpis.useQuery(
    { provider, windowDays },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={86} />;

  const cards = data?.cards ?? [];
  if (cards.length === 0) return <WEmpty icon={<Gauge size={18} />}>Not enough activity yet.</WEmpty>;

  const card = cards.find((c) => c.key === metricKey) ?? cards[0];
  return <KpiCardView card={card} windowDays={data?.windowDays ?? windowDays} />;
}
