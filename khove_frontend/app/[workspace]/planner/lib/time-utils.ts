import type { PlannerTask, CalendarDisplayEntry, PlannerAttendee } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HOUR_HEIGHT = 60; // px per hour
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const DEFAULT_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Source layers — which tool an item came from (drives the layer toggles)
// ---------------------------------------------------------------------------

export type SourceKind = "google" | "jira" | "github" | "other";

export function sourceKindOf(sources: string[]): SourceKind {
  if (sources.includes("GOOGLE_CALENDAR")) return "google";
  if (sources.includes("JIRA")) return "jira";
  if (sources.includes("GITHUB")) return "github";
  return "other";
}

// ---------------------------------------------------------------------------
// Unified time slot item (used by day + week views)
// ---------------------------------------------------------------------------

export interface TimeSlotItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  type: "task" | "entry";
  color: string;
  isGoogleCalendar?: boolean;
  hasMeetLink?: boolean;
  meetLink?: string | null;
  location?: string | null;
  attendees?: PlannerAttendee[];
  threadId?: string | null;
  threadTitle?: string | null;
  // Layout — assigned by layoutOverlappingEvents
  column?: number;
  totalColumns?: number;
}

// ---------------------------------------------------------------------------
// Time range extraction
// ---------------------------------------------------------------------------

export function isMidnight(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

export function taskToTimeSlot(task: PlannerTask): TimeSlotItem {
  const start = new Date(task.dueDate);
  let end: Date;
  let isAllDay = task.isAllDay ?? false;

  if (task.endDateTime) {
    end = new Date(task.endDateTime);
  } else {
    end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  }

  // If no explicit isAllDay flag and time is midnight, treat as all-day
  if (!task.isAllDay && isMidnight(start)) {
    isAllDay = true;
  }

  return {
    id: task.id,
    title: task.title,
    start,
    end,
    isAllDay,
    type: "task",
    color: task.status.color,
    isGoogleCalendar: task.source.includes("GOOGLE_CALENDAR"),
    hasMeetLink: task.hasMeetLink,
    meetLink: task.meetLink ?? null,
    location: task.location ?? null,
    attendees: task.attendees ?? [],
    threadId: task.threadId ?? null,
    threadTitle: task.threadTitle ?? null,
  };
}

export function entryToTimeSlot(entry: CalendarDisplayEntry): TimeSlotItem {
  const start = new Date(entry.startDate);
  const end = entry.endDate ? new Date(entry.endDate) : new Date(start.getTime() + DEFAULT_DURATION_MS);

  return {
    id: entry.id,
    title: entry.title,
    start,
    end,
    isAllDay: entry.isAllDay,
    type: "entry",
    color: "#71717A", // zinc-500
  };
}

// ---------------------------------------------------------------------------
// Pixel calculations
// ---------------------------------------------------------------------------

export function timeToPixelOffset(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (minutes / 60) * HOUR_HEIGHT;
}

export function durationToPixelHeight(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  return Math.max((diffMinutes / 60) * HOUR_HEIGHT, 20); // min 20px
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function formatTimeRange(start: Date, end: Date): string {
  const fmt = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/** Get 7 days of the week containing `date` (Monday-first). */
export function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);

  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
  );
}

/** Get all days in a month. */
export function getMonthDays(year: number, month: number): Date[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

// ---------------------------------------------------------------------------
// Overlap layout — column packing algorithm
// ---------------------------------------------------------------------------

export function layoutOverlappingEvents(items: TimeSlotItem[]): TimeSlotItem[] {
  if (items.length === 0) return [];

  // Sort by start time, then by duration (longer first)
  const sorted = [...items].sort((a, b) => {
    const diff = a.start.getTime() - b.start.getTime();
    if (diff !== 0) return diff;
    return (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
  });

  // Group into clusters of overlapping events
  const clusters: TimeSlotItem[][] = [];
  let currentCluster: TimeSlotItem[] = [];
  let clusterEnd = 0;

  for (const item of sorted) {
    if (currentCluster.length === 0 || item.start.getTime() < clusterEnd) {
      // Overlaps with current cluster
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end.getTime());
    } else {
      // No overlap — start new cluster
      if (currentCluster.length > 0) clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.end.getTime();
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  // Layout each cluster independently
  for (const cluster of clusters) {
    const columns: TimeSlotItem[][] = [];

    for (const item of cluster) {
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        const lastInCol = columns[col][columns[col].length - 1];
        if (lastInCol.end.getTime() <= item.start.getTime()) {
          columns[col].push(item);
          item.column = col;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.column = columns.length;
        columns.push([item]);
      }
    }

    const totalColumns = columns.length;
    for (const item of cluster) {
      item.totalColumns = totalColumns;
    }
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Day name helpers
// ---------------------------------------------------------------------------

export const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES_NARROW = ["S", "M", "T", "W", "T", "F", "S"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
