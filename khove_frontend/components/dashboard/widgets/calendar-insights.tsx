"use client";

import { CalendarClock, Coffee, TriangleAlert, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

const SEVERITY: Record<string, string> = {
  info: "text-white/50",
  warning: "text-amber-300",
  critical: "text-red-300",
};

function typeIcon(type: string) {
  if (type === "conflict") return <TriangleAlert size={13} />;
  if (type === "focus_gap") return <Coffee size={13} />;
  if (type === "overload") return <CalendarClock size={13} />;
  return <Sparkles size={13} />;
}

/** Schedule insights — conflicts, focus gaps and overload for the next 2 weeks. */
export function CalendarInsightsWidget(_props: WidgetProps) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 14 * 86_400_000);

  const { data, isLoading } = trpc.insight.getForRange.useQuery({ from, to }, { staleTime: 60_000 });
  if (isLoading) return <WLoading height={140} />;

  const rows = (data ?? []).slice(0, 8);
  if (rows.length === 0) return <WEmpty icon={<Sparkles size={18} />}>Your schedule looks clear.</WEmpty>;

  return (
    <ul className="space-y-2">
      {rows.map((i) => (
        <li key={i.id} className="flex items-start gap-2.5">
          <span className={`mt-0.5 shrink-0 ${SEVERITY[i.severity] ?? "text-white/50"}`}>{typeIcon(i.type)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-white/80">{i.title}</p>
            <p className="truncate text-[11px] text-white/40">{i.detail}</p>
          </div>
          <span className="shrink-0 text-[10.5px] tabular-nums text-white/35">
            {new Date(i.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
