"use client";

import { Layers } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

const DONE = "#10b981";
const IN_PROGRESS = "#3b82f6";
const TODO = "rgba(255,255,255,0.15)";

/** Per-epic delivery progress — a 3-segment Done / In-progress / To-do bar. */
export function JiraEpicProgressWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.metrics.epics.useQuery(undefined, { staleTime: 60_000 });

  if (isLoading) return <WLoading height={140} />;

  const epics = (data ?? []).slice(0, 6);
  if (epics.length === 0) return <WEmpty icon={<Layers size={18} />}>No epics found.</WEmpty>;

  return (
    <div className="space-y-3">
      {epics.map((e) => {
        const total = Math.max(e.total, 1);
        const todo = Math.max(e.total - e.done - e.inProgress, 0);
        const segs = [
          { key: "done", value: e.done, color: DONE },
          { key: "inProgress", value: e.inProgress, color: IN_PROGRESS },
          { key: "todo", value: todo, color: TODO },
        ];
        const pct = Math.round((e.done / total) * 100);
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
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              {segs.map((s) =>
                s.value > 0 ? (
                  <div
                    key={s.key}
                    style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                  />
                ) : null,
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
        {[
          { label: "Done", color: DONE },
          { label: "In progress", color: IN_PROGRESS },
          { label: "To do", color: TODO },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: l.color }} />
            <span className="text-[10.5px] text-white/45">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
