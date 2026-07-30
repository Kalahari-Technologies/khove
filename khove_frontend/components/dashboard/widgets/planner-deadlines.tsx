"use client";

import { CalendarClock } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";

const SOURCE_DOT: Record<string, string> = {
  GOOGLE_CALENDAR: "#F43F5E",
  GITHUB: "#10B981",
  JIRA: "#6366F1",
  KHOVE: "rgba(255,255,255,0.4)",
};

const DAY = 86_400_000;

/** Relative day label, e.g. "Today", "Tomorrow", "in 4d", or a weekday/date. */
export function relDay(d: Date): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - start.getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 6) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const isClosed = (cat?: string | null) => cat === "DONE" || cat === "CANCELLED";
export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Upcoming deadlines — dated, still-open tasks across all tools, soonest first. */
export function PlannerDeadlinesWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery({ hasDueDate: true, limit: 100 }, { staleTime: 60_000 });
  if (isLoading) return <WLoading height={140} />;

  const today = startOfToday();
  const rows = (data?.items ?? [])
    .filter((t) => t.dueDate && new Date(t.dueDate) >= today && !isClosed(t.status?.category))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 8);

  if (rows.length === 0) return <WEmpty icon={<CalendarClock size={18} />}>No upcoming deadlines</WEmpty>;

  return (
    <ul className="space-y-1.5">
      {rows.map((t) => {
        const src = t.source[0] ?? "KHOVE";
        return (
          <li key={t.id} className="flex items-center gap-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_DOT[src] ?? SOURCE_DOT.KHOVE }} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{t.title}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-white/40">{relDay(new Date(t.dueDate!))}</span>
          </li>
        );
      })}
    </ul>
  );
}
