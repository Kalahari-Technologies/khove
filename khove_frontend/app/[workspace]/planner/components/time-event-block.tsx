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

  // ClickUp-style cascade: overlapping events are offset to the right and layered
  // (later on top), each extending to the right edge so titles stay readable —
  // instead of squishing everything into equal skinny columns. The translucent
  // fills let the ones behind still show through.
  const OFFSET = 13; // px per overlap depth
  const leftPx = column * OFFSET;

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
        left: `calc(${leftPx}px + 1px)`,
        width: `calc(100% - ${leftPx}px - 2px)`,
        zIndex: column + 1,
        backgroundColor: isTask ? `${item.color}2e` : "rgba(255,255,255,0.05)",
        borderLeft: `2px solid ${isTask ? item.color : "rgba(255,255,255,0.2)"}`,
        boxShadow: column > 0 ? "-2px 0 4px -2px rgba(0,0,0,0.5)" : undefined,
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
