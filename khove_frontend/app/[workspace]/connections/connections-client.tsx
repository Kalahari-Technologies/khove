"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { trpc } from "@/lib/trpc/client";
import { SectionCard, StatTile, Chip, EmptyState, ago } from "@/components/integrations/insight-ui";
import { RichText } from "@/components/rich-text";
import { ProviderIcon } from "@/components/provider-icon";
import { entityLabelText, splitKeyTitle } from "@/lib/activity-format";
import { ThreadsPanel } from "./thread-panel";
import {
  Activity,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  CircleDot,
  CircleCheck,
  RefreshCw,
  MessageSquare,
  Eye,
  Rocket,
  Calendar,
  Link2,
  TriangleAlert,
  Sparkles,
  CheckCircle2,
  Target,
  X,
} from "lucide-react";

// ─── Provider + kind vocabulary ─────────────────────────────────────────────

const PROVIDER: Record<string, { label: string; color: string }> = {
  GITHUB: { label: "GitHub", color: "#10B981" },
  JIRA: { label: "Jira", color: "#6366F1" },
  GOOGLE_CALENDAR: { label: "Calendar", color: "#F43F5E" },
};

const KIND: Record<string, { verb: string; icon: ReactNode; tone: string }> = {
  WORK_OPENED: { verb: "opened", icon: <GitPullRequestArrow size={12} />, tone: "text-sky-300/80" },
  WORK_MERGED: { verb: "merged", icon: <GitMerge size={12} />, tone: "text-violet-300/80" },
  WORK_CLOSED: { verb: "closed", icon: <CircleCheck size={12} />, tone: "text-emerald-300/80" },
  WORK_REOPENED: { verb: "reopened", icon: <RefreshCw size={12} />, tone: "text-amber-300/80" },
  REVIEW_REQUESTED: { verb: "requested review on", icon: <Eye size={12} />, tone: "text-amber-300/80" },
  REVIEW_SUBMITTED: { verb: "reviewed", icon: <Eye size={12} />, tone: "text-emerald-300/80" },
  STATUS_CHANGED: { verb: "moved", icon: <CircleDot size={12} />, tone: "text-sky-300/80" },
  CI_COMPLETED: { verb: "CI ran on", icon: <Activity size={12} />, tone: "text-white/50" },
  DEPLOY: { verb: "deployed", icon: <Rocket size={12} />, tone: "text-emerald-300/80" },
  COMMENT: { verb: "commented on", icon: <MessageSquare size={12} />, tone: "text-white/50" },
  MEETING_HELD: { verb: "met about", icon: <Calendar size={12} />, tone: "text-rose-300/80" },
  DECISION: { verb: "decided", icon: <Sparkles size={12} />, tone: "text-violet-300/80" },
};

function shortEntity(entityKey: string): string {
  // "jira-TROCO-14" → "TROCO-14" ; "github-pr-org/web-123" → "org/web #123"
  if (entityKey.startsWith("jira-")) return entityKey.slice(5);
  const gh = entityKey.match(/^github-(?:pr|issue)-(.+)-(\d+)$/);
  if (gh) return `${gh[1]} #${gh[2]}`;
  return entityKey;
}

// ─── Cockpit ────────────────────────────────────────────────────────────────

export function ConnectionsClient({
  workspaceId,
  githubConnected,
  jiraConnected,
}: {
  workspaceId: string;
  githubConnected: boolean;
  jiraConnected: boolean;
}) {
  const { slug } = useWorkspace();
  const anyConnected = githubConnected || jiraConnected;

  const activity = trpc.metrics.activity.useQuery({ limit: 80 }, { enabled: anyConnected });
  const gaps = trpc.metrics.crossToolIntegrity.useQuery(undefined, { enabled: githubConnected && jiraConnected });
  const scope = trpc.metrics.scopeIntegrity.useQuery(undefined, { enabled: githubConnected });

  const gapCount =
    (gaps.data?.codeAheadOfTicket.length ?? 0) + (gaps.data?.doneWithOpenPr.length ?? 0);
  const unplanned = scope.data?.unplanned ?? 0;
  const events = activity.data?.length ?? 0;

  if (!anyConnected) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            <Link2 size={20} className="text-white/50" />
          </div>
          <h1 className="text-[18px] font-semibold text-white">Your tools, thinking together</h1>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-white/45">
            Connect GitHub and Jira and this becomes the one place that watches delivery across
            them — a live cross-tool timeline, and every spot where your ticket status and your
            code disagree.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2.5">
            <Link href={`/${slug}/github`} className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 py-2 text-[13px] text-white/80 hover:bg-white/[0.07]">
              Connect GitHub
            </Link>
            <Link href={`/${slug}/jira`} className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 py-2 text-[13px] text-white/80 hover:bg-white/[0.07]">
              Connect Jira
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="w-full px-6 py-7 xl:px-10 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-semibold text-white tracking-tight">Connections</h1>
            <p className="mt-0.5 text-[12.5px] text-white/45">
              Where your tools meet — and where they disagree.
            </p>
          </div>
          <WeeklyUpdateButton />
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatTile
            label="Delivery gaps"
            value={gapCount}
            tone={gapCount > 0 ? "danger" : "good"}
            icon={<Link2 size={12} />}
            hint="Jira ↔ GitHub disagree"
          />
          <StatTile
            label="Unplanned work"
            value={unplanned}
            tone={unplanned > 0 ? "warn" : "good"}
            icon={<TriangleAlert size={12} />}
            hint="merged, no ticket"
          />
          <StatTile
            label="Linked tickets"
            value={gaps.data?.linkedTickets ?? 0}
            tone="accent"
            icon={<GitPullRequest size={12} />}
            hint="tracked across tools"
          />
          <StatTile
            label="Recent events"
            value={events}
            tone="neutral"
            icon={<Activity size={12} />}
            hint="latest signals"
          />
        </div>

        {/* Main: timeline (hero) + gaps column */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ActivityTimeline items={activity.data ?? []} loading={activity.isLoading} />
          </div>
          <div className="space-y-5">
            <ThreadsPanel />
            <CrossToolGaps />
            <UnplannedWork />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Cross-tool activity timeline (the centerpiece) ─────────────────────────

type ActivityItem = {
  id: string;
  provider: string;
  kind: string;
  entityKey: string;
  title: string | null;
  url: string | null;
  source: string | null;
  actor: string | null;
  occurredAt: string;
};

function ActivityTimeline({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  return (
    <SectionCard
      title="Cross-tool activity"
      icon={<Activity size={13} className="text-white/40" />}
      action={<span className="text-[11px] text-white/30">Jira · GitHub</span>}
    >
      {loading ? (
        <div className="py-10 text-center text-[12.5px] text-white/30">Loading activity…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Activity size={18} />}
          message="No activity yet — it fills in as PRs move and tickets change."
        />
      ) : (
        <div className="space-y-0.5">
          {items.map((it) => {
            const p = PROVIDER[it.provider] ?? { label: it.provider, color: "#71717A" };
            const k = KIND[it.kind] ?? { verb: it.kind.toLowerCase().replace(/_/g, " "), icon: <CircleDot size={12} />, tone: "text-white/50" };
            const kt = it.title ? splitKeyTitle(it.title) : null;
            const label =
              kt && kt.key ? (
                <>
                  <span className="font-semibold text-white/90">{kt.key}</span> {kt.rest}
                </>
              ) : it.title ? (
                it.title
              ) : (
                entityLabelText(it.entityKey)
              );
            return (
              <div key={it.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${p.color}1a`, color: p.color }}>
                  {k.icon}
                </span>
                <span className={`hidden sm:inline text-[11px] flex-shrink-0 ${k.tone}`}>{k.verb}</span>
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[13px] text-white/80 hover:text-white">
                    {label}
                  </a>
                ) : (
                  <span className="flex-1 min-w-0 truncate text-[13px] text-white/70">{label}</span>
                )}
                {it.source && (
                  <span className="hidden md:inline text-[10.5px] text-white/30 flex-shrink-0 max-w-[140px] truncate">{it.source.split("/").pop()}</span>
                )}
                <span className="flex-shrink-0 text-[10.5px] text-white/30 tabular-nums">{ago(it.occurredAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Cross-tool gaps (elevated from the Jira page) ──────────────────────────

function CrossToolGaps() {
  const q = trpc.metrics.crossToolIntegrity.useQuery();
  const { slug } = useWorkspace();
  const d = q.data;
  const empty = !d || (d.codeAheadOfTicket.length === 0 && d.doneWithOpenPr.length === 0);

  const Row = ({ g }: { g: NonNullable<typeof d>["codeAheadOfTicket"][number] }) => (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
      <span className="w-[64px] flex-shrink-0 truncate font-mono text-[10.5px] text-white/35">{g.issueKey}</span>
      <Link href={`/${slug}/tasks/${g.taskId}`} className="flex-1 min-w-0 truncate text-[12.5px] text-white/80 hover:text-white">
        {g.title}
      </Link>
    </div>
  );

  return (
    <SectionCard
      title="Where tools disagree"
      icon={<Link2 size={13} className="text-white/40" />}
      action={<span className="text-[11px] text-white/30">Jira ↔ GitHub</span>}
    >
      {empty ? (
        <EmptyState icon={<CheckCircle2 size={18} />} message="Jira and GitHub are in sync. 🎯" />
      ) : (
        <div className="space-y-3">
          {d!.codeAheadOfTicket.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300/80">
                <GitMerge size={11} /> Code merged, ticket not closed ({d!.codeAheadOfTicket.length})
              </div>
              <div className="space-y-0.5">{d!.codeAheadOfTicket.slice(0, 6).map((g) => <Row key={g.taskId} g={g} />)}</div>
            </div>
          )}
          {d!.doneWithOpenPr.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-red-300/80">
                <GitPullRequest size={11} /> Marked done, code still open ({d!.doneWithOpenPr.length})
              </div>
              <div className="space-y-0.5">{d!.doneWithOpenPr.slice(0, 6).map((g) => <Row key={g.taskId} g={g} />)}</div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Unplanned work (scope integrity, elevated from GitHub page) ────────────

function UnplannedWork() {
  const q = trpc.metrics.scopeIntegrity.useQuery();
  const d = q.data;
  if (!d || d.unplanned === 0) {
    return (
      <SectionCard title="Unplanned work" icon={<TriangleAlert size={13} className="text-white/40" />}>
        <EmptyState
          icon={<Target size={18} />}
          message={d ? "Every merge traces to a plan." : "Connect GitHub to track scope."}
        />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Unplanned work"
      icon={<TriangleAlert size={13} className="text-white/40" />}
      action={<Chip tone="warn">{d.plannedPct ?? 0}% planned</Chip>}
    >
      <p className="mb-2 text-[11.5px] text-white/40">Merged code with no linked ticket or thread — {d.unplanned} of {d.merged}.</p>
      <div className="space-y-0.5">
        {d.unplannedItems.slice(0, 6).map((it) => {
          const label = it.title && !/^(github-|jira-)/.test(it.title) ? it.title : entityLabelText(it.entityKey);
          return (
            <div key={it.entityKey} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
              <ProviderIcon provider="github" size={13} className="shrink-0 opacity-70" />
              {it.url ? (
                <a href={it.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[12.5px] text-white/80 hover:text-white">{label}</a>
              ) : (
                <span className="flex-1 min-w-0 truncate text-[12.5px] text-white/70">{label}</span>
              )}
              <span className="flex-shrink-0 text-[10.5px] text-white/30 tabular-nums">{ago(it.mergedAt)}</span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Weekly update (status report mutation) ─────────────────────────────────

function WeeklyUpdateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/80 hover:bg-white/[0.07] transition-colors"
      >
        <Sparkles size={13} className="text-white/50" /> Weekly update
      </button>
      {open && <WeeklyUpdateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function WeeklyUpdateDialog({ onClose }: { onClose: () => void }) {
  const gen = trpc.metrics.statusReport.useMutation();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    gen.mutate();
  }, [gen]);
  const report = gen.data?.report;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
            <Sparkles size={14} className="text-white/50" /> Weekly update
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X size={16} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {gen.isPending ? (
            <div className="py-10 text-center text-[13px] text-white/40">Summarizing the last 7 days across your tools…</div>
          ) : (
            <RichText content={report ?? "Couldn't generate the update."} className="text-[13.5px] leading-relaxed text-white/85" />
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          <button
            disabled={!report}
            onClick={() => report && navigator.clipboard.writeText(report).catch(() => {})}
            className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/80 hover:bg-white/[0.07] disabled:opacity-40"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
