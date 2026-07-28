"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useBackendFetch, useConnectIntegration } from "@/lib/trpc/api";
import { ChevronLeft, ChevronRight, Plus, Unplug } from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";

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
  title: string;
  type: "task" | "entry";
  color: string;
  isGoogleCalendar?: boolean;
  hasMeetLink?: boolean;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function GoogleCalendarIcon({ size = 14 }: { size?: number }) {
  return <img src="/assets/google-calendar.svg" alt="Google Calendar" width={size} height={size} className="flex-shrink-0" draggable={false} />;
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
}

export function MonthView({ tasks, calendarEntries, isGoogleConnected, canAdmin, workspaceId, planTier }: MonthViewProps) {
  const router = useRouter();
  const workspace = useWorkspace();
  const backendFetch = useBackendFetch();
  const connectIntegration = useConnectIntegration();
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [disconnecting, setDisconnecting] = useState(false);

  // Group tasks by date key
  const itemsByDate: Record<string, CellItem[]> = {};

  for (const task of tasks) {
    const d = new Date(task.dueDate);
    const key = toDateKey(d);
    if (!itemsByDate[key]) itemsByDate[key] = [];
    itemsByDate[key].push({
      id: task.id,
      title: task.title,
      type: "task",
      color: task.status.color,
      isGoogleCalendar: task.source.includes("GOOGLE_CALENDAR"),
      hasMeetLink: task.hasMeetLink,
    });
  }

  for (const entry of calendarEntries) {
    const d = new Date(entry.startDate);
    if (isNaN(d.getTime())) continue;
    const key = toDateKey(d);
    if (!itemsByDate[key]) itemsByDate[key] = [];
    itemsByDate[key].push({
      id: entry.id,
      title: entry.title,
      type: "entry",
      color: "#71717A",
    });
  }

  const grid = buildCalendarGrid(currentYear, currentMonth);

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
              onClick={handleDisconnect}
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

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {grid.map((day, i) => {
          const isCurrentMonth = day.getMonth() === currentMonth;
          const todayCell = isToday(day);
          const key = toDateKey(day);
          const cellItems = itemsByDate[key] ?? [];
          const limit = todayCell ? 2 : 3;
          const overflow = cellItems.length > limit ? cellItems.length - limit : 0;
          const visible = cellItems.slice(0, limit);

          return (
            <div
              key={i}
              className={`border-r border-b border-white/[0.05] p-2 flex flex-col gap-1 min-w-0 overflow-hidden ${!isCurrentMonth ? "bg-white/[0.035]" : ""}`}
            >
              <div className="flex items-center justify-start">
                {todayCell ? (
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-white text-black text-[13px] font-semibold">
                    {day.getDate()}
                  </span>
                ) : (
                  <span className={`text-[13px] font-medium ${isCurrentMonth ? "text-white/50" : "text-white/20"}`}>
                    {day.getDate()}
                  </span>
                )}
              </div>

              {visible.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { if (item.type === "task") router.push(`/${workspace.slug}/tasks/${item.id}`); }}
                  className={`flex items-center gap-1 w-full text-left rounded-md px-1.5 py-0.5 transition-colors group ${
                    item.type === "entry" ? "bg-white/[0.03] cursor-default" : "hover:bg-white/[0.09]"
                  }`}
                  style={item.type === "task" ? { backgroundColor: item.color } : undefined}
                >
                  {item.isGoogleCalendar && !item.hasMeetLink && <GoogleCalendarIcon size={9} />}
                  {item.hasMeetLink && <img src="/assets/google-meet.svg" alt="" width={9} height={9} className="flex-shrink-0" />}
                  <span className={`text-[10px] font-medium truncate transition-colors ${
                    item.type === "entry" ? "text-white/30 italic" : "text-white group-hover:text-white/85"
                  }`}>
                    {item.title}
                  </span>
                </button>
              ))}

              {overflow > 0 && (
                <span className="text-[10px] text-white/30 pl-1">+{overflow} more</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
