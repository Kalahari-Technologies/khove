"use client";

import { CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { ProviderIcon } from "@/components/provider-icon";
import type { WidgetProps } from "@/components/dashboard/widget-types";
import { WLoading, WEmpty, WFill, metaKey } from "./_kit";

function whenLabel(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
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
    <WFill provider="google_calendar">
      <ul className="space-y-1.5">
        {rows.map((t) => {
        const cal = metaKey(t.metadata, "googleCalendar");
        const meetLink = cal.meetLink as string | undefined;
        const when = new Date(t.dueDate!);
        return (
          <li key={t.id} className="flex items-center gap-2.5">
            <span className="w-20 shrink-0 text-[11px] tabular-nums text-white/45">{whenLabel(when)}</span>
            <span className="flex w-4 shrink-0 items-center justify-center">
              {meetLink ? (
                <a href={meetLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Join Google Meet">
                  <ProviderIcon provider="google_meet" size={15} />
                </a>
              ) : (
                <ProviderIcon provider="google_calendar" size={13} className="opacity-60" title="Calendar" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{t.title}</span>
          </li>
        );
        })}
      </ul>
    </WFill>
  );
}
