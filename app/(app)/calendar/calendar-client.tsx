"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronLeft,
  Calendar,
  GitBranch,
  Layers,
  MessageSquare,
  Plus,
  Home,
} from "lucide-react";
import type { PlannerTask } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlannerClientProps {
  isFirstTime: boolean;
  tasks: PlannerTask[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function buildCalendarGrid(year: number, month: number): Date[] {
  // Monday-first 6-week grid (42 cells)
  const firstOfMonth = new Date(year, month, 1);
  // getDay() returns 0=Sun..6=Sat, convert to Mon=0..Sun=6
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

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

function Breadcrumb({ extra }: { extra?: string }) {
  return (
    <nav className="flex items-center gap-1.5">
      <Home size={12} className="text-white/30" />
      <ChevronRight size={12} className="text-white/20" />
      <span className="text-[13px] text-white/40">Planner</span>
      {extra && (
        <>
          <ChevronRight size={12} className="text-white/20" />
          <span className="text-[13px] text-white/70">{extra}</span>
        </>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Orbit Empty State
// ---------------------------------------------------------------------------

const ORBIT_ICONS = [
  { Icon: Calendar, label: "Google Calendar" },
  { Icon: GitBranch, label: "GitHub" },
  { Icon: Layers, label: "Jira" },
  { Icon: MessageSquare, label: "Slack" },
];

const ORBIT_RINGS = [
  { size: 200, duration: "20s", iconCount: 1, icons: [0] },
  { size: 340, duration: "30s", iconCount: 2, icons: [1, 2] },
  { size: 480, duration: "40s", iconCount: 1, icons: [3] },
];

function OrbitRing({
  size,
  duration,
  iconIndices,
  reverse = false,
}: {
  size: number;
  duration: string;
  iconIndices: number[];
  reverse?: boolean;
}) {
  return (
    <div
      className="absolute rounded-full border border-white/[0.07]"
      style={{
        width: size,
        height: size,
        animation: `orbit-spin${reverse ? "-reverse" : ""} ${duration} linear infinite`,
      }}
    >
      {iconIndices.map((idx, i) => {
        const angle = (360 / iconIndices.length) * i;
        const rad = (angle * Math.PI) / 180;
        const r = size / 2;
        // Position on circumference (top = 0deg)
        const x = r + r * Math.sin(rad) - 18;
        const y = r - r * Math.cos(rad) - 18;
        const { Icon } = ORBIT_ICONS[idx];
        return (
          <div
            key={idx}
            className="absolute w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.10]"
            style={{
              left: x,
              top: y,
              animation: `orbit-spin${reverse ? "" : "-reverse"} ${duration} linear infinite`,
            }}
          >
            <Icon size={16} className="text-white/50" />
          </div>
        );
      })}
    </div>
  );
}

function PlannerEmptyState() {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
      <style>{`
        @keyframes orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit-spin-reverse {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-white/[0.06]">
        <Breadcrumb />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Orbit rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="relative flex items-center justify-center" style={{ width: 480, height: 480 }}>
            <OrbitRing size={200} duration="20s" iconIndices={[0]} />
            <OrbitRing size={340} duration="30s" iconIndices={[1, 2]} reverse />
            <OrbitRing size={480} duration="40s" iconIndices={[3]} />

            {/* Center logo mark */}
            <div className="absolute w-14 h-14 flex items-center justify-center rounded-2xl bg-white/[0.06] border border-white/[0.12]">
              <img src="/assets/khove-rounded.png" alt="Khove" className="w-9 h-9 object-contain" draggable={false} />
            </div>
          </div>
        </div>

        {/* Text + CTAs */}
        <div className="relative z-10 flex flex-col items-center text-center gap-4 mt-[260px]">
          <h2 className="text-[26px] font-semibold text-white leading-tight">
            Connect your tools, plan smarter
          </h2>
          <p className="text-[14px] text-white/45 max-w-[340px]">
            Link Google Calendar, GitHub, and Jira to see all your work in one place.
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
            {[
              { label: "Google Calendar", Icon: Calendar },
              { label: "GitHub", Icon: GitBranch },
              { label: "Jira", Icon: Layers },
            ].map(({ label, Icon }) => (
              <button
                key={label}
                className="flex items-center gap-1.5 border border-white/[0.15] rounded-full px-4 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planner Calendar (normal state)
// ---------------------------------------------------------------------------

function PlannerCalendar({ tasks }: { tasks: PlannerTask[] }) {
  const router = useRouter();
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  // Group tasks by date key
  const tasksByDate: Record<string, PlannerTask[]> = {};
  for (const task of tasks) {
    const d = new Date(task.dueDate);
    const key = toDateKey(d);
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(task);
  }

  const grid = buildCalendarGrid(currentYear, currentMonth);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function goToday() {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  }

  // Month date range subtitle
  const firstOfMonth = new Date(currentYear, currentMonth, 1);
  const lastOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const rangeSubtitle = `${MONTH_SHORT[currentMonth]} 1 – ${MONTH_SHORT[currentMonth]} ${lastOfMonth.getDate()}, ${currentYear}`;

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
        {/* Left: breadcrumb + date widget */}
        <div className="flex items-center gap-4">
          <Breadcrumb />
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

        {/* Center: month title + range */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-[17px] font-semibold text-white">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <span className="text-[11px] text-white/35">{rangeSubtitle}</span>
        </div>

        {/* Right: nav + actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.10] text-white/50 hover:bg-white/[0.06] hover:text-white/80 transition-colors"
          >
            <ChevronRight size={15} />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg border border-white/[0.10] text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => router.push("/tasks/new")}
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
          <div
            key={d}
            className="py-2 text-center text-[11px] text-white/30 uppercase tracking-wider"
          >
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
          const cellTasks = tasksByDate[key] ?? [];
          const limit = todayCell ? 2 : 3;
          const overflow = cellTasks.length > limit ? cellTasks.length - limit : 0;
          const visible = cellTasks.slice(0, limit);

          return (
            <div
              key={i}
              className={`border-r border-b border-white/[0.05] p-2 flex flex-col gap-1 min-w-0 overflow-hidden ${
                !isCurrentMonth ? "bg-white/[0.035]" : ""
              }`}
            >
              {/* Date number */}
              <div className="flex items-center justify-start">
                {todayCell ? (
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-white text-black text-[13px] font-semibold">
                    {day.getDate()}
                  </span>
                ) : (
                  <span
                    className={`text-[13px] font-medium ${
                      isCurrentMonth ? "text-white/50" : "text-white/20"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                )}
              </div>

              {/* Task chips */}
              {visible.map((task) => (
                <button
                  key={task.id}
                  onClick={() => router.push(`/tasks/${task.id}`)}
                  style={{ backgroundColor: task.status.color }}
                  className="flex items-center gap-1 w-full text-left rounded-md px-1.5 py-0.5 hover:bg-white/[0.09] transition-colors group"
                >
                  {/* <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: task.status.color }}
                  /> */}
                  <span className="text-[10px] text-white font-medium group-hover:text-white/85 truncate transition-colors">
                    {task.title}
                  </span>
                </button>
              ))}

              {overflow > 0 && (
                <span className="text-[10px] text-white/30 pl-1">
                  +{overflow} more
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function PlannerClient({ isFirstTime, tasks }: PlannerClientProps) {
  if (isFirstTime) return <PlannerEmptyState />;
  return <PlannerCalendar tasks={tasks} />;
}
