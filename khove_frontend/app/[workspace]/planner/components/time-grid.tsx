"use client";

import { useEffect, useRef } from "react";
import {
  HOUR_HEIGHT,
  HOURS,
  formatHourLabel,
  isToday,
  toDateKey,
  layoutOverlappingEvents,
  type TimeSlotItem,
} from "../lib/time-utils";
import { TimeEventBlock } from "./time-event-block";

interface TimeGridProps {
  /** Array of day columns to render. */
  days: Date[];
  /** All items for the visible date range (will be filtered per column). */
  items: TimeSlotItem[];
}

export function TimeGrid({ days, items }: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to ~7 AM on mount (or current time if today is visible)
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const hasToday = days.some((d) => isToday(d));
    const scrollHour = hasToday ? Math.max(now.getHours() - 1, 0) : 7;
    scrollRef.current.scrollTop = scrollHour * HOUR_HEIGHT;
  }, [days]);

  const isSingleColumn = days.length === 1;

  // Group timed items by date key
  const itemsByDate: Record<string, TimeSlotItem[]> = {};
  for (const item of items) {
    if (item.isAllDay) continue;
    const key = toDateKey(item.start);
    if (!itemsByDate[key]) itemsByDate[key] = [];
    itemsByDate[key].push(item);
  }

  // Layout overlaps per day
  for (const key of Object.keys(itemsByDate)) {
    itemsByDate[key] = layoutOverlappingEvents(itemsByDate[key]);
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-0">
        {/* Hour gutter */}
        <div className="flex-shrink-0 w-[54px]">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-2 text-[10px] text-white/25 font-medium"
              style={{ height: HOUR_HEIGHT }}
            >
              {h > 0 ? formatHourLabel(h) : ""}
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div
          className="flex-1 grid"
          style={{
            gridTemplateColumns: isSingleColumn ? "1fr" : `repeat(${days.length}, 1fr)`,
          }}
        >
          {days.map((day, colIdx) => {
            const key = toDateKey(day);
            const dayItems = itemsByDate[key] ?? [];
            const todayCol = isToday(day);

            return (
              <div
                key={key}
                className={[
                  "relative",
                  !isSingleColumn && colIdx < days.length - 1 ? "border-r border-white/[0.05]" : "",
                ].join(" ")}
              >
                {/* Hour grid lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-b border-white/[0.05]"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {/* Current time indicator */}
                {todayCol && <NowIndicator />}

                {/* Events */}
                {dayItems.map((item) => (
                  <TimeEventBlock key={item.id} item={item} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowIndicator() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 60) * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-[1.5px] bg-red-500" />
      </div>
    </div>
  );
}
