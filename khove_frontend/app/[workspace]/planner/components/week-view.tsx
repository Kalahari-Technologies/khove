"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";
import {
  getWeekDays,
  taskToTimeSlot,
  entryToTimeSlot,
  isSameDay,
  isToday,
  toDateKey,
  MONTH_SHORT,
  DAY_NAMES_SHORT,
  HOUR_HEIGHT,
  HOURS,
  formatHourLabel,
  layoutOverlappingEvents,
  type TimeSlotItem,
} from "../lib/time-utils";
import type { ColorBy } from "../lib/calendar-colors";
import { TimeEventBlock } from "./time-event-block";

interface WeekViewProps {
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  colorBy?: ColorBy;
}

const WEEKS_BUFFER = 8;

function getWeeksAround(anchor: Date): Date[][] {
  const weeks: Date[][] = [];
  for (let i = -WEEKS_BUFFER; i <= WEEKS_BUFFER; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i * 7);
    weeks.push(getWeekDays(d));
  }
  return weeks;
}

export function WeekView({ tasks, calendarEntries, colorBy = "source" }: WeekViewProps) {
  const today = new Date();
  const gridRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const weeks = getWeeksAround(today);
  const [visibleWeekIdx, setVisibleWeekIdx] = useState(WEEKS_BUFFER);

  const visibleWeek = weeks[visibleWeekIdx];
  const firstDay = visibleWeek[0];
  const lastDay = visibleWeek[6];

  // Convert all items
  const allItems: TimeSlotItem[] = [
    ...tasks.map((t) => taskToTimeSlot(t, colorBy)),
    ...calendarEntries.map(entryToTimeSlot),
  ];

  // Group items by date
  const itemsByDate: Record<string, TimeSlotItem[]> = {};
  const allDayByDate: Record<string, TimeSlotItem[]> = {};
  for (const item of allItems) {
    const key = toDateKey(item.start);
    if (item.isAllDay) {
      if (!allDayByDate[key]) allDayByDate[key] = [];
      allDayByDate[key].push(item);
    } else {
      if (!itemsByDate[key]) itemsByDate[key] = [];
      itemsByDate[key].push(item);
    }
  }
  for (const key of Object.keys(itemsByDate)) {
    itemsByDate[key] = layoutOverlappingEvents(itemsByDate[key]);
  }

  // Title
  const sameMonth = firstDay.getMonth() === lastDay.getMonth();
  const title = sameMonth
    ? `${MONTH_SHORT[firstDay.getMonth()]} ${firstDay.getDate()} – ${lastDay.getDate()}, ${firstDay.getFullYear()}`
    : `${MONTH_SHORT[firstDay.getMonth()]} ${firstDay.getDate()} – ${MONTH_SHORT[lastDay.getMonth()]} ${lastDay.getDate()}, ${lastDay.getFullYear()}`;

  const visibleAllDay = visibleWeek.some((d) => (allDayByDate[toDateKey(d)] ?? []).length > 0);

  // Scroll handler — sync gutter + track visible week
  const handleScroll = useCallback(() => {
    if (!gridRef.current) return;
    const el = gridRef.current;
    // Sync hour gutter vertical scroll
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    // Track visible week
    const pageWidth = el.clientWidth;
    const idx = Math.round(el.scrollLeft / pageWidth);
    setVisibleWeekIdx(Math.min(Math.max(idx, 0), weeks.length - 1));
  }, [weeks.length]);

  // Initial scroll
  useEffect(() => {
    if (!gridRef.current || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    const el = gridRef.current;
    el.scrollLeft = WEEKS_BUFFER * el.clientWidth;
    const now = new Date();
    el.scrollTop = Math.max(now.getHours() - 1, 0) * HOUR_HEIGHT;
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  }, []);

  function scrollToWeek(offset: number) {
    if (!gridRef.current) return;
    const el = gridRef.current;
    const target = (visibleWeekIdx + offset) * el.clientWidth;
    el.scrollTo({ left: target, behavior: "smooth" });
  }

  function goToday() {
    if (!gridRef.current) return;
    gridRef.current.scrollTo({ left: WEEKS_BUFFER * gridRef.current.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed nav bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0">
        <span className="text-[14px] font-semibold text-white">{title}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => scrollToWeek(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scrollToWeek(1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
            <ChevronRight size={14} />
          </button>
          <button onClick={goToday} className="px-2.5 py-1 rounded-lg border border-white/[0.10] text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors">
            Today
          </button>
        </div>
      </div>

      {/* Fixed day headers — shows 7 days of visible week */}
      <div className="flex shrink-0 border-b border-white/[0.06]">
        <div className="w-[54px] flex-shrink-0 border-r border-white/[0.06]" />
        <div className="flex-1 grid grid-cols-7">
          {visibleWeek.map((day, i) => {
            const todayCol = isToday(day);
            return (
              <div key={i} className={["flex flex-col items-center py-2", i < 6 ? "border-r border-white/[0.05]" : ""].join(" ")}>
                <span className={["text-[10px] uppercase tracking-wider font-medium", todayCol ? "text-white/70" : "text-white/30"].join(" ")}>
                  {DAY_NAMES_SHORT[day.getDay()]}
                </span>
                <span className={["flex items-center justify-center w-7 h-7 rounded-full text-[14px] font-semibold mt-0.5", todayCol ? "bg-white text-black" : "text-white/60"].join(" ")}>
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed all-day row — always visible */}
      <div className="flex shrink-0 border-b border-white/[0.06]">
        <div className="w-[54px] flex-shrink-0 flex items-center justify-end pr-2 border-r border-white/[0.06]">
          <span className="text-[9px] text-white/20 uppercase tracking-wider">All day</span>
        </div>
          <div className="flex-1 grid grid-cols-7">
            {visibleWeek.map((day, i) => {
              const items = allDayByDate[toDateKey(day)] ?? [];
              return (
                <div key={i} className={["py-1 px-1 min-h-[28px]", i < 6 ? "border-r border-white/[0.05]" : ""].join(" ")}>
                  {items.map((item) => (
                    <span key={item.id} className={["block text-[10px] font-medium truncate rounded px-1 py-0.5 mb-0.5", item.type === "entry" ? "bg-white/[0.04] text-white/35 italic" : "text-white/80"].join(" ")} style={item.type === "task" ? { backgroundColor: `${item.color}33` } : undefined}>
                      {item.title}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
      </div>

      {/* Body: fixed hour gutter + scrollable carousel (time grid only) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed hour gutter — syncs vertical scroll with grid */}
        <div ref={gutterRef} className="w-[54px] flex-shrink-0 overflow-hidden border-r border-white/[0.06]">
          {HOURS.map((h) => (
            <div key={h} className="flex items-start justify-end pr-2 text-[10px] text-white/25 font-medium" style={{ height: HOUR_HEIGHT }}>
              {h > 0 ? formatHourLabel(h) : ""}
            </div>
          ))}
        </div>

        {/* Carousel — snaps horizontally per week, scrolls vertically */}
        <div
          ref={gridRef}
          className="flex-1 overflow-auto"
          style={{ scrollSnapType: "x mandatory" }}
          onScroll={handleScroll}
        >
          <div className="flex" style={{ width: `${weeks.length * 100}%` }}>
            {weeks.map((week, wi) => (
              <div
                key={wi}
                className="flex-shrink-0"
                style={{ width: `${100 / weeks.length}%`, scrollSnapAlign: "start" }}
              >
                {/* 7 day columns — time grid only, no headers */}
                <div className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const key = toDateKey(day);
                    const dayItems = itemsByDate[key] ?? [];
                    const todayCol = isToday(day);
                    return (
                      <div key={key} className={["relative", di < 6 ? "border-r border-white/[0.05]" : ""].join(" ")}>
                        {HOURS.map((h) => (
                          <div key={h} className="border-b border-white/[0.05]" style={{ height: HOUR_HEIGHT }} />
                        ))}
                        {todayCol && <NowIndicator />}
                        {dayItems.map((item) => (
                          <TimeEventBlock key={item.id} item={item} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
