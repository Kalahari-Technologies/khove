"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useBackendFetch, useConnectIntegration } from "@/lib/trpc/api";
import {
  ExternalLink,
  GitPullRequest,
  CircleDot,
  Unplug,
  CheckCircle2,
  XCircle,
  Link2,
  GitMerge,
  Clock,
  UserPlus,
  AlertTriangle,
  Users,
  FolderGit2,
  Sparkles,
} from "lucide-react";
import {
  StatTile,
  SectionCard,
  BreakdownList,
  Chip,
  SyncBanner,
  ago,
  daysSince,
  type Tone,
} from "@/components/integrations/insight-ui";
import { Loader2 } from "lucide-react";
import { AgentActionCard, type AgentActionView } from "@/components/agent/agent-action-card";
import { GitHubScopeDialog } from "@/components/integrations/github-scope-dialog";
import { BarTrend, LineTrend, fmtHours } from "@/components/integrations/metric-charts";
import { trpc } from "@/lib/trpc/client";
import { SlidersHorizontal, Activity, Gauge } from "lucide-react";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
const EMERALD = "rgba(16,185,129,0.55)";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitHubTask {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface GitHubClientProps {
  isConnected: boolean;
  canAdmin: boolean;
  workspaceId: string;
  githubLogin: string | null;
  githubAvatar: string | null;
  account: { login: string; type: string; avatarUrl: string } | null;
  repoCount: number | null;
  tasks: GitHubTask[];
  threadByTaskId: Record<string, { id: string; title: string }>;
  shepherdActions: AgentActionView[];
}

interface Pr {
  id: string;
  title: string;
  number?: number;
  repo?: string;
  author?: string;
  isDraft: boolean;
  reviewers: string[];
  reviewDecision?: string; // approved | changes_requested | pending
  ciStatus?: string; // success | failure | pending
  updatedAt: string;
  externalUrl: string | null;
  closed: boolean;
  thread?: { id: string; title: string };
}

type Bucket = "ci" | "changes" | "ready" | "awaiting" | "no_reviewer" | "draft";

const BUCKET_META: Record<Bucket, { label: string; tone: Tone; icon: typeof Clock }> = {
  ci: { label: "CI failing", tone: "danger", icon: XCircle },
  changes: { label: "Changes requested", tone: "danger", icon: AlertTriangle },
  ready: { label: "Ready to merge", tone: "good", icon: GitMerge },
  awaiting: { label: "Awaiting review", tone: "warn", icon: Clock },
  no_reviewer: { label: "No reviewer", tone: "warn", icon: UserPlus },
  draft: { label: "Draft", tone: "neutral", icon: GitPullRequest },
};
const BUCKET_ORDER: Bucket[] = ["ci", "changes", "awaiting", "no_reviewer", "ready", "draft"];

function parsePr(task: GitHubTask, thread?: { id: string; title: string }): Pr {
  const gh = (task.metadata?.github ?? {}) as Record<string, unknown>;
  return {
    id: task.id,
    title: task.title,
    number: typeof gh.number === "number" ? gh.number : undefined,
    repo: gh.repo as string | undefined,
    author: gh.author as string | undefined,
    isDraft: gh.isDraft === true,
    reviewers: Array.isArray(gh.requestedReviewers) ? (gh.requestedReviewers as string[]) : [],
    reviewDecision: gh.reviewDecision as string | undefined,
    ciStatus: gh.ciStatus as string | undefined,
    updatedAt: (gh.updatedAt as string) ?? task.updatedAt,
    externalUrl: task.externalUrl,
    closed: gh.state === "closed",
    thread,
  };
}

function bucketOf(pr: Pr): Bucket {
  if (pr.isDraft) return "draft";
  if (pr.ciStatus === "failure") return "ci";
  if (pr.reviewDecision === "changes_requested") return "changes";
  if (pr.reviewDecision === "approved") return "ready";
  if (pr.reviewers.length === 0) return "no_reviewer";
  return "awaiting";
}

// ─── Root ───────────────────────────────────────────────────────────────────

export function GitHubClient({
  isConnected,
  workspaceId,
  githubLogin,
  githubAvatar,
  account,
  repoCount,
  tasks,
  threadByTaskId,
  shepherdActions,
}: GitHubClientProps) {
  const router = useRouter();
  const backendFetch = useBackendFetch();
  const connectIntegration = useConnectIntegration();
  const workspace = useWorkspace();
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [filter, setFilter] = useState<Bucket | null>(null);

  // Persistent sync status (server truth via Redis) — the banner survives reloads
  // and shows until the sync actually finishes, so nothing is acted on mid-sync.
  const [syncing, setSyncing] = useState(false);
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await backendFetch(`/api/integrations/github/sync-status?workspaceId=${workspaceId}`, {}, workspaceId);
        const data = (await res.json()) as { status?: string };
        if (!active) return;
        if (data.status === "syncing") {
          setSyncing(true);
          wasSyncing.current = true;
          timer = setTimeout(poll, 3000);
        } else {
          setSyncing(false);
          if (wasSyncing.current) {
            wasSyncing.current = false;
            router.refresh(); // sync just finished — pull the new data in
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
  }, [isConnected, workspaceId]);

  const displayLogin = account?.login ?? githubLogin;
  const displayAvatar = account?.avatarUrl || githubAvatar;
  const isOrg = account?.type === "Organization";

  const { openPrs, issues, insights } = useMemo(() => {
    const prTasks = tasks.filter((t) => (t.metadata?.github as Record<string, unknown>)?.type === "pull_request");
    const issueTasks = tasks.filter((t) => (t.metadata?.github as Record<string, unknown>)?.type === "issue");
    const allPrs = prTasks.map((t) => parsePr(t, threadByTaskId[t.id]));
    const open = allPrs.filter((p) => !p.closed);

    const buckets: Record<Bucket, Pr[]> = { ci: [], changes: [], ready: [], awaiting: [], no_reviewer: [], draft: [] };
    for (const p of open) buckets[bucketOf(p)].push(p);

    const reviewerLoad: Record<string, number> = {};
    const repoLoad: Record<string, number> = {};
    for (const p of open) {
      if (p.repo) repoLoad[p.repo] = (repoLoad[p.repo] ?? 0) + 1;
      if (!p.isDraft) for (const r of p.reviewers) reviewerLoad[r] = (reviewerLoad[r] ?? 0) + 1;
    }
    // Count open issues per repo too, so a repo with only issues still appears.
    for (const t of issueTasks) {
      const repo = (t.metadata?.github as Record<string, unknown>)?.repo as string | undefined;
      if (repo) repoLoad[repo] = (repoLoad[repo] ?? 0) + 1;
    }
    const stale = open.filter((p) => !p.isDraft && p.reviewDecision !== "approved" && daysSince(p.updatedAt) >= 3);

    return {
      openPrs: open,
      issues: issueTasks,
      insights: {
        buckets,
        stale: stale.length,
        threaded: open.filter((p) => p.thread).length,
        reviewerRows: Object.entries(reviewerLoad).map(([label, value]) => ({ label: `@${label}`, value })).sort((a, b) => b.value - a.value),
        repoRows: Object.entries(repoLoad).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      },
    };
  }, [tasks, threadByTaskId]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await backendFetch("/api/integrations/github/disconnect", {
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
          <img src="/assets/github.svg" width={48} height={48} alt="GitHub" className="mb-4" />
          <h2 className="text-[18px] font-semibold text-white mb-2">Connect GitHub</h2>
          <p className="text-[13px] text-white/40 leading-relaxed">
            Install the Khove app to watch pull requests. Khove tracks review + CI state, ties PRs to your
            meetings, and drafts nudges when a review stalls — all approval-gated.
          </p>
        </div>
        <button
          onClick={async () => {
            setConnecting(true);
            try {
              await connectIntegration("github", workspaceId);
            } catch {
              setConnecting(false);
            }
          }}
          disabled={connecting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium bg-white text-black hover:bg-white/90 transition-colors active:scale-[0.98] disabled:opacity-70"
          style={{ transitionTimingFunction: ease }}
        >
          {connecting && <Loader2 size={14} className="animate-spin" />}
          {connecting ? "Opening GitHub…" : "Connect GitHub"}
        </button>
      </div>
    );
  }

  const b = insights.buckets;
  const displayRepoCount = repoCount ?? insights.repoRows.length;

  async function handleResync() {
    setResyncing(true);
    try {
      await backendFetch("/api/integrations/github/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      // The sync runs in the background; refresh shortly to pick up new data.
      setTimeout(() => {
        router.refresh();
        setResyncing(false);
      }, 4000);
    } catch {
      setResyncing(false);
    }
  }

  const tiles: { key: Bucket; label: string; value: number; tone: Tone; icon: typeof Clock }[] = [
    { key: "awaiting", label: "Awaiting review", value: b.awaiting.length, tone: "warn", icon: Clock },
    { key: "no_reviewer", label: "No reviewer", value: b.no_reviewer.length, tone: "warn", icon: UserPlus },
    { key: "changes", label: "Changes requested", value: b.changes.length, tone: "danger", icon: AlertTriangle },
    { key: "ci", label: "CI failing", value: b.ci.length, tone: "danger", icon: XCircle },
    { key: "ready", label: "Ready to merge", value: b.ready.length, tone: "good", icon: GitMerge },
  ];

  const visibleBuckets = BUCKET_ORDER.filter((k) => b[k].length > 0 && (!filter || filter === k));

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {displayAvatar && (
              <img src={displayAvatar} width={36} height={36} alt="" className={isOrg ? "rounded-lg" : "rounded-full"} />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[19px] font-semibold text-white leading-tight">{displayLogin ?? "GitHub"}</h1>
                {isOrg && <Chip tone="neutral">Org</Chip>}
              </div>
              <p className="text-[12px] text-white/40">
                {displayRepoCount} repo{displayRepoCount === 1 ? "" : "s"} · {openPrs.length} open PR
                {openPrs.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {syncing && <SyncBanner label="Syncing your pull requests and issues from GitHub…" />}

        {/* Attention strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {tiles.map((t) => (
            <StatTile
              key={t.key}
              label={t.label}
              value={t.value}
              tone={t.tone}
              icon={<t.icon size={12} />}
              active={filter === t.key}
              onClick={t.value > 0 ? () => setFilter(filter === t.key ? null : t.key) : undefined}
            />
          ))}
        </div>

        {/* Shepherd proposals */}
        {shepherdActions.length > 0 && (
          <SectionCard
            title="Khove suggests"
            icon={<Sparkles size={13} className="text-emerald-300/80" />}
            count={shepherdActions.length}
          >
            <div className="space-y-2.5">
              {shepherdActions.map((a) => (
                <AgentActionCard key={a.id} action={a} compact />
              ))}
            </div>
          </SectionCard>
        )}

        {/* Flow & delivery metrics (DORA-lite, folded from the Signal store) */}
        <FlowSection />

        {/* Scope integrity — merged work not tied to a plan */}
        <ScopeIntegritySection />

        {/* PR pipeline */}
        <SectionCard
          title="Pull request pipeline"
          icon={<GitPullRequest size={13} className="text-white/40" />}
          count={openPrs.length}
          action={
            filter ? (
              <button
                onClick={() => setFilter(null)}
                className="text-[11px] text-white/45 hover:text-white/80 transition-colors"
              >
                Clear filter ✕
              </button>
            ) : insights.stale > 0 ? (
              <Chip tone="warn" icon={<Clock size={10} />}>{insights.stale} stale &gt;3d</Chip>
            ) : null
          }
        >
          {openPrs.length === 0 ? (
            <p className="text-[12px] text-white/30 py-4">No open pull requests. Everything&apos;s merged. 🎉</p>
          ) : visibleBuckets.length === 0 ? (
            <p className="text-[12px] text-white/30 py-4">No PRs in this state.</p>
          ) : (
            <div className="space-y-4">
              {visibleBuckets.map((key) => (
                <BucketGroup
                  key={key}
                  bucket={key}
                  prs={[...b[key]].sort((x, y) => new Date(x.updatedAt).getTime() - new Date(y.updatedAt).getTime())}
                  workspaceSlug={workspace.slug}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard title="Reviewer load" icon={<Users size={13} className="text-white/40" />}>
            <BreakdownList rows={insights.reviewerRows} color={EMERALD} emptyLabel="No reviewers requested yet" />
          </SectionCard>
          <SectionCard title="By repository" icon={<FolderGit2 size={13} className="text-white/40" />}>
            <BreakdownList
              rows={insights.repoRows}
              color={EMERALD}
              emptyLabel={
                displayRepoCount > 0
                  ? `Scanned ${displayRepoCount} repositor${displayRepoCount === 1 ? "y" : "ies"} — no open PRs or issues yet.`
                  : "No repositories synced yet"
              }
            />
          </SectionCard>
        </div>

        {/* Issues */}
        <SectionCard title="Open issues" icon={<CircleDot size={13} className="text-white/40" />} count={issues.length}>
          {issues.length === 0 ? (
            <p className="text-[12px] text-white/30 py-2">No open issues synced.</p>
          ) : (
            <div className="space-y-0.5">
              {issues.map((task) => (
                <IssueRow key={task.id} task={task} workspaceSlug={workspace.slug} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {scopeOpen && <GitHubScopeDialog workspaceId={workspaceId} onClose={() => setScopeOpen(false)} />}
    </div>
  );
}

// ─── PR bucket group ────────────────────────────────────────────────────────

function BucketGroup({ bucket, prs, workspaceSlug }: { bucket: Bucket; prs: Pr[]; workspaceSlug: string }) {
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;
  const dot =
    meta.tone === "good" ? "text-emerald-400" : meta.tone === "danger" ? "text-red-400" : meta.tone === "warn" ? "text-amber-400" : "text-white/40";
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <Icon size={12} className={dot} />
        <span className="text-[11px] font-semibold text-white/60">{meta.label}</span>
        <span className="text-[10px] text-white/30 tabular-nums">{prs.length}</span>
      </div>
      <div className="space-y-0.5">
        {prs.map((pr) => (
          <PrRow key={pr.id} pr={pr} workspaceSlug={workspaceSlug} />
        ))}
      </div>
    </div>
  );
}

function PrRow({ pr, workspaceSlug }: { pr: Pr; workspaceSlug: string }) {
  const stale = !pr.isDraft && pr.reviewDecision !== "approved" && daysSince(pr.updatedAt) >= 3;
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
      <a
        href={`/${workspaceSlug}/tasks/${pr.id}`}
        className="flex-1 min-w-0 text-[13px] text-white/80 truncate hover:text-white hover:underline transition-colors"
      >
        {pr.title}
      </a>

      {pr.reviewers.length > 0 && !pr.isDraft && (
        <span className="hidden lg:inline text-[10px] text-white/35 flex-shrink-0" title="Requested reviewers">
          {pr.reviewers.slice(0, 2).map((r) => `@${r}`).join(" ")}
          {pr.reviewers.length > 2 ? ` +${pr.reviewers.length - 2}` : ""}
        </span>
      )}
      {stale && (
        <span className="text-[10px] text-amber-400/70 flex-shrink-0" title={`No update in ${daysSince(pr.updatedAt)} days`}>
          {ago(pr.updatedAt)}
        </span>
      )}
      {pr.ciStatus === "success" && (
        <CheckCircle2 size={12} className="text-emerald-400/70 flex-shrink-0" aria-label="CI passing" />
      )}
      {pr.thread && (
        <Chip tone="accent" icon={<Link2 size={10} />} title={`Linked to thread: ${pr.thread.title}`}>
          <span className="max-w-[110px] truncate">{pr.thread.title}</span>
        </Chip>
      )}
      {pr.repo && (
        <span className="hidden xl:inline text-[10px] text-white/25 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {pr.repo}
        </span>
      )}
      {pr.externalUrl && (
        <a
          href={pr.externalUrl}
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

function FlowSection() {
  const q = trpc.metrics.flow.useQuery({ provider: "GITHUB" });
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
          No merges in the last {weeks} weeks yet — cycle time, throughput, and DORA metrics fill in as PRs merge.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <StatTile label="Throughput" value={`${m.throughputPerWeek}/wk`} icon={<Gauge size={12} />} hint={`${m.merged} merged`} />
            <StatTile
              label="Cycle time p50"
              value={fmtHours(m.cycleTimeP50Hours)}
              hint={`p90 ${fmtHours(m.cycleTimeP90Hours)}`}
              tone="good"
            />
            <StatTile label="Review latency p50" value={fmtHours(m.reviewLatencyP50Hours)} icon={<Clock size={12} />} />
            <StatTile label="Deploy freq" value={`${m.deployFrequencyPerWeek}/wk`} icon={<GitMerge size={12} />} tone="good" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="text-[11px] text-white/45 mb-1.5">Throughput — merges per week</div>
              <BarTrend points={m.throughputSeries} />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1.5">Cycle time p50 — weekly</div>
              <LineTrend points={m.cycleTimeSeries} format={fmtHours} />
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function ScopeIntegritySection() {
  const q = trpc.metrics.scopeIntegrity.useQuery();
  const d = q.data;
  if (!d || d.merged === 0) return null;

  const tone: Tone = d.plannedPct == null ? "neutral" : d.plannedPct >= 80 ? "good" : d.plannedPct >= 50 ? "warn" : "danger";
  return (
    <SectionCard
      title="Scope integrity"
      icon={<Link2 size={13} className="text-white/40" />}
      action={<span className="text-[11px] text-white/30">last {Math.round(d.windowDays / 7)} weeks</span>}
    >
      <div className="flex items-center gap-3 mb-3">
        <Chip tone={tone}>{d.plannedPct ?? 0}% planned</Chip>
        <span className="text-[12px] text-white/45">
          {d.planned}/{d.merged} merged PRs are tied to a thread · {d.unplanned} unplanned
        </span>
      </div>
      {d.unplanned === 0 ? (
        <p className="text-[12px] text-white/30 py-1">Every merge maps to a plan. 🎯</p>
      ) : (
        <>
          <div className="text-[11px] text-white/45 mb-1.5">Merged without a linked thread</div>
          <div className="space-y-0.5">
            {d.unplannedItems.map((it) => (
              <div key={it.entityKey} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 flex-shrink-0" />
                <span className="flex-1 text-[13px] text-white/75 truncate">{it.title}</span>
                <span className="text-[10px] text-white/30">{ago(it.mergedAt)}</span>
                {it.url && (
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white/60 transition-colors">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function IssueRow({ task, workspaceSlug }: { task: GitHubTask; workspaceSlug: string }) {
  const gh = task.metadata?.github as Record<string, unknown> | undefined;
  const repo = gh?.repo as string | undefined;
  return (
    <div className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.statusColor }} />
      <a
        href={`/${workspaceSlug}/tasks/${task.id}`}
        className="flex-1 min-w-0 text-[13px] text-white/80 truncate hover:text-white hover:underline transition-colors"
      >
        {task.title}
      </a>
      {repo && (
        <span className="text-[10px] text-white/25 flex-shrink-0 hidden lg:group-hover:block">{repo}</span>
      )}
      {task.externalUrl && (
        <a
          href={task.externalUrl}
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
