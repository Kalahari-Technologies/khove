"use client";

import { useEffect, useRef } from "react";
import { isToday, DAY_NAMES_SHORT } from "../lib/time-utils";

interface DayStripProps {
  days: Date[];
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

export function DayStrip({ days, selectedDate, onSelect }: DayStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to center the selected day
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = selectedRef.current;
      const offset = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: offset, behavior: "smooth" });
    }
  }, [selectedDate]);

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-1.5 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-white/[0.06] shrink-0"
    >
      {days.map((day) => {
        const today = isToday(day);
        const selected =
          day.getFullYear() === selectedDate.getFullYear() &&
          day.getMonth() === selectedDate.getMonth() &&
          day.getDate() === selectedDate.getDate();
        const dayName = DAY_NAMES_SHORT[day.getDay()];

        return (
          <button
            key={day.toISOString()}
            ref={selected ? selectedRef : undefined}
            onClick={() => onSelect(day)}
            className={[
              "flex flex-col items-center justify-center flex-shrink-0 w-11 h-14 rounded-xl transition-all duration-150",
              selected
                ? today
                  ? "bg-white text-black"
                  : "bg-white/[0.12] text-white ring-1 ring-white/30"
                : today
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:bg-white/[0.06] hover:text-white/60",
            ].join(" ")}
          >
            <span className="text-[9px] font-medium uppercase tracking-wider opacity-60">
              {dayName}
            </span>
            <span className={["text-[16px] font-semibold leading-tight", selected && today ? "text-black" : ""].join(" ")}>
              {day.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
