"use client";

import {
  timeToPixelOffset,
  durationToPixelHeight,
  formatTimeRange,
  type TimeSlotItem,
} from "../lib/time-utils";
import { usePlannerInteractions } from "./planner-interactions";

export function TimeEventBlock({ item }: { item: TimeSlotItem }) {
  const { openItem } = usePlannerInteractions();

  const top = timeToPixelOffset(item.start);
  const height = durationToPixelHeight(item.start, item.end);
  const column = item.column ?? 0;
  const totalColumns = item.totalColumns ?? 1;

  const widthPercent = 100 / totalColumns;
  const leftPercent = column * widthPercent;

  const isTask = item.type === "task";
  const timeLabel = formatTimeRange(item.start, item.end);
  const isCompact = height < 32;

  return (
    <button
      onClick={() => {
        openItem({
          id: item.id,
          title: item.title,
          start: item.start.toISOString(),
          end: item.end.toISOString(),
          isTask,
          color: item.color,
          meetLink: item.meetLink,
          location: item.location,
          attendees: item.attendees,
          threadId: item.threadId,
          threadTitle: item.threadTitle,
        });
      }}
      className={[
        "absolute rounded overflow-hidden text-left transition-opacity",
        isTask ? "cursor-pointer hover:opacity-80" : "cursor-default",
      ].join(" ")}
      style={{
        top,
        height: Math.max(height, 20),
        left: `calc(${leftPercent}% + 1px)`,
        width: `calc(${widthPercent}% - 2px)`,
        backgroundColor: isTask ? `${item.color}22` : "rgba(255,255,255,0.03)",
        borderLeft: `2px solid ${isTask ? item.color : "rgba(255,255,255,0.15)"}`,
        padding: isCompact ? "1px 4px" : "2px 6px",
      }}
    >
      {isCompact ? (
        /* Single-line compact: title + time inline */
        <div className="flex items-center gap-1 min-w-0 h-full">
          <span className={["text-[10px] font-medium truncate", isTask ? "text-white/85" : "text-white/35 italic"].join(" ")}>
            {item.title}
          </span>
          <span className="text-[9px] text-white/30 flex-shrink-0">{timeLabel}</span>
        </div>
      ) : (
        /* Two-line: title on top, time below */
        <>
          <span className={["text-[11px] font-medium truncate block leading-tight", isTask ? "text-white/90" : "text-white/40 italic"].join(" ")}>
            {item.title}
          </span>
          <span className="text-[10px] text-white/30 block truncate leading-tight">
            {timeLabel}
          </span>
        </>
      )}
    </button>
  );
}
