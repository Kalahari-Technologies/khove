"use client";

import { CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { ProviderIcon } from "@/components/provider-icon";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, WFill, metaKey } from "./_kit";

function timeOf(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface Row {
  id: string;
  at: number;
  title: string;
  allDay: boolean;
  meetLink?: string;
}

/** Today's schedule — meetings and calendar entries happening today. */
export function CalendarTodayWidget(_props: WidgetProps) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);

  const entries = trpc.calendarEntry.list.useQuery({ from: start, to: end }, { staleTime: 60_000 });
  const tasks = trpc.task.list.useQuery({ hasDueDate: true, source: "GOOGLE_CALENDAR", limit: 100 }, { staleTime: 60_000 });

  if (entries.isLoading || tasks.isLoading) return <WLoading height={140} />;

  const rows: Row[] = [];
  for (const e of entries.data ?? []) {
    const at = new Date(e.startDate);
    if (at >= start && at < end) rows.push({ id: `e-${e.id}`, at: at.getTime(), title: e.title, allDay: e.isAllDay });
  }
  for (const t of tasks.data?.items ?? []) {
    if (!t.dueDate) continue;
    const at = new Date(t.dueDate);
    if (at >= start && at < end) {
      const cal = metaKey(t.metadata, "googleCalendar");
      rows.push({ id: `t-${t.id}`, at: at.getTime(), title: t.title, allDay: !!cal.isAllDay, meetLink: cal.meetLink as string | undefined });
    }
  }
  rows.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.at - b.at);

  if (rows.length === 0) return <WEmpty icon={<CalendarDays size={18} />}>Nothing on today.</WEmpty>;

  return (
    <WFill provider="google_calendar">
      <ul className="space-y-1.5">
        {rows.slice(0, 10).map((r) => (
          <li key={r.id} className="flex items-center gap-2.5">
            <span className="w-14 shrink-0 text-[11px] tabular-nums text-white/45">{r.allDay ? "All day" : timeOf(new Date(r.at))}</span>
            <span className="flex w-4 shrink-0 items-center justify-center">
              {r.meetLink ? (
                <a href={r.meetLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Join Google Meet">
                  <ProviderIcon provider="google_meet" size={15} />
                </a>
              ) : (
                <ProviderIcon provider="google_calendar" size={13} className="opacity-60" title="Calendar" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{r.title}</span>
          </li>
        ))}
      </ul>
    </WFill>
  );
}
