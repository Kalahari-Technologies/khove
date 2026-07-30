"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Home,
  Calendar as CalendarIcon,
  Check,
  RefreshCw,
} from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";
import { useRouter } from "next/navigation";
import { sourceKindOf } from "./lib/time-utils";
import { COLOR_BY_OPTIONS, type ColorBy } from "./lib/calendar-colors";
import { useBackendFetch, useConnectIntegration } from "@/lib/trpc/api";
import { trpc } from "@/lib/trpc/client";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { MonthView } from "./components/month-view";
import { WeekView } from "./components/week-view";
import { DayView } from "./components/day-view";
import { InsightBanner, type PlannerInsight } from "./components/insight-banner";
import { PlannerInteractionsProvider } from "./components/planner-interactions";
import { PlannerAgentPanel } from "./components/agent-panel";
import type { AgentActionView } from "@/components/agent/agent-action-card";

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

export interface CalendarInfo {
  id: string;
  summary: string;
  color: string | null;
  selected?: boolean;
}

interface PlannerClientProps {
  isFirstTime: boolean;
  isGoogleConnected: boolean;
  isSyncing: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  calendars?: CalendarInfo[];
  insights?: PlannerInsight[];
  agentActions?: AgentActionView[];
  view?: "month" | "week" | "day";
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
  const [upgradeFeature] = useState<string | undefined>();
  const [connecting, setConnecting] = useState(false);
  const connectIntegration = useConnectIntegration();

  async function handleConnect(provider: "google" | "github" | "jira", enabled: boolean) {
    if (!enabled || connecting) return;
    // Authenticated fetch to the BACKEND connect route → { url } → redirect.
    // (A relative /api/... nav would 404 on the frontend origin post-split.)
    // GitHub connects from its own page; here we handle Google + Jira.
    if (provider === "google" || provider === "jira") {
      setConnecting(true);
      try {
        await connectIntegration(provider, workspaceId);
      } catch {
        setConnecting(false); // stay on page if the connect request failed
      }
    }
  }

  const CTA_BUTTONS: Array<{ label: string; icon: React.ReactNode; provider: "google" | "github" | "jira"; enabled: boolean }> = [
    { label: "Google Calendar", icon: <GoogleCalendarIcon size={13} />, provider: "google", enabled: true },
    { label: "GitHub", icon: <GitBranch size={13} />, provider: "github", enabled: false },
    { label: "Jira", icon: <JiraIcon size={13} />, provider: "jira", enabled: true },
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
              {CTA_BUTTONS.map(({ label, icon, provider, enabled }) => (
                <button
                  key={label}
                  onClick={() => handleConnect(provider, enabled)}
                  className={`flex items-center gap-1.5 border border-white/[0.15] rounded-full px-4 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white/90 transition-colors ${
                    !enabled || connecting ? "opacity-40 cursor-not-allowed" : ""
                  }`}
                  disabled={!enabled || connecting}
                >
                  {icon}
                  {provider === "google" && connecting ? "Connecting…" : label}
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
// Planner Calendar (normal state) — delegates to Month/Week/Day views
// ---------------------------------------------------------------------------

type Layer = "meetings" | "events" | "jira" | "github";
const LAYERS: { kind: Layer; label: string; color: string }[] = [
  { kind: "meetings", label: "Meetings", color: "#F43F5E" },
  { kind: "events", label: "Events", color: "#8B5CF6" },
  { kind: "jira", label: "Jira", color: "#6366F1" },
  { kind: "github", label: "GitHub", color: "#10B981" },
];
const VIEW_LABEL: Record<"month" | "week" | "day", string> = { month: "Month", week: "Week", day: "Day" };

// Which layer a task belongs to — Google meetings, Jira, or GitHub. Calendar
// entries (holidays/all-day) are always the "events" layer, so toggling
// "Meetings" no longer hides them. Local Khove/AI tasks stay always-visible.
function taskLayer(sources: string[]): Layer | null {
  const k = sourceKindOf(sources);
  if (k === "google") return "meetings";
  if (k === "jira") return "jira";
  if (k === "github") return "github";
  return null;
}

function PlannerCalendar({
  tasks,
  calendarEntries,
  calendars = [],
  insights = [],
  agentActions = [],
  isGoogleConnected,
  canAdmin,
  workspaceId,
  planTier,
}: {
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  calendars?: CalendarInfo[];
  insights?: PlannerInsight[];
  agentActions?: AgentActionView[];
  isGoogleConnected: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
}) {
  const workspace = useWorkspace();
  // View + layer state live here (shared across all three views) and persist to
  // localStorage, so switching views keeps your layers — and the view switcher is
  // a top-right dropdown rather than a full navigation.
  const router = useRouter();
  const backendFetch = useBackendFetch();
  const setCalendarSel = trpc.integration.setCalendarSelection.useMutation();
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [hidden, setHidden] = useState<Set<Layer>>(new Set());
  const [colorBy, setColorBy] = useState<ColorBy>("source");
  const [viewOpen, setViewOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [calSel, setCalSel] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const c of calendars) init[c.id] = c.selected !== false;
    setCalSel(init);
  }, [calendars]);

  const toggleCalendar = (id: string) => {
    const next = !(calSel[id] ?? true);
    setCalSel((p) => ({ ...p, [id]: next }));
    setCalendarSel.mutate({ calendarId: id, selected: next });
  };
  const refreshCalendars = async () => {
    setRefreshing(true);
    try {
      await backendFetch(
        "/api/integrations/google/resync",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) },
        workspaceId,
      );
      router.refresh();
    } catch {
      /* ignore */
    }
    setRefreshing(false);
  };
  // null when calendars aren't synced yet → don't filter by calendar.
  const selectedIds = calendars.length ? new Set(calendars.filter((c) => calSel[c.id] !== false).map((c) => c.id)) : null;

  useEffect(() => {
    try {
      const v = localStorage.getItem(`planner:view:${workspaceId}`);
      if (v === "week" || v === "day" || v === "month") setView(v);
      const h = localStorage.getItem(`planner:layers:${workspaceId}`);
      if (h) setHidden(new Set(JSON.parse(h) as Layer[]));
      const c = localStorage.getItem(`planner:colorby:${workspaceId}`);
      if (c === "source" || c === "status" || c === "priority") setColorBy(c);
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  const chooseView = (v: "month" | "week" | "day") => {
    setView(v);
    setViewOpen(false);
    try {
      localStorage.setItem(`planner:view:${workspaceId}`, v);
    } catch {
      /* ignore */
    }
  };
  const chooseColor = (c: ColorBy) => {
    setColorBy(c);
    setColorOpen(false);
    try {
      localStorage.setItem(`planner:colorby:${workspaceId}`, c);
    } catch {
      /* ignore */
    }
  };
  const toggleLayer = (k: Layer) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      try {
        localStorage.setItem(`planner:layers:${workspaceId}`, JSON.stringify([...n]));
      } catch {
        /* ignore */
      }
      return n;
    });

  const present = useMemo(() => {
    const s = new Set<Layer>();
    for (const t of tasks) {
      const l = taskLayer(t.source);
      if (l) s.add(l);
    }
    if (calendarEntries.length) s.add("events");
    return s;
  }, [tasks, calendarEntries]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const l = taskLayer(t.source);
        if (l && hidden.has(l)) return false;
        if (selectedIds && t.calendarId && !selectedIds.has(t.calendarId)) return false;
        return true;
      }),
    [tasks, hidden, selectedIds],
  );
  const visibleEntries = useMemo(
    () =>
      calendarEntries.filter((e) => {
        if (hidden.has("events")) return false;
        if (selectedIds && e.calendarId && !selectedIds.has(e.calendarId)) return false;
        return true;
      }),
    [calendarEntries, hidden, selectedIds],
  );

  return (
    <PlannerInteractionsProvider
      workspaceId={workspaceId}
      slug={workspace.slug}
      canWrite={true}
      isGoogleConnected={isGoogleConnected}
    >
      <div className="flex flex-col h-full bg-black overflow-hidden">
        {insights.length > 0 && <InsightBanner insights={insights} />}
        {agentActions.length > 0 && <PlannerAgentPanel actions={agentActions} slug={workspace.slug} />}

        {/* Toolbar — layer toggles (left); color-by + view dropdowns (right) */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {LAYERS.filter((l) => present.has(l.kind)).map((l) => {
              const on = !hidden.has(l.kind);
              return (
                <button
                  key={l.kind}
                  onClick={() => toggleLayer(l.kind)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                    on ? "border-white/[0.12] bg-white/[0.05] text-white/80" : "border-white/[0.06] text-white/30"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={on ? { backgroundColor: l.color } : { border: `1px solid ${l.color}` }} />
                  {l.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Calendars */}
            {isGoogleConnected && (
              <div className="relative">
                <button
                  onClick={() => setCalOpen((o) => !o)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/70 hover:bg-white/[0.07]"
                >
                  <CalendarIcon size={13} className="text-white/45" /> Calendars <ChevronDown size={13} className="text-white/45" />
                </button>
                {calOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCalOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-white/[0.10] bg-[#0d0d0f] p-1.5 shadow-xl">
                      {calendars.length === 0 ? (
                        <div className="px-2 py-3 text-center text-[12px] text-white/40">
                          No calendars synced yet — hit Refresh.
                        </div>
                      ) : (
                        <div className="max-h-[300px] space-y-0.5 overflow-y-auto">
                          {calendars.map((c) => {
                            const on = calSel[c.id] !== false;
                            const color = c.color ?? "#8B5CF6";
                            return (
                              <button
                                key={c.id}
                                onClick={() => toggleCalendar(c.id)}
                                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]"
                              >
                                <span
                                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px]"
                                  style={on ? { backgroundColor: color } : { border: `1.5px solid ${color}` }}
                                >
                                  {on && <Check size={11} className="text-white" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80">{c.summary}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button
                        onClick={refreshCalendars}
                        disabled={refreshing}
                        className="mt-1 flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] px-2 py-1.5 text-[11.5px] text-white/50 hover:text-white/80 disabled:opacity-50"
                      >
                        <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Syncing…" : "Refresh calendars"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Color-by */}
            <div className="relative">
              <button
                onClick={() => setColorOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/70 hover:bg-white/[0.07]"
              >
                Color: {COLOR_BY_OPTIONS.find((o) => o.key === colorBy)?.label} <ChevronDown size={13} className="text-white/45" />
              </button>
              {colorOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColorOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-white/[0.10] bg-[#0d0d0f] py-1 shadow-xl">
                    {COLOR_BY_OPTIONS.map((o) => (
                      <button
                        key={o.key}
                        onClick={() => chooseColor(o.key)}
                        className={`block w-full px-3 py-1.5 text-left text-[12.5px] ${
                          o.key === colorBy ? "bg-white/[0.06] text-white" : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* View */}
            <div className="relative">
              <button
                onClick={() => setViewOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/80 hover:bg-white/[0.07]"
              >
                {VIEW_LABEL[view]} <ChevronDown size={13} className="text-white/45" />
              </button>
              {viewOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setViewOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-white/[0.10] bg-[#0d0d0f] py-1 shadow-xl">
                    {(["month", "week", "day"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => chooseView(v)}
                        className={`block w-full px-3 py-1.5 text-left text-[12.5px] ${
                          v === view ? "bg-white/[0.06] text-white" : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        {VIEW_LABEL[v]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {view === "month" && (
          <MonthView
            tasks={visibleTasks}
            calendarEntries={visibleEntries}
            isGoogleConnected={isGoogleConnected}
            canAdmin={canAdmin}
            workspaceId={workspaceId}
            planTier={planTier}
            colorBy={colorBy}
          />
        )}
        {view === "week" && <WeekView tasks={visibleTasks} calendarEntries={visibleEntries} colorBy={colorBy} />}
        {view === "day" && <DayView tasks={visibleTasks} calendarEntries={visibleEntries} colorBy={colorBy} />}
      </div>
    </PlannerInteractionsProvider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function PlannerClient({ isFirstTime, isGoogleConnected, isSyncing, canAdmin, workspaceId, planTier, tasks, calendarEntries, calendars = [], insights = [], agentActions = [] }: PlannerClientProps) {
  if (isSyncing) return <PlannerSyncingState />;
  if (isFirstTime) return <PlannerEmptyState planTier={planTier} canAdmin={canAdmin} workspaceId={workspaceId} />;
  return <PlannerCalendar tasks={tasks} calendarEntries={calendarEntries} calendars={calendars} insights={insights} agentActions={agentActions} isGoogleConnected={isGoogleConnected} canAdmin={canAdmin} workspaceId={workspaceId} planTier={planTier} />;
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
