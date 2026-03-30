"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import {
  ChevronRight,
  ChevronLeft,
  Calendar,
  GitBranch,
  Layers,
  MessageSquare,
  Plus,
  Home,
  Unplug,
} from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";
import { UpgradeDialog } from "@/components/upgrade-dialog";

// ---------------------------------------------------------------------------
// Google Calendar logo
// ---------------------------------------------------------------------------

function GoogleCalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/assets/google-calendar.svg"
      alt="Google Calendar"
      width={size}
      height={size}
      className="flex-shrink-0"
      draggable={false}
    />
  );
}

function JiraIcon({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/assets/jira.svg"
      alt="Jira"
      width={size}
      height={size}
      className="flex-shrink-0"
      draggable={false}
    />
  );
}

function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/assets/github.svg"
      alt="Jira"
      width={size}
      height={size}
      className="flex-shrink-0"
      draggable={false}
    />
  );
}

function MeetIcon({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/assets/google-meet.svg"
      alt="Jira"
      width={size}
      height={size}
      className="flex-shrink-0"
      draggable={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlannerClientProps {
  isFirstTime: boolean;
  isGoogleConnected: boolean;
  isSyncing: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
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
// Unified cell item type
// ---------------------------------------------------------------------------

interface CellItem {
  id: string;
  title: string;
  type: "task" | "entry";
  color: string;
  isGoogleCalendar?: boolean;
  hasMeetLink?: boolean;
}

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
  { Icon: GoogleCalendarIcon, label: "Google Calendar" },
  { Icon: GithubIcon, label: "GitHub" },
  { Icon: JiraIcon, label: "Jira" },
  { Icon: MeetIcon, label: "Google Meet" },
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
            <Icon size={16} />
          </div>
        );
      })}
    </div>
  );
}

function PlannerEmptyState({ planTier, canAdmin, workspaceId }: { planTier: string; canAdmin: boolean; workspaceId: string }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | undefined>();

  const canCalendar = true;

  function handleConnect(feature: string, href: string | undefined) {
    if (!href) return;
    if (feature === "calendarTools" && !canCalendar) {
      setUpgradeFeature(feature);
      setUpgradeOpen(true);
      return;
    }
    window.location.href = href;
  }

  const CTA_BUTTONS: Array<{ label: string; icon: React.ReactNode; href: string | undefined; feature: string }> = [
    { label: "Google Calendar", icon: <GoogleCalendarIcon size={13} />, href: `/api/integrations/google/connect?workspaceId=${workspaceId}`, feature: "calendarTools" },
    { label: "GitHub", icon: <GitBranch size={13} />, href: undefined, feature: "githubTools" },
    { label: "Jira", icon: <JiraIcon size={13} />, href: undefined, feature: "jiraTools" },
  ];

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
            <div className="absolute w-16 h-16 flex items-center justify-center rounded-[50%] border border-white/[0.12]">
              <img src="/assets/khove-rounded.png" alt="Khove" className="w-full h-full object-cover" draggable={false} />
            </div>
          </div>
        </div>

        {/* Text + CTAs */}
        <div className="relative z-10 flex flex-col items-center text-center gap-4 mt-[260px]">
          <h2 className="text-[26px] font-semibold text-white leading-tight">
            Connect your tools, plan smarter
          </h2>
          <p className="text-[14px] text-white/45 max-w-[340px]">
            {canAdmin
              ? "Link Google Calendar, GitHub, and Jira to see all your work in one place."
              : "No integrations connected yet. Ask a workspace admin to connect your tools."}
          </p>
          {canAdmin && (
            <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
              {CTA_BUTTONS.map(({ label, icon, href, feature }) => (
                <button
                  key={label}
                  onClick={() => handleConnect(feature, href)}
                  className={`flex items-center gap-1.5 border border-white/[0.15] rounded-full px-4 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-colors ${
                    !href ? "opacity-40 cursor-not-allowed" : ""
                  }`}
                  disabled={!href}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} feature={upgradeFeature} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planner Calendar (normal state)
// ---------------------------------------------------------------------------

function PlannerCalendar({
  tasks,
  calendarEntries,
  isGoogleConnected,
  canAdmin,
  workspaceId,
  planTier,
}: {
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  isGoogleConnected: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [disconnecting, setDisconnecting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const canCalendar = planTier !== "FREE";

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

  // Merge external calendar entries (holidays, birthdays — display only)
  for (const entry of calendarEntries) {
    const d = new Date(entry.startDate);
    if (isNaN(d.getTime())) continue;
    const key = toDateKey(d);
    if (!itemsByDate[key]) itemsByDate[key] = [];
    itemsByDate[key].push({
      id: entry.id,
      title: entry.title,
      type: "entry",
      color: "#71717A", // zinc-500 — dim
    });
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

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      window.location.reload();
    } catch {
      setDisconnecting(false);
    }
  }

  const rangeSubtitle = `${MONTH_SHORT[currentMonth]} 1 – ${MONTH_SHORT[currentMonth]} ${new Date(currentYear, currentMonth + 1, 0).getDate()}, ${currentYear}`;

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
          {/* Google Calendar status — only admins can connect/disconnect */}
          {isGoogleConnected && canAdmin ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.10] text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
              title="Disconnect Google Calendar"
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
              onClick={() => {
                window.location.href = `/api/integrations/google/connect?workspaceId=${workspaceId}`;
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.15] text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
            >
              <GoogleCalendarIcon size={12} />
              Connect Calendar
            </button>
          ) : null}

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
          const cellItems = itemsByDate[key] ?? [];
          const limit = todayCell ? 2 : 3;
          const overflow = cellItems.length > limit ? cellItems.length - limit : 0;
          const visible = cellItems.slice(0, limit);

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

              {/* Item chips */}
              {visible.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.type === "task") {
                      router.push(`/${workspace.slug}/tasks/${item.id}`);
                    }
                    // Calendar entries are non-clickable
                  }}
                  className={`flex items-center gap-1 w-full text-left rounded-md px-1.5 py-0.5 transition-colors group ${
                    item.type === "entry"
                      ? "bg-white/[0.03] cursor-default"
                      : "hover:bg-white/[0.09]"
                  }`}
                  style={item.type === "task" ? { backgroundColor: item.color } : undefined}
                >
                  {item.isGoogleCalendar && !item.hasMeetLink && (
                    <GoogleCalendarIcon size={9} />
                  )}
                  {item.hasMeetLink && (
                    <img src="/assets/google-meet.svg" alt="" width={9} height={9} className="flex-shrink-0" />
                  )}
                  <span
                    className={`text-[10px] font-medium truncate transition-colors ${
                      item.type === "entry"
                        ? "text-white/30 italic"
                        : "text-white group-hover:text-white/85"
                    }`}
                  >
                    {item.title}
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

      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} feature="calendarTools" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function PlannerClient({ isFirstTime, isGoogleConnected, isSyncing, canAdmin, workspaceId, planTier, tasks, calendarEntries }: PlannerClientProps) {
  if (isSyncing) return <PlannerSyncingState />;
  if (isFirstTime) return <PlannerEmptyState planTier={planTier} canAdmin={canAdmin} workspaceId={workspaceId} />;
  return <PlannerCalendar tasks={tasks} calendarEntries={calendarEntries} isGoogleConnected={isGoogleConnected} canAdmin={canAdmin} workspaceId={workspaceId} planTier={planTier} />;
}

// ---------------------------------------------------------------------------
// Syncing state — shown while Inngest is importing calendar events
// ---------------------------------------------------------------------------

function PlannerSyncingState() {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-white/[0.06]">
        <Breadcrumb />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
        <p className="text-[14px] text-white/50">Syncing your calendar...</p>
        <p className="text-[12px] text-white/25">This may take a moment. The page will update automatically.</p>
      </div>
    </div>
  );
}
