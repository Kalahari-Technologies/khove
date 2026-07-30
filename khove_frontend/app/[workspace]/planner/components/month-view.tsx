"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useBackendFetch, useConnectIntegration } from "@/lib/trpc/api";
import { ChevronLeft, ChevronRight, Plus, Unplug } from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";
import { usePlannerInteractions, type PlannerEventDetail } from "./planner-interactions";
import { sourceKindOf, type SourceKind } from "../lib/time-utils";
import { colorForTask, ENTRY_COLOR, type ColorBy } from "../lib/calendar-colors";
import { ConfirmDialog } from "@/components/confirm-dialog";

function taskToDetail(t: PlannerTask): PlannerEventDetail {
  return {
    id: t.id,
    title: t.title,
    start: t.dueDate,
    end: t.endDateTime,
    isTask: true,
    color: t.status.color,
    meetLink: t.meetLink,
    location: t.location,
    attendees: t.attendees,
    threadId: t.threadId,
    threadTitle: t.threadTitle,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function buildCalendarGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return days;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CellItem {
  id: string;
  taskId: string;
  title: string;
  type: "task" | "entry";
  color: string;
  sourceKind: SourceKind;
  time?: string;
  isGoogleCalendar?: boolean;
  hasMeetLink?: boolean;
}

/** Compact start-time label, e.g. "5pm" / "9:30am". */
function shortTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}
function isMidnightLocal(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}
/** First → last inclusive day an event covers. All-day ends are exclusive (Google
 *  convention) so the trailing day is dropped. Single-day → first === last. */
function spanRange(start: Date, end: Date | null, allDay: boolean): { first: Date; last: Date } {
  const first = startOfDay(start);
  let last = first;
  if (end) {
    let l = startOfDay(end);
    if (allDay) l = new Date(l.getFullYear(), l.getMonth(), l.getDate() - 1);
    if (l.getTime() > first.getTime()) last = l;
  }
  return { first, last };
}

interface MultiEvent {
  id: string;
  taskId: string;
  title: string;
  color: string;
  sourceKind: SourceKind;
  type: "task" | "entry";
  hasMeetLink?: boolean;
  time?: string;
  first: Date;
  last: Date;
}

interface WeekBar {
  m: MultiEvent;
  startCol: number;
  span: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
}

/** Lay out the multi-day events intersecting a week into non-overlapping lanes. */
function computeWeekBars(weekDays: Date[], events: MultiEvent[]): { bars: WeekBar[]; laneCount: number } {
  const d0 = startOfDay(weekDays[0]);
  const d6 = startOfDay(weekDays[6]);
  const inWeek = events
    .filter((m) => m.first.getTime() <= d6.getTime() && m.last.getTime() >= d0.getTime())
    .sort(
      (a, b) =>
        a.first.getTime() - b.first.getTime() ||
        b.last.getTime() - b.first.getTime() - (a.last.getTime() - a.first.getTime()),
    );
  const laneEnd: number[] = [];
  const bars = inWeek.map((m) => {
    const startCol = Math.max(0, Math.min(6, dayDiff(m.first, d0)));
    const endCol = Math.max(0, Math.min(6, dayDiff(m.last, d0)));
    let lane = 0;
    while (laneEnd[lane] !== undefined && laneEnd[lane] >= startCol) lane++;
    laneEnd[lane] = endCol;
    return {
      m,
      startCol,
      span: endCol - startCol + 1,
      lane,
      isStart: m.first.getTime() >= d0.getTime(),
      isEnd: m.last.getTime() <= d6.getTime(),
    };
  });
  return { bars, laneCount: laneEnd.length };
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function GoogleCalendarIcon({ size = 14 }: { size?: number }) {
  return <img src="/assets/google-calendar.svg" alt="Google Calendar" width={size} height={size} className="flex-shrink-0" draggable={false} />;
}

function SourceBadge({ kind, size = 9 }: { kind: SourceKind; size?: number }) {
  if (kind === "jira") return <img src="/assets/jira.svg" alt="Jira" width={size} height={size} className="flex-shrink-0" draggable={false} />;
  if (kind === "github") return <img src="/assets/github.svg" alt="GitHub" width={size} height={size} className="flex-shrink-0" draggable={false} />;
  return null;
}

// ---------------------------------------------------------------------------
// Month View
// ---------------------------------------------------------------------------

interface MonthViewProps {
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  isGoogleConnected: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
  colorBy?: ColorBy;
}

export function MonthView({ tasks, calendarEntries, isGoogleConnected, canAdmin, workspaceId, planTier, colorBy = "source" }: MonthViewProps) {
  const router = useRouter();
  const workspace = useWorkspace();
  const backendFetch = useBackendFetch();
  const connectIntegration = useConnectIntegration();
  const { openItem, openCreate, rescheduleTask, pendingReschedules } = usePlannerInteractions();
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Drop a task chip on a day → keep its time-of-day, change the date.
  function handleDrop(taskId: string, day: Date) {
    const t = taskById.get(taskId);
    if (!t) return;
    const orig = new Date(t.dueDate);
    const newStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), orig.getHours(), orig.getMinutes());
    void rescheduleTask(taskId, newStart);
  }

  // Single-day items render as in-cell chips; multi-day render as spanning bars.
  const singleByDate: Record<string, CellItem[]> = {};
  const multiEvents: MultiEvent[] = [];

  for (const task of tasks) {
    const kind = sourceKindOf(task.source);
    // Apply any optimistic reschedule so the chip moves instantly on drop.
    const d = new Date(pendingReschedules[task.id] ?? task.dueDate);
    if (isNaN(d.getTime())) continue;
    const { first, last } = spanRange(d, task.endDateTime ? new Date(task.endDateTime) : null, !!task.isAllDay);
    const time = !task.isAllDay && !isMidnightLocal(d) ? shortTime(d) : undefined;
    const color = colorForTask(task, colorBy);
    if (first.getTime() === last.getTime()) {
      (singleByDate[toDateKey(first)] ??= []).push({
        id: task.id,
        taskId: task.id,
        title: task.title,
        type: "task",
        color,
        sourceKind: kind,
        time,
        isGoogleCalendar: kind === "google",
        hasMeetLink: task.hasMeetLink,
      });
    } else {
      multiEvents.push({ id: task.id, taskId: task.id, title: task.title, color, sourceKind: kind, type: "task", hasMeetLink: task.hasMeetLink, time, first, last });
    }
  }

  for (const entry of calendarEntries) {
    const d = new Date(entry.startDate);
    if (isNaN(d.getTime())) continue;
    const { first, last } = spanRange(d, entry.endDate ? new Date(entry.endDate) : null, entry.isAllDay);
    const time = !entry.isAllDay && !isMidnightLocal(d) ? shortTime(d) : undefined;
    const color = entry.calendarColor ?? ENTRY_COLOR;
    if (first.getTime() === last.getTime()) {
      (singleByDate[toDateKey(first)] ??= []).push({
        id: entry.id,
        taskId: entry.id,
        title: entry.title,
        type: "entry",
        color,
        sourceKind: "google",
        time,
      });
    } else {
      multiEvents.push({ id: entry.id, taskId: entry.id, title: entry.title, color, sourceKind: "google", type: "entry", time, first, last });
    }
  }

  const grid = buildCalendarGrid(currentYear, currentMonth);
  const weeks: Date[][] = [];
  for (let w = 0; w < grid.length; w += 7) weeks.push(grid.slice(w, w + 7));

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  }

  function goToday() {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await backendFetch("/api/integrations/google/disconnect", {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      });
      window.location.reload();
    } catch {
      setDisconnecting(false);
    }
  }

  const rangeSubtitle = `${MONTH_SHORT[currentMonth]} 1 – ${MONTH_SHORT[currentMonth]} ${new Date(currentYear, currentMonth + 1, 0).getDate()}, ${currentYear}`;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-px border border-white/[0.15] rounded-lg overflow-hidden">
            <div className="px-3 py-1 flex flex-col items-center leading-none">
              <span className="text-[10px] text-white/35 uppercase tracking-wider">
                {MONTH_SHORT[today.getMonth()]}
              </span>
              <span className="text-[20px] font-semibold text-white leading-tight">
                {today.getDate()}
              </span>
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-[17px] font-semibold text-white">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <span className="text-[11px] text-white/35">{rangeSubtitle}</span>
        </div>

        <div className="flex items-center gap-2">
          {isGoogleConnected && canAdmin ? (
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.10] text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
            >
              <GoogleCalendarIcon size={12} />
              {disconnecting ? "Disconnecting…" : "Google Calendar"}
              <Unplug size={10} className="ml-0.5 opacity-50" />
            </button>
          ) : isGoogleConnected ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-white/35">
              <GoogleCalendarIcon size={12} />
              Google Calendar
            </span>
          ) : canAdmin ? (
            <button
              onClick={() => connectIntegration("google", workspaceId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.15] text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
            >
              <GoogleCalendarIcon size={12} />
              Connect Calendar
            </button>
          ) : null}

          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
            <ChevronRight size={15} />
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-white/[0.10] text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors">
            Today
          </button>
          <button
            onClick={() => router.push(`/${workspace.slug}/tasks/new`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors"
          >
            <Plus size={13} />
            New task
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/[0.06] shrink-0">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] text-white/30 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — week rows, each with a spanning-bar overlay for multi-day events */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {weeks.map((weekDays, wi) => {
          const { bars, laneCount } = computeWeekBars(weekDays, multiEvents);
          const DAY_NUM_H = 30;
          const LANE_H = 19;
          const barsAreaH = laneCount * LANE_H;
          return (
            <div key={wi} className="relative grid flex-1 grid-cols-7 border-b border-white/[0.05]">
              {weekDays.map((day, ci) => {
                const isCurrentMonth = day.getMonth() === currentMonth;
                const todayCell = isToday(day);
                const key = toDateKey(day);
                const cellItems = singleByDate[key] ?? [];
                const limit = Math.max(1, 4 - laneCount);
                const overflow = cellItems.length > limit ? cellItems.length - limit : 0;
                const visible = cellItems.slice(0, limit);
                return (
                  <div
                    key={ci}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData("text/taskId");
                      if (id) handleDrop(id, day);
                    }}
                    className={`relative flex min-w-0 flex-col overflow-hidden border-r border-white/[0.05] px-1.5 pb-1 ${!isCurrentMonth ? "bg-white/[0.035]" : ""}`}
                  >
                    <div className="flex h-6 items-center pt-1.5">
                      {todayCell ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-semibold text-black">
                          {day.getDate()}
                        </span>
                      ) : (
                        <span className={`text-[12.5px] font-medium ${isCurrentMonth ? "text-white/50" : "text-white/20"}`}>
                          {day.getDate()}
                        </span>
                      )}
                    </div>
                    {/* reserve vertical space for the spanning-bar lanes above the single-day chips */}
                    <div style={{ height: barsAreaH }} aria-hidden />
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {visible.map((item) => {
                        const task = item.type === "task" ? taskById.get(item.taskId) : undefined;
                        return (
                          <button
                            key={item.id}
                            draggable={item.type === "task"}
                            onDragStart={(e) => {
                              if (item.type === "task") e.dataTransfer.setData("text/taskId", item.taskId);
                            }}
                            onClick={() => {
                              if (task) openItem(taskToDetail(task));
                            }}
                            className={`group flex w-full items-center gap-1 rounded-md py-[3px] pl-1 pr-1.5 text-left transition-colors ${
                              item.type === "entry" ? "cursor-default hover:bg-white/[0.04]" : "cursor-grab hover:bg-white/[0.06] active:cursor-grabbing"
                            }`}
                          >
                            <span className="h-3 w-[3px] flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.hasMeetLink && <img src="/assets/google-meet.svg" alt="" width={9} height={9} className="flex-shrink-0" />}
                            <SourceBadge kind={item.sourceKind} size={9} />
                            {item.time && <span className="flex-shrink-0 text-[10px] tabular-nums text-white/40">{item.time}</span>}
                            <span className={`truncate text-[10.5px] ${item.type === "entry" ? "text-white/45" : "text-white/85 group-hover:text-white"}`}>
                              {item.title}
                            </span>
                          </button>
                        );
                      })}
                      {overflow > 0 && <span className="pl-1 text-[10px] text-white/30">+{overflow} more</span>}
                    </div>
                    <button
                      aria-label="Add event"
                      onClick={() => openCreate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0))}
                      className="group/add mt-auto flex min-h-[8px] w-full flex-1 items-start justify-end rounded-md pt-0.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <Plus size={11} className="text-white/0 transition-colors group-hover/add:text-white/25" />
                    </button>
                  </div>
                );
              })}
              {/* Spanning bars for multi-day events */}
              {bars.map((b) => {
                const task = b.m.type === "task" ? taskById.get(b.m.taskId) : undefined;
                return (
                  <button
                    key={`${b.m.id}-${wi}`}
                    onClick={() => {
                      if (task) openItem(taskToDetail(task));
                    }}
                    className="absolute flex items-center gap-1 overflow-hidden text-left"
                    style={{
                      left: `calc(${(b.startCol / 7) * 100}% + 3px)`,
                      width: `calc(${(b.span / 7) * 100}% - 6px)`,
                      top: DAY_NUM_H + b.lane * LANE_H,
                      height: LANE_H - 2,
                      backgroundColor: `${b.m.color}2e`,
                      borderLeft: b.isStart ? `2px solid ${b.m.color}` : undefined,
                      borderTopLeftRadius: b.isStart ? 4 : 0,
                      borderBottomLeftRadius: b.isStart ? 4 : 0,
                      borderTopRightRadius: b.isEnd ? 4 : 0,
                      borderBottomRightRadius: b.isEnd ? 4 : 0,
                      paddingLeft: b.isStart ? 5 : 6,
                      paddingRight: 5,
                      cursor: task ? "pointer" : "default",
                    }}
                  >
                    {b.isStart && b.m.hasMeetLink && <img src="/assets/google-meet.svg" alt="" width={9} height={9} className="flex-shrink-0" />}
                    {b.isStart && <SourceBadge kind={b.m.sourceKind} size={9} />}
                    {b.isStart && b.m.time && <span className="flex-shrink-0 text-[10px] tabular-nums text-white/50">{b.m.time}</span>}
                    <span className="truncate text-[10.5px] text-white/85">{b.isStart ? b.m.title : " "}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={showDisconnectConfirm}
        onClose={() => setShowDisconnectConfirm(false)}
        onConfirm={handleDisconnect}
        variant="danger"
        title="Disconnect Google Calendar?"
        description="This removes all synced Google Calendar events and meetings from this workspace, including any tasks created from them. To get them back you'll need to reconnect and re-sync."
        confirmLabel="Disconnect & delete"
        cancelLabel="Keep connected"
      />
    </>
  );
}
