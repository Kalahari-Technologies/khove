"use client";

import { CheckCircle2, PlusCircle, CalendarClock, CircleDot } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { StatTile } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty } from "./_kit";
import { LayoutGrid } from "lucide-react";

const DAY = 86_400_000;

/** Compact at-a-glance grid: completed / created / due-soon / open Jira counts. */
export function JiraStatTilesWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { source: "JIRA", limit: 200 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={120} />;

  const items = data?.items ?? [];
  if (items.length === 0)
    return <WEmpty icon={<LayoutGrid size={18} />}>No Jira issues.</WEmpty>;

  const now = Date.now();
  let completed = 0;
  let created = 0;
  let dueSoon = 0;
  let open = 0;

  for (const t of items) {
    const cat = t.status?.category;
    const isDone = cat === "DONE";
    const isClosed = isDone || cat === "CANCELLED";

    if (isDone && t.updatedAt && now - +new Date(t.updatedAt) <= 7 * DAY) completed++;
    if (t.createdAt && now - +new Date(t.createdAt) <= 7 * DAY) created++;
    if (!isClosed) {
      open++;
      if (t.dueDate) {
        const due = +new Date(t.dueDate) - now;
        if (due >= 0 && due <= 7 * DAY) dueSoon++;
      }
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile label="Completed" value={completed} tone="good" icon={<CheckCircle2 size={13} />} hint="last 7 days" />
      <StatTile label="Created" value={created} tone="accent" icon={<PlusCircle size={13} />} hint="last 7 days" />
      <StatTile label="Due soon" value={dueSoon} tone="warn" icon={<CalendarClock size={13} />} hint="next 7 days" />
      <StatTile label="Open" value={open} tone="neutral" icon={<CircleDot size={13} />} hint="in flight" />
    </div>
  );
}
