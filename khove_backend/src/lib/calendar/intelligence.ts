import { db } from "@backend/lib/db";

/**
 * Calendar time-intelligence — the "Understand → Predict" step of the loop.
 *
 * Pure functions over a workspace's meetings (GOOGLE_CALENDAR-sourced Tasks) plus
 * display entries, producing evidence-backed `Insight`s (signal + confidence +
 * sources). These are read-only and available to every tier; Stage D turns the
 * ones carrying a `suggestedAction` into approval-gated AgentActions.
 */

const FOCUS_BLOCK_MIN = 120; // a "deep work" block is ≥ 2h
const OVERLOAD_HOURS = 5; // > 5h of meetings in a day is heavy
const OVERLOAD_COUNT = 6; // …or ≥ 6 meetings in a day
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalendarEventLike {
  id: string;
  taskId: string | null; // set when the event is backed by a Task
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  // "meeting" = a genuine timed meeting (counted by conflict/overload/focus).
  // "task" = a Khove/non-meeting task with a due date (context only).
  // "entry" = a calendar-only display event (context only).
  source: "meeting" | "task" | "entry";
}

export type InsightType = "conflict" | "focus_gap" | "overload";
export type InsightSeverity = "info" | "warning" | "critical";

export interface Insight {
  /** Stable id — also used as the AgentAction dedupeKey in Stage D. */
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  detail: string;
  confidence: number; // 0..1
  /** ISO day (YYYY-MM-DD) the insight concerns. */
  day: string;
  sources: Array<{ kind: "task" | "entry"; id: string; title: string }>;
  /** Optional executable proposal Stage D can draft as an AgentAction. */
  suggestedAction?:
    | { type: "RESCHEDULE_EVENT"; taskId: string; reason: string }
    | { type: "BLOCK_FOCUS_TIME"; startDateTime: string; endDateTime: string; day: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human day label from a YYYY-MM-DD key, e.g. "Thu 28 Jul" (no tz drift). */
function fmtDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

function overlaps(a: CalendarEventLike, b: CalendarEventLike): boolean {
  return a.start < b.end && b.start < a.end;
}

function durationMin(e: CalendarEventLike): number {
  return Math.max(0, (e.end.getTime() - e.start.getTime()) / 60000);
}

function groupByDay(events: CalendarEventLike[]): Map<string, CalendarEventLike[]> {
  const map = new Map<string, CalendarEventLike[]>();
  for (const e of events) {
    const k = dayKey(e.start);
    (map.get(k) ?? map.set(k, []).get(k)!).push(e);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Load a workspace's events for a range (shared by the tRPC query + agent engine)
// ---------------------------------------------------------------------------

export async function loadWorkspaceEvents(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<CalendarEventLike[]> {
  const [tasks, entries] = await Promise.all([
    db.task.findMany({
      where: { workspaceId, dueDate: { gte: from, lte: to } },
      include: { status: true },
    }),
    db.calendarEntry.findMany({
      where: { workspaceId, startDate: { gte: from, lte: to } },
    }),
  ]);

  const events: CalendarEventLike[] = [];

  for (const t of tasks) {
    if (!t.dueDate) continue;
    if (t.status?.category === "CANCELLED") continue;
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;
    const isAllDay = gcal.isAllDay === true;
    const start = t.dueDate;
    const end = gcal.endDateTime
      ? new Date(gcal.endDateTime as string)
      : new Date(start.getTime() + 60 * 60 * 1000);
    // Only a genuine, timed Google-Calendar meeting counts toward conflict /
    // overload / focus math. Non-meeting tasks (Khove todos, all-day items) are
    // context only.
    const isMeeting = gcal.isMeeting === true && !isAllDay;
    events.push({
      id: `task:${t.id}`,
      taskId: t.id,
      title: t.title,
      start,
      end: end > start ? end : new Date(start.getTime() + 60 * 60 * 1000),
      isAllDay,
      source: isMeeting ? "meeting" : "task",
    });
  }

  for (const e of entries) {
    events.push({
      id: `entry:${e.id}`,
      taskId: null,
      title: e.title,
      start: e.startDate,
      end: e.endDate ?? new Date(e.startDate.getTime() + 60 * 60 * 1000),
      isAllDay: e.isAllDay,
      source: "entry",
    });
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/** Overlapping timed meetings (double-booking). */
export function detectConflicts(events: CalendarEventLike[]): Insight[] {
  const timed = events.filter((e) => !e.isAllDay && e.source === "meeting");
  const insights: Insight[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (b.start >= a.end) break; // sorted by start → no further overlaps with a
      if (!overlaps(a, b)) continue;
      const pairKey = [a.id, b.id].sort().join("|");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      insights.push({
        id: `conflict:${pairKey}`,
        type: "conflict",
        severity: "critical",
        title: "Double-booked",
        detail: `"${a.title}" overlaps "${b.title}" on ${fmtDay(dayKey(a.start))}.`,
        confidence: 0.95,
        day: dayKey(a.start),
        sources: [
          { kind: "task", id: a.taskId ?? a.id, title: a.title },
          { kind: "task", id: b.taskId ?? b.id, title: b.title },
        ],
        // Propose moving the shorter of the two.
        suggestedAction: (durationMin(a) <= durationMin(b) ? a : b).taskId
          ? {
              type: "RESCHEDULE_EVENT",
              taskId: (durationMin(a) <= durationMin(b) ? a : b).taskId as string,
              reason: `Resolves the overlap with "${(durationMin(a) <= durationMin(b) ? b : a).title}".`,
            }
          : undefined,
      });
    }
  }
  return insights;
}

/** Days that are meeting-heavy but have no protected deep-work block. */
export function findFocusGaps(events: CalendarEventLike[]): Insight[] {
  const insights: Insight[] = [];
  const byDay = groupByDay(events.filter((e) => !e.isAllDay && e.source === "meeting"));

  for (const [day, dayEvents] of byDay) {
    if (dayEvents.length < 2) continue; // a light day needs no protection
    const sorted = [...dayEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
    // Largest free gap between consecutive meetings.
    let largestGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].start.getTime() - sorted[i - 1].end.getTime()) / 60000;
      if (gap > largestGap) largestGap = gap;
    }
    if (largestGap >= FOCUS_BLOCK_MIN) continue; // already has a deep-work window

    // Propose a focus block right after the last meeting of the day.
    const last = sorted[sorted.length - 1];
    const blockStart = last.end;
    const blockEnd = new Date(blockStart.getTime() + FOCUS_BLOCK_MIN * 60000);

    insights.push({
      id: `focus_gap:${day}`,
      type: "focus_gap",
      severity: "warning",
      title: "No deep-work time",
      detail: `${fmtDay(day)} has ${sorted.length} meetings and no ${FOCUS_BLOCK_MIN / 60}h+ free block.`,
      confidence: 0.7,
      day,
      sources: sorted.map((e) => ({
        kind: e.taskId ? "task" : "entry",
        id: e.taskId ?? e.id,
        title: e.title,
      })),
      suggestedAction: {
        type: "BLOCK_FOCUS_TIME",
        startDateTime: blockStart.toISOString(),
        endDateTime: blockEnd.toISOString(),
        day,
      },
    });
  }
  return insights;
}

/** Days with an unusually heavy meeting load. */
export function detectOverload(events: CalendarEventLike[]): Insight[] {
  const insights: Insight[] = [];
  const byDay = groupByDay(events.filter((e) => !e.isAllDay && e.source === "meeting"));

  for (const [day, dayEvents] of byDay) {
    const totalMin = dayEvents.reduce((sum, e) => sum + durationMin(e), 0);
    const hours = totalMin / 60;
    if (hours < OVERLOAD_HOURS && dayEvents.length < OVERLOAD_COUNT) continue;
    insights.push({
      id: `overload:${day}`,
      type: "overload",
      severity: hours >= OVERLOAD_HOURS + 2 ? "critical" : "warning",
      title: "Heavy meeting day",
      detail: `${fmtDay(day)} has ${dayEvents.length} meetings totalling ${hours.toFixed(1)}h.`,
      confidence: 0.8,
      day,
      sources: dayEvents.map((e) => ({
        kind: e.taskId ? "task" : "entry",
        id: e.taskId ?? e.id,
        title: e.title,
      })),
    });
  }
  return insights;
}

/** Run every detector and return insights sorted by severity then day. */
export function computeInsights(events: CalendarEventLike[]): Insight[] {
  const all = [
    ...detectConflicts(events),
    ...detectOverload(events),
    ...findFocusGaps(events),
  ];
  const rank: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return all.sort((a, b) => rank[a.severity] - rank[b.severity] || a.day.localeCompare(b.day));
}

/**
 * Free windows of at least `minMinutes` between meetings across the range —
 * powers the `findFocusTime` AI tool. Naive: gaps between consecutive timed
 * meetings per day (does not assume fixed work hours).
 */
export function findFreeWindows(
  events: CalendarEventLike[],
  minMinutes = 60,
): Array<{ start: string; end: string; minutes: number }> {
  const windows: Array<{ start: string; end: string; minutes: number }> = [];
  const byDay = groupByDay(events.filter((e) => !e.isAllDay));
  for (const [, dayEvents] of byDay) {
    const sorted = [...dayEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapMin = (sorted[i].start.getTime() - sorted[i - 1].end.getTime()) / 60000;
      if (gapMin >= minMinutes) {
        windows.push({
          start: sorted[i - 1].end.toISOString(),
          end: sorted[i].start.toISOString(),
          minutes: Math.round(gapMin),
        });
      }
    }
  }
  return windows.sort((a, b) => a.start.localeCompare(b.start));
}

/** Convenience: load + compute for a workspace range. */
export async function getInsightsForRange(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<Insight[]> {
  const events = await loadWorkspaceEvents(workspaceId, from, to);
  return computeInsights(events);
}
