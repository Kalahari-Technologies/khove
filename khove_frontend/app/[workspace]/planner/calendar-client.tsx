"use client";

import { useState } from "react";
import {
  ChevronRight,
  GitBranch,
  Home,
} from "lucide-react";
import type { PlannerTask, CalendarDisplayEntry } from "@/lib/types";
import { useConnectIntegration } from "@/lib/trpc/api";
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

interface PlannerClientProps {
  isFirstTime: boolean;
  isGoogleConnected: boolean;
  isSyncing: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
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
    if (provider === "google") {
      setConnecting(true);
      try {
        await connectIntegration("google", workspaceId);
      } catch {
        setConnecting(false); // stay on page if the connect request failed
      }
    }
  }

  const CTA_BUTTONS: Array<{ label: string; icon: React.ReactNode; provider: "google" | "github" | "jira"; enabled: boolean }> = [
    { label: "Google Calendar", icon: <GoogleCalendarIcon size={13} />, provider: "google", enabled: true },
    { label: "GitHub", icon: <GitBranch size={13} />, provider: "github", enabled: false },
    { label: "Jira", icon: <JiraIcon size={13} />, provider: "jira", enabled: false },
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

function PlannerCalendar({
  tasks,
  calendarEntries,
  insights = [],
  agentActions = [],
  isGoogleConnected,
  canAdmin,
  workspaceId,
  planTier,
  view = "month",
}: {
  tasks: PlannerTask[];
  calendarEntries: CalendarDisplayEntry[];
  insights?: PlannerInsight[];
  agentActions?: AgentActionView[];
  isGoogleConnected: boolean;
  canAdmin: boolean;
  workspaceId: string;
  planTier: string;
  view?: "month" | "week" | "day";
}) {
  const workspace = useWorkspace();
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
        {view === "month" && (
          <MonthView
            tasks={tasks}
            calendarEntries={calendarEntries}
            isGoogleConnected={isGoogleConnected}
            canAdmin={canAdmin}
            workspaceId={workspaceId}
            planTier={planTier}
          />
        )}
        {view === "week" && (
          <WeekView tasks={tasks} calendarEntries={calendarEntries} />
        )}
        {view === "day" && (
          <DayView tasks={tasks} calendarEntries={calendarEntries} />
        )}
      </div>
    </PlannerInteractionsProvider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function PlannerClient({ isFirstTime, isGoogleConnected, isSyncing, canAdmin, workspaceId, planTier, tasks, calendarEntries, insights = [], agentActions = [], view = "month" }: PlannerClientProps) {
  if (isSyncing) return <PlannerSyncingState />;
  if (isFirstTime) return <PlannerEmptyState planTier={planTier} canAdmin={canAdmin} workspaceId={workspaceId} />;
  return <PlannerCalendar tasks={tasks} calendarEntries={calendarEntries} insights={insights} agentActions={agentActions} isGoogleConnected={isGoogleConnected} canAdmin={canAdmin} workspaceId={workspaceId} planTier={planTier} view={view} />;
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
