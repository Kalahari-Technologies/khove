"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useBackendFetch, useConnectIntegration } from "@/lib/trpc/api";
import {
  ExternalLink,
  Unplug,
  Loader2,
  Circle,
  CircleDot,
  CheckCircle2,
  Bug,
  Clock,
  FolderKanban,
  Shapes,
  Plus,
  Activity,
  Gauge,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { BarTrend, LineTrend, fmtHours } from "@/components/integrations/metric-charts";
import {
  StatTile,
  SectionCard,
  DistributionBar,
  BreakdownList,
  Chip,
  SyncBanner,
  useInitialSync,
  ago,
  daysSince,
  type Tone,
} from "@/components/integrations/insight-ui";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
const INDIGO = "rgba(99,102,241,0.55)";

const CAT = {
  todo: { label: "To Do", color: "#64748b", tone: "neutral" as Tone },
  in_progress: { label: "In Progress", color: "#3b82f6", tone: "accent" as Tone },
  done: { label: "Done", color: "#10b981", tone: "good" as Tone },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface JiraTask {
  id: string;
  title: string;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

interface Issue {
  id: string;
  title: string;
  issueKey?: string;
  projectKey?: string;
  status?: string;
  category: "todo" | "in_progress" | "done";
  issueType?: string;
  externalUrl: string | null;
  updatedAt: string;
}

type Filter = "todo" | "in_progress" | "done" | "bugs" | "stale" | null;

function parseIssue(task: JiraTask): Issue {
  const j = (task.metadata?.jira ?? {}) as Record<string, unknown>;
  const cat = j.statusCategory as string | undefined;
  const category = cat === "DONE" ? "done" : cat === "IN_PROGRESS" ? "in_progress" : "todo";
  return {
    id: task.id,
    title: task.title,
    issueKey: j.issueKey as string | undefined,
    projectKey: j.projectKey as string | undefined,
    status: j.status as string | undefined,
    category,
    issueType: j.issueType as string | undefined,
    externalUrl: task.externalUrl ?? (j.url as string | undefined) ?? null,
    updatedAt: task.updatedAt,
  };
}

const isBug = (i: Issue) => (i.issueType ?? "").toLowerCase() === "bug";
const isStale = (i: Issue) => i.category === "in_progress" && daysSince(i.updatedAt) >= 5;

// ─── Root ───────────────────────────────────────────────────────────────────

export function JiraClient({
  isConnected,
  workspaceId,
  siteName,
  siteUrl,
  tasks,
}: {
  isConnected: boolean;
  workspaceId: string;
  siteName: string | null;
  siteUrl: string | null;
  tasks: JiraTask[];
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const backendFetch = useBackendFetch();
  const connectIntegration = useConnectIntegration();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const syncing = useInitialSync(tasks.length > 0);

  async function handleResync() {
    setResyncing(true);
    try {
      await backendFetch("/api/integrations/jira/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      setTimeout(() => {
        router.refresh();
        setResyncing(false);
      }, 4000);
    } catch {
      setResyncing(false);
    }
  }

  const { issues, insights } = useMemo(() => {
    const all = tasks.map(parseIssue);
    const todo = all.filter((i) => i.category === "todo");
    const inProgress = all.filter((i) => i.category === "in_progress");
    const done = all.filter((i) => i.category === "done");
    const bugs = all.filter((i) => isBug(i) && i.category !== "done");
    const stale = all.filter(isStale);

    const projectLoad: Record<string, number> = {};
    const typeLoad: Record<string, number> = {};
    for (const i of all) {
      if (i.projectKey) projectLoad[i.projectKey] = (projectLoad[i.projectKey] ?? 0) + 1;
      const t = i.issueType ?? "Other";
      typeLoad[t] = (typeLoad[t] ?? 0) + 1;
    }

    return {
      issues: all,
      insights: {
        todo,
        inProgress,
        done,
        bugs,
        stale,
        projectRows: Object.entries(projectLoad).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
        typeRows: Object.entries(typeLoad).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      },
    };
  }, [tasks]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await backendFetch("/api/integrations/jira/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      router.refresh();
    } catch {
      /* silent */
    }
    setDisconnecting(false);
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
        <div className="flex flex-col items-center text-center max-w-sm">
          <img src="/assets/jira.svg" width={46} height={46} alt="Jira" className="mb-4" />
          <h2 className="text-[18px] font-semibold text-white mb-2">Connect Jira</h2>
          <p className="text-[13px] text-white/40 leading-relaxed">
            Sync your Jira issues into Khove. See status, project, and type at a glance — and create,
            comment on, or transition issues straight from chat.
          </p>
        </div>
        <button
          onClick={async () => {
            setConnecting(true);
            try {
              await connectIntegration("jira", workspaceId);
            } catch {
              setConnecting(false);
            }
          }}
          disabled={connecting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium bg-white text-black hover:bg-white/90 transition-colors active:scale-[0.98] disabled:opacity-70"
          style={{ transitionTimingFunction: ease }}
        >
          {connecting && <Loader2 size={14} className="animate-spin" />}
          {connecting ? "Opening Jira…" : "Connect Jira"}
        </button>
      </div>
    );
  }

  const open = insights.todo.length + insights.inProgress.length;

  const tiles: { key: Filter; label: string; value: number; tone: Tone; icon: typeof Clock }[] = [
    { key: "todo", label: "To Do", value: insights.todo.length, tone: "neutral", icon: Circle },
    { key: "in_progress", label: "In Progress", value: insights.inProgress.length, tone: "accent", icon: CircleDot },
    { key: "done", label: "Done", value: insights.done.length, tone: "good", icon: CheckCircle2 },
    { key: "bugs", label: "Open bugs", value: insights.bugs.length, tone: "danger", icon: Bug },
    { key: "stale", label: "Stale in-progress", value: insights.stale.length, tone: "warn", icon: Clock },
  ];

  const filtered = issues.filter((i) => {
    if (!filter) return i.category !== "done"; // default hides Done
    if (filter === "bugs") return isBug(i) && i.category !== "done";
    if (filter === "stale") return isStale(i);
    return i.category === filter;
  });
  const grouped: { cat: keyof typeof CAT; items: Issue[] }[] = (["in_progress", "todo", "done"] as const)
    .map((cat) => ({ cat, items: filtered.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/jira.svg" width={30} height={30} alt="Jira" />
            <div>
              <h1 className="text-[19px] font-semibold text-white leading-tight">Jira</h1>
              <p className="text-[12px] text-white/40">
                {siteName && <span className="text-white/60">{siteName}</span>}
                {siteName ? " · " : ""}
                {open} open · {issues.length} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {siteUrl && (
              <a
                href={`${siteUrl}/secure/CreateIssue!default.jspa`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/70 border border-white/[0.1] hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <Plus size={12} /> New issue
              </a>
            )}
            <button
              onClick={handleResync}
              disabled={resyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/60 border border-white/[0.1] hover:bg-white/[0.06] hover:text-white/90 transition-colors disabled:opacity-50"
              style={{ transitionTimingFunction: ease }}
            >
              <Loader2 size={12} className={resyncing ? "animate-spin" : ""} />
              {resyncing ? "Syncing…" : "Re-sync"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/40 border border-white/[0.08] hover:text-red-400 hover:border-red-400/20 transition-colors"
              style={{ transitionTimingFunction: ease }}
            >
              <Unplug size={12} />
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>

        {syncing && <SyncBanner label="Syncing your Jira issues…" />}

        {/* Attention strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {tiles.map((t) => (
            <StatTile
              key={t.label}
              label={t.label}
              value={t.value}
              tone={t.tone}
              icon={<t.icon size={12} />}
              active={filter === t.key}
              onClick={t.value > 0 ? () => setFilter(filter === t.key ? null : t.key) : undefined}
            />
          ))}
        </div>

        {/* Status distribution + breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SectionCard title="Status" icon={<CircleDot size={13} className="text-white/40" />}>
            <DistributionBar
              segments={[
                { label: "To Do", value: insights.todo.length, color: CAT.todo.color },
                { label: "In Progress", value: insights.inProgress.length, color: CAT.in_progress.color },
                { label: "Done", value: insights.done.length, color: CAT.done.color },
              ]}
            />
          </SectionCard>
          <SectionCard title="By project" icon={<FolderKanban size={13} className="text-white/40" />}>
            <BreakdownList rows={insights.projectRows} color={INDIGO} emptyLabel="No projects synced yet" />
          </SectionCard>
          <SectionCard title="By type" icon={<Shapes size={13} className="text-white/40" />}>
            <BreakdownList rows={insights.typeRows} color={INDIGO} emptyLabel="No issues yet" />
          </SectionCard>
        </div>

        {/* Flow & delivery (same Signal-store metrics as GitHub — cross-platform) */}
        <JiraFlowSection />

        {/* Issue list */}
        <SectionCard
          title="Issues"
          icon={<CircleDot size={13} className="text-white/40" />}
          count={filtered.length}
          action={
            filter ? (
              <button onClick={() => setFilter(null)} className="text-[11px] text-white/45 hover:text-white/80 transition-colors">
                Clear filter ✕
              </button>
            ) : (
              <span className="text-[11px] text-white/30">Hiding done · tap a tile to filter</span>
            )
          }
        >
          {filtered.length === 0 ? (
            <p className="text-[12px] text-white/30 py-4">
              {issues.length === 0 ? "No issues synced yet." : "Nothing here — try another filter."}
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.cat}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT[g.cat].color }} />
                    <span className="text-[11px] font-semibold text-white/60">{CAT[g.cat].label}</span>
                    <span className="text-[10px] text-white/30 tabular-nums">{g.items.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {g.items.map((i) => (
                      <IssueRow key={i.id} issue={i} workspaceSlug={workspace.slug} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function JiraFlowSection() {
  const q = trpc.metrics.flow.useQuery({ provider: "JIRA" });
  const m = q.data;
  const weeks = m ? Math.round(m.windowDays / 7) : 12;

  return (
    <SectionCard
      title="Flow & delivery"
      icon={<Activity size={13} className="text-white/40" />}
      action={<span className="text-[11px] text-white/30">last {weeks} weeks</span>}
    >
      {q.isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 size={16} className="animate-spin text-white/40" />
        </div>
      ) : !m || m.merged === 0 ? (
        <p className="text-[12px] text-white/30 py-3">
          No completed issues in the last {weeks} weeks yet — throughput and cycle time fill in as issues move to Done.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            <StatTile label="Throughput" value={`${m.throughputPerWeek}/wk`} icon={<Gauge size={12} />} hint={`${m.merged} done`} />
            <StatTile label="Cycle time p50" value={fmtHours(m.cycleTimeP50Hours)} hint={`p90 ${fmtHours(m.cycleTimeP90Hours)}`} tone="accent" />
            <StatTile label="Opened" value={m.opened} icon={<CircleDot size={12} />} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="text-[11px] text-white/45 mb-1.5">Throughput — done per week</div>
              <BarTrend points={m.throughputSeries} color="rgb(99,102,241)" />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1.5">Cycle time p50 — weekly</div>
              <LineTrend points={m.cycleTimeSeries} color="rgb(99,102,241)" format={fmtHours} />
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function IssueRow({ issue, workspaceSlug }: { issue: Issue; workspaceSlug: string }) {
  const stale = isStale(issue);
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
      {issue.issueKey && (
        <span className="text-[10.5px] font-mono text-white/35 flex-shrink-0 w-[74px] truncate">{issue.issueKey}</span>
      )}
      <a
        href={`/${workspaceSlug}/tasks/${issue.id}`}
        className="flex-1 min-w-0 text-[13px] text-white/80 truncate hover:text-white hover:underline transition-colors"
      >
        {issue.title.replace(/^\[[^\]]+\]\s*/, "")}
      </a>
      {issue.issueType && (
        <Chip tone={isBug(issue) ? "danger" : "neutral"}>{issue.issueType}</Chip>
      )}
      {stale && (
        <span className="text-[10px] text-amber-400/70 flex-shrink-0" title={`No update in ${daysSince(issue.updatedAt)} days`}>
          {ago(issue.updatedAt)}
        </span>
      )}
      {issue.status && (
        <span className="hidden lg:inline text-[10px] text-white/35 flex-shrink-0">{issue.status}</span>
      )}
      {issue.externalUrl && (
        <a
          href={issue.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
