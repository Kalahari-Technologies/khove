"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { trpc } from "@/lib/trpc/client";
import {
  Target,
  GitPullRequest,
  CircleDot,
  SquareKanban,
  CheckSquare,
  User,
  Calendar,
  ExternalLink,
  Loader2,
  TrendingDown,
  CalendarClock,
  Gauge,
  FileText,
  Copy,
  X,
} from "lucide-react";
import { SectionCard, StatTile, Chip, ago, type Tone } from "@/components/integrations/insight-ui";
import { BurnupChart } from "@/components/integrations/burnup-chart";

interface LinkView {
  kind: string;
  title: string | null;
  refUrl: string | null;
  refId: string;
  createdAt: string;
}
interface ThreadView {
  id: string;
  title: string;
  summary: string | null;
  targetDate: string | null;
  startedAt: string | null;
  health: string | null;
  links: LinkView[];
}

const HEALTH: Record<string, { label: string; tone: Tone }> = {
  ON_TRACK: { label: "On track", tone: "good" },
  AT_RISK: { label: "At risk", tone: "warn" },
  SLIPPING: { label: "Slipping", tone: "danger" },
  DONE: { label: "Done", tone: "good" },
  NO_TARGET: { label: "No target", tone: "neutral" },
  NO_DATA: { label: "No data", tone: "neutral" },
};

const LINK_ICON: Record<string, typeof GitPullRequest> = {
  GITHUB_PR: GitPullRequest,
  GITHUB_ISSUE: CircleDot,
  JIRA_ISSUE: SquareKanban,
  TASK: CheckSquare,
  PERSON: User,
  CALENDAR_EVENT: Calendar,
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

export function InitiativesClient({ workspaceId, threads }: { workspaceId: string; threads: ThreadView[] }) {
  const { initiatives, others } = useMemo(() => {
    const initiatives = threads.filter((t) => t.targetDate);
    const others = threads.filter((t) => !t.targetDate);
    return { initiatives, others };
  }, [threads]);

  const [selectedId, setSelectedId] = useState<string | null>(initiatives[0]?.id ?? threads[0]?.id ?? null);
  const [reportOpen, setReportOpen] = useState(false);
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="w-[280px] flex-shrink-0 border-r border-white/[0.07] overflow-y-auto">
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-cyan-300/80" />
            <h1 className="text-[15px] font-semibold text-white">Initiatives</h1>
          </div>
          <p className="text-[11.5px] text-white/40 mt-1 leading-relaxed">
            Threads with a target date. Khove folds GitHub merges into a delivery forecast.
          </p>
          <button
            onClick={() => setReportOpen(true)}
            className="mt-3 flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded-lg text-[12px] text-white/70 border border-white/[0.1] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <FileText size={12} /> Weekly update
          </button>
        </div>

        {threads.length === 0 ? (
          <p className="text-[12px] text-white/35 px-4 py-6 leading-relaxed">
            No threads yet. Create a Connectivity Thread from a meeting or in chat, then set a target
            date to track delivery.
          </p>
        ) : (
          <div className="py-2">
            {initiatives.length > 0 && (
              <ListGroup label="Initiatives" items={initiatives} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {others.length > 0 && (
              <ListGroup label="Other threads" items={others} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>
        )}
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <InitiativeDetail key={selected.id} workspaceId={workspaceId} thread={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-[13px] text-white/30">
            Select a thread to see its delivery forecast.
          </div>
        )}
      </div>

      {reportOpen && <StatusReportDialog onClose={() => setReportOpen(false)} />}
    </div>
  );
}

function StatusReportDialog({ onClose }: { onClose: () => void }) {
  const gen = trpc.metrics.statusReport.useMutation();
  const [copied, setCopied] = useState(false);

  // Generate once on open.
  useEffect(() => {
    gen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = gen.data?.report;
  const s = gen.data?.sources;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-cyan-300/80" />
            <h3 className="text-[15px] font-semibold text-white">Weekly update</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="px-5 text-[11.5px] text-white/40 -mt-1 mb-2">
          Auto-drafted from the last 7 days across GitHub, tickets, and calendar. Evidence-only.
        </p>

        <div className="px-5 pb-3 max-h-[52vh] overflow-y-auto">
          {gen.isPending ? (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <div className="text-[13.5px] text-white/85 leading-relaxed whitespace-pre-wrap font-sans">{report}</div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.07]">
          <span className="text-[11px] text-white/35">
            {s ? `${s.merged} merged · ${s.completed} done · ${s.meetings} meetings` : ""}
          </span>
          <button
            disabled={!report}
            onClick={() => {
              if (report) {
                navigator.clipboard.writeText(report).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            <Copy size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListGroup({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string;
  items: ThreadView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="px-4 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-white/35">{label}</div>
      {items.map((t) => {
        const h = HEALTH[t.health ?? "NO_TARGET"] ?? HEALTH.NO_TARGET;
        const active = t.id === selectedId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex flex-col items-start gap-1 w-full px-4 py-2.5 text-left transition-colors ${
              active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
            }`}
          >
            <span className="text-[13px] text-white/85 truncate w-full">{t.title}</span>
            <div className="flex items-center gap-2">
              {t.targetDate && <Chip tone={h.tone}>{h.label}</Chip>}
              {t.targetDate && <span className="text-[10px] text-white/35">{fmtDate(t.targetDate)}</span>}
              <span className="text-[10px] text-white/30">{t.links.length} link{t.links.length === 1 ? "" : "s"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InitiativeDetail({ workspaceId, thread }: { workspaceId: string; thread: ThreadView }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [dateInput, setDateInput] = useState(thread.targetDate ? thread.targetDate.slice(0, 10) : "");

  const delivery = trpc.thread.delivery.useQuery({ id: thread.id });
  const setTarget = trpc.thread.setTarget.useMutation({
    onSuccess: () => {
      utils.thread.delivery.invalidate({ id: thread.id });
      router.refresh();
    },
  });

  const d = delivery.data;
  const h = HEALTH[d?.health ?? thread.health ?? "NO_TARGET"] ?? HEALTH.NO_TARGET;

  const sortedLinks = [...thread.links].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="max-w-3xl mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[19px] font-semibold text-white truncate">{thread.title}</h1>
            {thread.targetDate && <Chip tone={h.tone}>{h.label}</Chip>}
          </div>
          {thread.summary && <p className="text-[13px] text-white/50 mt-1 leading-relaxed">{thread.summary}</p>}
        </div>
      </div>

      {/* Target setter */}
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <CalendarClock size={14} className="text-white/45" />
        <span className="text-[12.5px] text-white/60">Target date</span>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="ml-1 bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1 text-[12.5px] text-white/85 outline-none [color-scheme:dark]"
        />
        <button
          onClick={() => setTarget.mutate({ id: thread.id, targetDate: dateInput ? new Date(dateInput).toISOString() : null })}
          disabled={setTarget.isPending}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {setTarget.isPending && <Loader2 size={11} className="animate-spin" />}
          Save
        </button>
        {thread.targetDate && (
          <button
            onClick={() => {
              setDateInput("");
              setTarget.mutate({ id: thread.id, targetDate: null });
            }}
            className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {delivery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-white/40">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : !thread.targetDate ? (
        <p className="text-[13px] text-white/40 py-4">
          Set a target date above to turn this thread into a tracked initiative with a delivery forecast.
        </p>
      ) : d ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatTile label="Progress" value={`${d.done}/${d.total}`} icon={<CheckSquare size={12} />} hint={`${d.remaining} remaining`} />
            <StatTile label="Velocity" value={`${d.velocityPerWeek}/wk`} icon={<Gauge size={12} />} tone={d.velocityPerWeek > 0 ? "neutral" : "warn"} />
            <StatTile
              label="Projected finish"
              value={d.projectedFinish ? fmtDate(d.projectedFinish) : "—"}
              icon={<CalendarClock size={12} />}
              tone={d.daysProjectedVsTarget != null && d.daysProjectedVsTarget > 0 ? "danger" : "good"}
            />
            <StatTile
              label={d.daysProjectedVsTarget != null && d.daysProjectedVsTarget > 0 ? "Days late" : "Days early"}
              value={d.daysProjectedVsTarget != null ? Math.abs(d.daysProjectedVsTarget) : "—"}
              icon={<TrendingDown size={12} />}
              tone={d.daysProjectedVsTarget != null && d.daysProjectedVsTarget > 0 ? "danger" : "good"}
            />
          </div>

          {/* Burn-up */}
          <SectionCard title="Burn-up to target" icon={<Target size={13} className="text-white/40" />}>
            <BurnupChart burnup={d.burnup} targetDate={d.targetDate} projectedFinish={d.projectedFinish} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-white/45">
              <Legend color="rgb(16,185,129)">Merged</Legend>
              <Legend color="rgba(255,255,255,0.3)">Total scope</Legend>
              <Legend color="rgba(244,63,94,0.7)">Target</Legend>
              <Legend color="rgba(245,158,11,0.85)">Projected</Legend>
            </div>
          </SectionCard>

          {/* Blockers */}
          {d.blockers.length > 0 && (
            <SectionCard title="What's blocking it" icon={<TrendingDown size={13} className="text-amber-300/70" />} count={d.blockers.length}>
              <div className="space-y-0.5">
                {d.blockers.map((b) => (
                  <div key={b.taskId} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 flex-shrink-0" />
                    <span className="flex-1 text-[13px] text-white/80 truncate">{b.title}</span>
                    <Chip tone="warn">{b.reason}</Chip>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      ) : null}

      {/* Timeline */}
      <SectionCard title="Connectivity timeline" icon={<CircleDot size={13} className="text-white/40" />} count={sortedLinks.length}>
        {sortedLinks.length === 0 ? (
          <p className="text-[12px] text-white/30 py-2">Nothing linked yet.</p>
        ) : (
          <div className="space-y-0.5">
            {sortedLinks.map((l, i) => {
              const Icon = LINK_ICON[l.kind] ?? CircleDot;
              return (
                <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                  <Icon size={13} className="text-white/40 flex-shrink-0" />
                  <span className="flex-1 text-[13px] text-white/75 truncate">{l.title ?? l.kind}</span>
                  <span className="text-[10px] text-white/30">{ago(l.createdAt)}</span>
                  {l.refUrl && (
                    <a href={l.refUrl} target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white/60 transition-colors">
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-[2px] rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}
