"use client";

import { Milestone } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { DistributionBar, ago } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Top GitHub milestones by open item count, with done/open progress. */
export function GithubMilestonesWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.githubMilestones.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const rows = [...(data ?? [])].sort((a, b) => b.open - a.open).slice(0, 5);
  if (rows.length === 0) return <WEmpty icon={<Milestone size={18} />}>No open milestones.</WEmpty>;

  return (
    <div className="space-y-3">
      {rows.map((m) => (
        <div key={m.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <a
              href={m.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="truncate text-[12px] font-medium text-white/80 hover:text-white"
            >
              {m.name}
            </a>
            <span className="shrink-0 text-[10.5px] text-white/35">
              {m.repo}
              {m.dueOn ? ` · ${ago(m.dueOn)}` : ""}
            </span>
          </div>
          <DistributionBar
            segments={[
              { label: "Done", value: m.closed, color: "rgb(99,102,241)" },
              { label: "Open", value: m.open, color: "rgba(255,255,255,0.16)" },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
