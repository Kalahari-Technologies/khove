"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";
import {
  taskToTimeSlot,
  entryToTimeSlot,
  isToday,
  toDateKey,
  DAY_NAMES_SHORT,
  MONTH_NAMES,
  HOUR_HEIGHT,
  HOURS,
  formatHourLabel,
  layoutOverlappingEvents,
  type TimeSlotItem,
} from "../lib/time-utils";
import type { ColorBy } from "../lib/calendar-colors";
import { TimeEventBlock } from "./time-event-block";

interface DayViewProps {
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  colorBy?: ColorBy;
}

function getDaysRange(anchor: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

export function DayView({ tasks, calendarEntries, colorBy = "source" }: DayViewProps) {
  const today = new Date();
  const allDays = getDaysRange(today);
  const todayIndex = allDays.findIndex((d) => isToday(d));

  const gridRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const [visibleDayIdx, setVisibleDayIdx] = useState(todayIndex >= 0 ? todayIndex : 0);

  const visibleDay = allDays[visibleDayIdx];

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

  const todayVisible = isToday(visibleDay);
  const navTitle = `${MONTH_NAMES[visibleDay.getMonth()]} ${visibleDay.getFullYear()}`;
  const visibleAllDay = allDayByDate[toDateKey(visibleDay)] ?? [];

  // Scroll handler — sync gutter + track visible day
  const handleScroll = useCallback(() => {
    if (!gridRef.current) return;
    const el = gridRef.current;
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    const pageWidth = el.clientWidth;
    const idx = Math.round(el.scrollLeft / pageWidth);
    setVisibleDayIdx(Math.min(Math.max(idx, 0), allDays.length - 1));
  }, [allDays.length]);

  // Initial scroll to today
  useEffect(() => {
    if (!gridRef.current || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    const el = gridRef.current;
    el.scrollLeft = (todayIndex >= 0 ? todayIndex : 0) * el.clientWidth;
    const now = new Date();
    el.scrollTop = Math.max(now.getHours() - 1, 0) * HOUR_HEIGHT;
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  }, [todayIndex]);

  function scrollToDay(offset: number) {
    if (!gridRef.current) return;
    const el = gridRef.current;
    const target = (visibleDayIdx + offset) * el.clientWidth;
    el.scrollTo({ left: target, behavior: "smooth" });
  }

  function goToday() {
    if (!gridRef.current || todayIndex < 0) return;
    gridRef.current.scrollTo({ left: todayIndex * gridRef.current.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed nav bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0">
        <span className="text-[14px] font-semibold text-white">{navTitle}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => scrollToDay(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scrollToDay(1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
            <ChevronRight size={14} />
          </button>
          <button onClick={goToday} className="px-2.5 py-1 rounded-lg border border-white/[0.10] text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors">
            Today
          </button>
        </div>
      </div>

      {/* Fixed day header — horizontal inline: "Thu 20" */}
      <div className="flex shrink-0 border-b border-white/[0.06]">
        <div className="w-[54px] flex-shrink-0 border-r border-white/[0.06]" />
        <div className="flex-1 flex items-center justify-center gap-2 py-2">
          <span className={["text-[13px] font-medium", todayVisible ? "text-white/70" : "text-white/40"].join(" ")}>
            {DAY_NAMES_SHORT[visibleDay.getDay()]}
          </span>
          <span className={["flex items-center justify-center w-8 h-8 rounded-full text-[16px] font-semibold", todayVisible ? "bg-white text-black" : "text-white/60"].join(" ")}>
            {visibleDay.getDate()}
          </span>
        </div>
      </div>

      {/* Fixed all-day row — always visible */}
      <div className="flex shrink-0 border-b border-white/[0.06]">
        <div className="w-[54px] flex-shrink-0 flex items-center justify-end pr-2 border-r border-white/[0.06]">
          <span className="text-[9px] text-white/20 uppercase tracking-wider">All day</span>
        </div>
        <div className="flex-1 py-1 px-2 min-h-[28px]">
          {visibleAllDay.map((item) => (
            <span key={item.id} className={["block text-[10px] font-medium truncate rounded px-1.5 py-0.5 mb-0.5", item.type === "entry" ? "bg-white/[0.04] text-white/35 italic" : "text-white/80"].join(" ")} style={item.type === "task" ? { backgroundColor: `${item.color}33` } : undefined}>
              {item.title}
            </span>
          ))}
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

        {/* Carousel — snaps horizontally per day, scrolls vertically */}
        <div
          ref={gridRef}
          className="flex-1 overflow-auto"
          style={{ scrollSnapType: "x mandatory" }}
          onScroll={handleScroll}
        >
          <div className="flex" style={{ width: `${allDays.length * 100}%` }}>
            {allDays.map((day) => {
              const key = toDateKey(day);
              const dayItems = itemsByDate[key] ?? [];
              const todayCol = isToday(day);

              return (
                <div
                  key={key}
                  className="flex-shrink-0 border-r border-white/[0.08]"
                  style={{ width: `${100 / allDays.length}%`, scrollSnapAlign: "start" }}
                >
                  {/* Time grid only — no headers inside carousel */}
                  <div className="relative">
                    {HOURS.map((h) => (
                      <div key={h} className="border-b border-white/[0.05]" style={{ height: HOUR_HEIGHT }} />
                    ))}
                    {todayCol && <NowIndicator />}
                    {dayItems.map((item) => (
                      <TimeEventBlock key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
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
