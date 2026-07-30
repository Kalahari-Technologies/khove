"use client";

import { Layers } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

/** Epic progress — done/total per epic with a mini progress bar. */
export function JiraEpicsWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.epics.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const epics = (data ?? []).slice(0, 6);
  if (epics.length === 0) return <WEmpty icon={<Layers size={18} />}>No epics found.</WEmpty>;

  return (
    <div className="space-y-2.5">
      {epics.map((e) => {
        const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
        return (
          <div key={e.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <a
                href={e.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[12px] text-white/80 hover:text-white"
              >
                {e.name}
              </a>
              <span className="shrink-0 text-[10.5px] tabular-nums text-white/40">
                {e.done}/{e.total} · {pct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-indigo-500/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
