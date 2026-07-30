"use client";

import { SignalHigh } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { DistributionBar } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, metaKey } from "./_kit";

/** Fixed severity order + a neutral "None" bucket, each with a deliberate accent. */
const PRIORITIES: { label: string; color: string }[] = [
  { label: "Highest", color: "#ef4444" },
  { label: "High", color: "#f97316" },
  { label: "Medium", color: "#eab308" },
  { label: "Low", color: "#3b82f6" },
  { label: "Lowest", color: "rgba(255,255,255,0.35)" },
  { label: "None", color: "rgba(255,255,255,0.15)" },
];

/** Jira issues bucketed by priority, highest → lowest. */
export function JiraPriorityWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "JIRA", limit: 200 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={120} />;

  const counts = new Map<string, number>();
  for (const t of data?.items ?? []) {
    const p = metaKey(t.metadata, "jira").priority;
    const label = typeof p === "string" && p ? p : "None";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const segments = PRIORITIES.map((p) => ({
    label: p.label,
    value: counts.get(p.label) ?? 0,
    color: p.color,
  })).filter((s) => s.value > 0);

  if (segments.length === 0)
    return <WEmpty icon={<SignalHigh size={18} />}>No Jira issues.</WEmpty>;

  return <DistributionBar segments={segments} />;
}
