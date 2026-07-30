"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  SlidersHorizontal,
  X,
  ChevronRight,
  Layers,
  Rocket,
  GitMerge,
  GitPullRequest,
  Link2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { BarTrend, LineTrend, Burndown, Donut, StackedBar, fmtHours } from "@/components/integrations/metric-charts";
import { DashboardTabs, useDashboardTabs } from "@/components/integrations/dashboard-tabs";
import { KpiRow } from "@/components/dashboard/widgets/kpi-row";
import { JiraScopeDialog } from "@/components/integrations/jira-scope-dialog";
import {
  StatTile,
  SectionCard,
  DistributionBar,
  BreakdownList,
  Chip,
  IntegrationSyncScreen,
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
  priority?: string;
  storyPoints?: number | null;
  epicKey?: string;
  sprintName?: string;
}

type Filter = "todo" | "in_progress" | "done" | "bugs" | "stale" | null;

function parseIssue(task: JiraTask): Issue {
  const j = (task.metadata?.jira ?? {}) as Record<string, unknown>;
  const cat = j.statusCategory as string | undefined;
  const category = cat === "DONE" ? "done" : cat === "IN_PROGRESS" ? "in_progress" : "todo";
  const epic = j.epic as { key?: string } | undefined;
  const sprint = j.sprint as { name?: string } | undefined;
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
    priority: (j.priority as string | undefined) ?? undefined,
    storyPoints: typeof j.storyPoints === "number" ? (j.storyPoints as number) : null,
    epicKey: epic?.key,
    sprintName: sprint?.name,
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
  const [scopeOpen, setScopeOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [pollNonce, setPollNonce] = useState(0);
  // Tabbed dashboard layout — active tab persisted per-workspace. Declared with the
  // other hooks (before the sync/disconnect early-returns) so hook order stays stable.
  const [tab, setTab] = useDashboardTabs(
    workspaceId ? `jira:tab:${workspaceId}` : null,
    ["overview", "flow", "delivery", "activity"],
    "overview",
  );

  // Persistent sync status (server truth via Redis) — full-screen loader survives
  // reloads until the sync finishes.
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDiag, setSyncDiag] = useState<{ found: number; jql: string; site: string; at?: string } | null>(null);
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await backendFetch(`/api/integrations/jira/sync-status?workspaceId=${workspaceId}`, {}, workspaceId);
        const data = (await res.json()) as {
          status?: string;
          message?: string;
          found?: number;
          jql?: string;
          site?: string;
          at?: string;
        };
        if (!active) return;
        if (data.status === "disconnecting") {
          // Persistent disconnect indicator — survives navigation/reload.
          setDisconnecting(true);
          setSyncing(false);
          timer = setTimeout(poll, 2000);
        } else if (data.status === "syncing") {
          setSyncing(true);
          setSyncError(null);
          setSyncDiag(null);
          setResyncing(false);
          wasSyncing.current = true;
          timer = setTimeout(poll, 3000);
        } else {
          setSyncing(false);
          setDisconnecting(false);
          if (data.status === "error") setSyncError(data.message ?? "The last Jira sync failed.");
          else setSyncError(null);
          // A completed sync that found nothing — the exact site + query it ran,
          // so a wrong site / empty scope is diagnosable from the UI.
          if (data.status === "done" && (data.found ?? 0) === 0) {
            setSyncDiag({ found: data.found ?? 0, jql: data.jql ?? "", site: data.site ?? "", at: data.at });
          } else {
            setSyncDiag(null);
          }
          if (wasSyncing.current) {
            wasSyncing.current = false;
            router.refresh();
          }
        }
      } catch {
        if (active) timer = setTimeout(poll, 6000);
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, workspaceId, pollNonce]);

  async function handleResync() {
    setResyncing(true);
    setSyncError(null);
    setSyncDiag(null);
    setPollNonce((n) => n + 1);
    try {
      // The endpoint now syncs inline and returns the real outcome, so the result
      // is authoritative — reflect it immediately instead of only polling.
      const res = await backendFetch(
        "/api/integrations/jira/resync",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) },
        workspaceId,
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        found?: number;
        jql?: string;
        site?: string;
      };
      if (!res.ok || data.success === false) {
        setSyncError(data.error ?? "The Jira sync failed.");
      } else if ((data.found ?? 0) === 0) {
        setSyncDiag({ found: 0, jql: data.jql ?? "", site: data.site ?? "" });
      }
      router.refresh();
    } catch {
      setSyncError("Could not reach the sync service.");
    } finally {
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

  // Full-sized loading state (mirrors the planner) — persists across reloads while a
  // sync runs, and covers re-sync + disconnect.
  if (syncing || resyncing || disconnecting) {
    const label = disconnecting
      ? "Disconnecting Jira…"
      : resyncing
        ? "Re-syncing your Jira…"
        : "Syncing your Jira issues…";
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <IntegrationSyncScreen label={label} sub={disconnecting ? "Clearing synced data." : undefined} />
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

  // Clicking an attention tile filters the Issues list — which now lives on the
  // Activity tab, so jump there too (filter state is lifted, so it survives the switch).
  const onTileClick = (key: Filter) => {
    setFilter(filter === key ? null : key);
    setTab("activity");
  };

  const tabs = [
    { key: "overview", label: "Overview", icon: <Gauge size={13} /> },
    { key: "flow", label: "Flow", icon: <Activity size={13} /> },
    { key: "delivery", label: "Delivery", icon: <Rocket size={13} /> },
    { key: "activity", label: "Activity", icon: <CircleDot size={13} />, count: issues.length },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="w-full px-6 py-7 xl:px-10 space-y-6">
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
              onClick={() => setScopeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/60 border border-white/[0.1] hover:bg-white/[0.06] hover:text-white/90 transition-colors"
              style={{ transitionTimingFunction: ease }}
            >
              <SlidersHorizontal size={12} /> Scope
            </button>
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

        {/* Sync error — surfaces the real reason a sync came back empty */}
        {syncError && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-300/90">
            <span className="font-medium text-red-300">Last Jira sync failed.</span>{" "}
            <span className="text-red-300/70 break-words">{syncError}</span>{" "}
            <button onClick={handleResync} className="underline underline-offset-2 hover:text-red-200">
              Try again
            </button>
          </div>
        )}

        {/* Sync ran but found nothing — surfaces the site + query so a wrong
            site / empty scope is diagnosable without server logs. */}
        {syncDiag && !syncError && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[13px] text-amber-200/90">
            <span className="font-medium text-amber-200">Last sync completed, but found 0 issues.</span>{" "}
            <span className="text-amber-200/70">
              Queried site <span className="font-mono text-amber-100">{syncDiag.site || "unknown"}</span> with{" "}
              <span className="font-mono text-amber-100 break-all">{syncDiag.jql || "(no query)"}</span>. If your issues
              live on a different Jira site, or the project scope excludes them, that&apos;s why.
            </span>{" "}
            <button onClick={handleResync} className="underline underline-offset-2 hover:text-amber-100">
              Re-sync
            </button>
          </div>
        )}

        {/* Tabs */}
        <DashboardTabs tabs={tabs} active={tab} onChange={setTab} />

        {/* ── Overview ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Hero KPI row */}
            <KpiRow provider="jira" windowDays={28} />

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
                  onClick={t.value > 0 ? () => onTileClick(t.key) : undefined}
                />
              ))}
            </div>

            {/* Active sprint burndown */}
            <JiraActiveSprints onDrill={setDrill} />

            {/* Issues by status category */}
            <SectionCard title="Status mix" icon={<CircleDot size={13} className="text-white/40" />}>
              <Donut
                data={[
                  { name: CAT.todo.label, value: insights.todo.length },
                  { name: CAT.in_progress.label, value: insights.inProgress.length },
                  { name: CAT.done.label, value: insights.done.length },
                ]}
                colors={[CAT.todo.color, CAT.in_progress.color, CAT.done.color]}
                centerLabel="issues"
              />
            </SectionCard>
          </div>
        )}

        {/* ── Flow ─────────────────────────────────────────────────────── */}
        {tab === "flow" && (
          <div className="space-y-6">
            {/* Velocity — committed vs completed per closed sprint */}
            <JiraVelocitySection />

            {/* Flow & delivery (same Signal-store metrics as GitHub — cross-platform) */}
            <JiraFlowSection />
          </div>
        )}

        {/* ── Delivery ─────────────────────────────────────────────────── */}
        {tab === "delivery" && (
          <div className="space-y-6">
            {/* Epics + releases (click to drill in) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <JiraEpicsSection onDrill={setDrill} />
              <JiraReleasesSection onDrill={setDrill} />
            </div>

            {/* Cross-tool delivery gaps (Jira status vs merged code) */}
            <JiraCrossToolSection />
          </div>
        )}

        {/* ── Activity ─────────────────────────────────────────────────── */}
        {tab === "activity" && (
          <div className="space-y-6">
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
          </div>
        )}
      </div>

      {scopeOpen && <JiraScopeDialog workspaceId={workspaceId} onClose={() => setScopeOpen(false)} />}
      {drill &&
        (drill.kind === "EPIC" ? (
          <EpicChainModal workspaceSlug={workspace.slug} epicKey={drill.key} title={drill.title} onClose={() => setDrill(null)} />
        ) : (
          <EntityDrilldown workspaceSlug={workspace.slug} target={drill} onClose={() => setDrill(null)} />
        ))}
    </div>
  );
}

function PrChips({ prs, slug }: { prs: { taskId: string; url: string | null; number?: number; merged: boolean }[]; slug: string }) {
  if (prs.length === 0) return <span className="text-[10px] text-white/25">no code</span>;
  return (
    <span className="flex items-center gap-1 flex-wrap justify-end">
      {prs.map((p) => (
        <a
          key={p.taskId}
          href={`/${slug}/tasks/${p.taskId}`}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-0.5 text-[10px] rounded px-1 py-0.5 border ${
            p.merged ? "border-emerald-400/25 text-emerald-300" : "border-amber-400/25 text-amber-300"
          }`}
          title={p.merged ? "Merged" : "Open"}
        >
          {p.merged ? <GitMerge size={9} /> : <GitPullRequest size={9} />}
          {p.number ? `#${p.number}` : "PR"}
        </a>
      ))}
    </span>
  );
}

function EpicChainModal({ workspaceSlug, epicKey, title, onClose }: { workspaceSlug: string; epicKey: string; title: string; onClose: () => void }) {
  const q = trpc.metrics.epicChain.useQuery({ epicKey });
  const d = q.data;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/35">epic · {epicKey}</span>
            <h3 className="text-[15px] font-semibold text-white leading-tight truncate">{title}</h3>
            {d && (
              <p className="text-[11px] text-white/40 mt-1">
                {d.done}/{d.total} stories done · {d.storiesWithCode} with code · {d.prsMerged} PRs merged
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[56vh] overflow-y-auto px-3 pb-3">
          {q.isLoading ? (
            <div className="flex items-center justify-center py-12 text-white/40"><Loader2 size={18} className="animate-spin" /></div>
          ) : !d || d.stories.length === 0 ? (
            <p className="text-[12px] text-white/35 px-2 py-6 text-center">No stories under this epic.</p>
          ) : (
            d.stories.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CAT[s.category === "DONE" ? "done" : s.category === "IN_PROGRESS" ? "in_progress" : "todo"].color }} />
                {s.issueKey && <span className="text-[10.5px] font-mono text-white/35 flex-shrink-0 w-[68px] truncate">{s.issueKey}</span>}
                <a href={`/${workspaceSlug}/tasks/${s.id}`} className="flex-1 min-w-0 text-[13px] text-white/80 truncate hover:text-white">{s.title}</a>
                <PrChips prs={s.prs} slug={workspaceSlug} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function JiraCrossToolSection() {
  const q = trpc.metrics.crossToolIntegrity.useQuery();
  const d = q.data;
  const { slug } = useWorkspace();
  if (!d || (d.codeAheadOfTicket.length === 0 && d.doneWithOpenPr.length === 0)) return null;

  const Row = ({ g }: { g: (typeof d.codeAheadOfTicket)[number] }) => (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
      <span className="text-[10.5px] font-mono text-white/35 flex-shrink-0 w-[68px] truncate">{g.issueKey}</span>
      <a href={`/${slug}/tasks/${g.taskId}`} className="flex-1 min-w-0 text-[13px] text-white/80 truncate hover:text-white">{g.title}</a>
      {g.status && <span className="hidden sm:inline text-[10px] text-white/35 flex-shrink-0">{g.status}</span>}
      <PrChips prs={g.prs} slug={slug} />
    </div>
  );

  return (
    <SectionCard title="Cross-tool delivery gaps" icon={<Link2 size={13} className="text-white/40" />} action={<span className="text-[11px] text-white/30">Jira ↔ GitHub</span>}>
      {d.codeAheadOfTicket.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300/80 mb-1.5">
            <GitMerge size={11} /> Code merged, ticket not closed ({d.codeAheadOfTicket.length})
          </div>
          <div className="space-y-0.5">{d.codeAheadOfTicket.slice(0, 8).map((g) => <Row key={g.taskId} g={g} />)}</div>
        </div>
      )}
      {d.doneWithOpenPr.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-300/80 mb-1.5">
            <GitPullRequest size={11} /> Marked done, code still open ({d.doneWithOpenPr.length})
          </div>
          <div className="space-y-0.5">{d.doneWithOpenPr.slice(0, 8).map((g) => <Row key={g.taskId} g={g} />)}</div>
        </div>
      )}
    </SectionCard>
  );
}

interface DrillTarget {
  kind: "SPRINT" | "EPIC" | "RELEASE";
  key: string;
  title: string;
}

const CAT_DOT: Record<string, string> = { todo: "#64748b", in_progress: "#3b82f6", done: "#10b981" };

function EntityDrilldown({ workspaceSlug, target, onClose }: { workspaceSlug: string; target: DrillTarget; onClose: () => void }) {
  const q = trpc.metrics.entityIssues.useQuery({ kind: target.kind, key: target.key });
  const issues = q.data ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/35">{target.kind.toLowerCase()}</span>
            <h3 className="text-[15px] font-semibold text-white leading-tight">{target.title}</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[56vh] overflow-y-auto px-3 pb-3">
          {q.isLoading ? (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : issues.length === 0 ? (
            <p className="text-[12px] text-white/35 px-2 py-6 text-center">No issues.</p>
          ) : (
            issues.map((i) => (
              <a
                key={i.id}
                href={`/${workspaceSlug}/tasks/${i.id}`}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CAT_DOT[(i.category ?? "").toLowerCase() === "done" ? "done" : (i.category ?? "").toLowerCase() === "in_progress" ? "in_progress" : "todo"] }} />
                {i.issueKey && <span className="text-[10.5px] font-mono text-white/35 flex-shrink-0 w-[68px] truncate">{i.issueKey}</span>}
                <span className="flex-1 text-[13px] text-white/80 truncate">{i.title.replace(/^\[[^\]]+\]\s*/, "")}</span>
                {i.storyPoints != null && <span className="text-[10px] text-white/40 tabular-nums flex-shrink-0">{i.storyPoints}pt</span>}
                {i.status && <span className="hidden sm:inline text-[10px] text-white/35 flex-shrink-0">{i.status}</span>}
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = "bg-indigo-400" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function SprintCard({ s, onDrill }: { s: { id?: number; name: string; state?: string; goal?: string; daysRemaining: number | null; totalIssues: number; doneIssues: number; committedPoints: number; donePoints: number; hasPoints: boolean }; onDrill: (t: DrillTarget) => void }) {
  const bd = trpc.metrics.sprintBurndown.useQuery({ sprintName: s.name }, { enabled: s.state === "active" });
  const issuePct = s.totalIssues ? Math.round((s.doneIssues / s.totalIssues) * 100) : 0;
  const ptsPct = s.committedPoints ? Math.round((s.donePoints / s.committedPoints) * 100) : 0;
  const late = s.daysRemaining != null && s.daysRemaining < 0;

  return (
    <SectionCard
      title={s.name}
      icon={<Gauge size={13} className="text-indigo-300/70" />}
      action={
        <div className="flex items-center gap-2">
          <Chip tone={s.state === "active" ? (late ? "danger" : "accent") : "neutral"}>
            {s.state === "active" ? (s.daysRemaining != null ? (late ? `${Math.abs(s.daysRemaining)}d over` : `${s.daysRemaining}d left`) : "active") : "upcoming"}
          </Chip>
          <button onClick={() => onDrill({ kind: "SPRINT", key: s.name, title: s.name })} className="text-white/30 hover:text-white/70 transition-colors" title="View issues">
            <ChevronRight size={14} />
          </button>
        </div>
      }
    >
      {s.goal && <p className="text-[12px] text-white/50 mb-3 leading-relaxed">{s.goal}</p>}

      {s.hasPoints && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between text-[11px] text-white/50 mb-1.5">
            <span>Story points</span>
            <span className="tabular-nums">{s.donePoints} / {s.committedPoints} ({ptsPct}%)</span>
          </div>
          <ProgressBar pct={ptsPct} />
        </div>
      )}

      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] text-white/50 mb-1.5">
          <span>Issues</span>
          <span className="tabular-nums">{s.doneIssues} / {s.totalIssues} ({issuePct}%)</span>
        </div>
        <ProgressBar pct={issuePct} color="bg-emerald-400/80" />
      </div>

      {s.state === "active" && bd.data && (
        <div>
          <div className="text-[10.5px] text-white/40 mb-1">Burndown — remaining vs ideal</div>
          <Burndown committed={bd.data.committed} series={bd.data.series} />
        </div>
      )}
    </SectionCard>
  );
}

// Active + upcoming sprint cards (Overview tab).
function JiraActiveSprints({ onDrill }: { onDrill: (t: DrillTarget) => void }) {
  const q = trpc.metrics.sprints.useQuery();
  const all = q.data ?? [];
  const active = all.filter((s) => s.state === "active" || s.state === "future").slice(0, 2);
  if (active.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {active.map((s) => (
        <SprintCard key={s.id ?? s.name} s={s} onDrill={onDrill} />
      ))}
    </div>
  );
}

// Closed-sprint velocity (Flow tab): committed vs completed points where the
// sprint data carries story points, else a plain completed-points trend.
function JiraVelocitySection() {
  const q = trpc.metrics.sprints.useQuery();
  const all = q.data ?? [];
  const closed = all.filter((s) => s.state === "closed").slice(0, 8).reverse();
  if (closed.length < 2) return null;
  const hasPoints = closed.some((s) => s.hasPoints);

  return (
    <SectionCard title="Velocity" icon={<Gauge size={13} className="text-white/40" />} action={<span className="text-[11px] text-white/30">{hasPoints ? "committed vs completed / sprint" : "points completed / sprint"}</span>}>
      {hasPoints ? (
        <StackedBar
          data={closed.map((s) => ({ name: s.name, committedPoints: s.committedPoints, donePoints: s.donePoints }))}
          keys={[
            { key: "committedPoints", name: "Committed", color: "rgba(255,255,255,0.25)" },
            { key: "donePoints", name: "Completed", color: "rgb(99,102,241)" },
          ]}
          xKey="name"
        />
      ) : (
        <BarTrend points={closed.map((s) => ({ week: s.name, value: s.donePoints }))} color="rgb(99,102,241)" />
      )}
    </SectionCard>
  );
}

function JiraEpicsSection({ onDrill }: { onDrill: (t: DrillTarget) => void }) {
  const q = trpc.metrics.epics.useQuery();
  const epics = (q.data ?? []).slice(0, 8);
  return (
    <SectionCard title="Epics" icon={<Layers size={13} className="text-white/40" />} count={q.data?.length}>
      {q.isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-white/40" /></div>
      ) : epics.length === 0 ? (
        <p className="text-[12px] text-white/30 py-2">No epics found in the synced issues.</p>
      ) : (
        <div className="space-y-2.5">
          {epics.map((e) => {
            const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
            return (
              <button key={e.key} onClick={() => onDrill({ kind: "EPIC", key: e.key, title: e.name })} className="w-full text-left group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] text-white/80 truncate group-hover:text-white flex items-center gap-1.5">
                    {e.name}
                    <ChevronRight size={12} className="text-white/20 group-hover:text-white/50" />
                  </span>
                  <span className="text-[11px] text-white/40 tabular-nums flex-shrink-0">
                    {e.done}/{e.total}
                    {e.hasPoints ? ` · ${e.donePoints}/${e.committedPoints}pt` : ""}
                  </span>
                </div>
                <ProgressBar pct={pct} />
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function JiraReleasesSection({ onDrill }: { onDrill: (t: DrillTarget) => void }) {
  const q = trpc.metrics.releases.useQuery();
  const releases = (q.data ?? []).slice(0, 8);
  return (
    <SectionCard title="Releases" icon={<Rocket size={13} className="text-white/40" />} count={q.data?.length}>
      {q.isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-white/40" /></div>
      ) : releases.length === 0 ? (
        <p className="text-[12px] text-white/30 py-2">No fix versions on the synced issues.</p>
      ) : (
        <div className="space-y-2.5">
          {releases.map((r) => {
            const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
            return (
              <button key={r.name} onClick={() => onDrill({ kind: "RELEASE", key: r.name, title: r.name })} className="w-full text-left group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] text-white/80 truncate group-hover:text-white flex items-center gap-1.5">
                    {r.name}
                    {r.status === "released" && <Chip tone="good">released</Chip>}
                    <ChevronRight size={12} className="text-white/20 group-hover:text-white/50" />
                  </span>
                  <span className="text-[11px] text-white/40 tabular-nums flex-shrink-0">{r.done}/{r.total} ({pct}%)</span>
                </div>
                <ProgressBar pct={pct} color={r.status === "released" ? "bg-emerald-400/80" : "bg-indigo-400"} />
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
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
      {issue.epicKey && (
        <span className="hidden xl:inline text-[10px] text-indigo-300/60 flex-shrink-0" title="Epic">{issue.epicKey}</span>
      )}
      {issue.storyPoints != null && (
        <span className="text-[10px] text-white/45 tabular-nums flex-shrink-0 border border-white/[0.08] rounded px-1.5 py-0.5" title="Story points">
          {issue.storyPoints}
        </span>
      )}
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
