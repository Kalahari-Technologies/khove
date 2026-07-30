"use client";

import { CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Chip } from "@/components/integrations/insight-ui";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, metaKey } from "./_kit";

function timeOf(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Upcoming calendar agenda — the next few meetings. */
export function CalendarAgendaWidget(_props: WidgetProps) {
  const { data, isLoading } = trpc.task.list.useQuery(
    { hasDueDate: true, limit: 60 },
    { staleTime: 60_000 },
  );

  if (isLoading) return <WLoading height={140} />;

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const rows = (data?.items ?? [])
    .filter((t) => t.source.includes("GOOGLE_CALENDAR") && t.dueDate && new Date(t.dueDate) >= start)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 7);

  if (rows.length === 0) return <WEmpty icon={<CalendarDays size={18} />}>No upcoming meetings</WEmpty>;

  return (
    <ul className="space-y-1.5">
      {rows.map((t) => {
        const cal = metaKey(t.metadata, "googleCalendar");
        const meetLink = cal.meetLink as string | undefined;
        const when = new Date(t.dueDate!);
        return (
          <li key={t.id} className="flex items-center gap-2.5">
            <span className="w-14 shrink-0 text-[11px] tabular-nums text-white/45">{timeOf(when)}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{t.title}</span>
            {meetLink ? (
              <a href={meetLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                <Chip tone="accent">Meet</Chip>
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
