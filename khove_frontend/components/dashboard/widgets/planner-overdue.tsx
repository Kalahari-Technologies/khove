"use client";

import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";
import { relDay, startOfToday } from "./planner-deadlines";

const isClosed = (cat?: string | null) => cat === "DONE" || cat === "CANCELLED";

/** Overdue tasks — dated, still-open tasks whose due date has passed. */
export function PlannerOverdueWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery({ hasDueDate: true, limit: 100 }, { staleTime: 60_000 });
  if (isLoading) return <WLoading height={140} />;

  const today = startOfToday();
  const rows = (data?.items ?? [])
    .filter((t) => t.dueDate && new Date(t.dueDate) < today && !isClosed(t.status?.category))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 8);

  if (rows.length === 0) return <WEmpty icon={<AlertTriangle size={18} />}>Nothing overdue 🎉</WEmpty>;

  return (
    <ul className="space-y-1.5">
      {rows.map((t) => (
        <li key={t.id} className="flex items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{t.title}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-red-300/80">{relDay(new Date(t.dueDate!))}</span>
        </li>
      ))}
    </ul>
  );
}
