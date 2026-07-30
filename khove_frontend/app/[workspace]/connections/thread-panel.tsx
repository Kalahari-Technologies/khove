"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc/client";
import { SectionCard, Chip, EmptyState } from "@/components/integrations/insight-ui";
import {
  Waypoints,
  Plus,
  X,
  GitPullRequest,
  CircleDot,
  SquareKanban,
  CheckSquare,
  User,
  Calendar,
  Search,
  Trash2,
} from "lucide-react";

// Link-kind visual vocabulary (mirrors the initiatives connectivity timeline).
const KIND_META: Record<string, { icon: typeof GitPullRequest; color: string; label: string }> = {
  GITHUB_PR: { icon: GitPullRequest, color: "#10B981", label: "PR" },
  GITHUB_ISSUE: { icon: CircleDot, color: "#10B981", label: "Issue" },
  JIRA_ISSUE: { icon: SquareKanban, color: "#6366F1", label: "Jira" },
  TASK: { icon: CheckSquare, color: "#94A3B8", label: "Task" },
  PERSON: { icon: User, color: "#F59E0B", label: "Person" },
  CALENDAR_EVENT: { icon: Calendar, color: "#F43F5E", label: "Meeting" },
};

type ThreadLink = { id: string; kind: string; refId: string; refUrl?: string | null; title?: string | null };
type Thread = { id: string; title: string; links: ThreadLink[] };

// ─── Panel: list of threads + create ────────────────────────────────────────

export function ThreadsPanel() {
  const q = trpc.thread.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const threads = (q.data ?? []) as Thread[];

  return (
    <SectionCard
      title="Threads"
      icon={<Waypoints size={13} className="text-white/40" />}
      action={
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1 text-[11.5px] text-white/75 hover:bg-white/[0.07]"
        >
          <Plus size={12} /> New
        </button>
      }
    >
      {threads.length === 0 ? (
        <EmptyState
          icon={<Waypoints size={18} />}
          message="A thread ties a piece of work across tools — a meeting, its PRs, its ticket, the people."
        />
      ) : (
        <div className="space-y-0.5">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
            >
              <Waypoints size={13} className="flex-shrink-0 text-white/35" />
              <span className="flex-1 min-w-0 truncate text-[13px] text-white/80">{t.title}</span>
              <span className="flex -space-x-1">
                {[...new Set(t.links.map((l) => l.kind))].slice(0, 4).map((k) => {
                  const m = KIND_META[k] ?? KIND_META.TASK;
                  const Icon = m.icon;
                  return (
                    <span key={k} className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-black" style={{ backgroundColor: `${m.color}22`, color: m.color }}>
                      <Icon size={9} />
                    </span>
                  );
                })}
              </span>
              <span className="flex-shrink-0 text-[10.5px] text-white/30">{t.links.length}</span>
            </button>
          ))}
        </div>
      )}
      {creating && <CreateThreadDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); q.refetch(); }} />}
      {openId && <ThreadGraphDialog threadId={openId} onClose={() => { setOpenId(null); q.refetch(); }} />}
    </SectionCard>
  );
}

// ─── Create thread ──────────────────────────────────────────────────────────

function CreateThreadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const create = trpc.thread.create.useMutation({ onSuccess: (t) => onCreated(t.id) });
  return (
    <Modal onClose={onClose} title="New thread">
      <div className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) create.mutate({ title: title.trim() }); }}
          placeholder="e.g. Checkout redesign"
          className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
        />
        <p className="text-[11.5px] text-white/40">
          A thread is one work item spanning your tools. Create it, then link its PRs, tickets, and meetings.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12.5px] text-white/60 hover:text-white/90">Cancel</button>
          <button
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate({ title: title.trim() })}
            className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-medium text-black hover:bg-white/90 disabled:opacity-40"
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Graph modal (visualize + link + unlink) ────────────────────────────────

function ThreadGraphDialog({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const q = trpc.thread.get.useQuery({ id: threadId });
  const utils = trpc.useUtils();
  const unlink = trpc.thread.unlink.useMutation({ onSuccess: () => utils.thread.get.invalidate({ id: threadId }) });
  const [linking, setLinking] = useState(false);
  const thread = q.data as Thread | undefined;

  return (
    <Modal onClose={onClose} title={thread?.title ?? "Thread"} wide>
      {!thread ? (
        <div className="py-16 text-center text-[13px] text-white/40">Loading…</div>
      ) : (
        <div className="space-y-4">
          <ThreadGraph title={thread.title} links={thread.links} />
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-white/40">{thread.links.length} linked item{thread.links.length === 1 ? "" : "s"}</span>
            <button
              onClick={() => setLinking(true)}
              className="flex items-center gap-1 rounded-md border border-white/[0.10] bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/75 hover:bg-white/[0.07]"
            >
              <Plus size={12} /> Link work item
            </button>
          </div>
          {thread.links.length > 0 && (
            <div className="space-y-0.5">
              {thread.links.map((l) => {
                const m = KIND_META[l.kind] ?? KIND_META.TASK;
                const Icon = m.icon;
                return (
                  <div key={l.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${m.color}1a`, color: m.color }}>
                      <Icon size={12} />
                    </span>
                    {l.refUrl ? (
                      <a href={l.refUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[12.5px] text-white/80 hover:text-white">{l.title ?? l.refId}</a>
                    ) : (
                      <span className="flex-1 min-w-0 truncate text-[12.5px] text-white/75">{l.title ?? l.refId}</span>
                    )}
                    <button onClick={() => unlink.mutate({ linkId: l.id, threadId })} className="text-white/25 hover:text-red-400" title="Unlink">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {linking && (
            <LinkPicker
              threadId={threadId}
              existing={new Set(thread.links.map((l) => l.refId))}
              onClose={() => setLinking(false)}
              onLinked={() => { utils.thread.get.invalidate({ id: threadId }); }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Radial node-link graph ─────────────────────────────────────────────────

function ThreadGraph({ title, links }: { title: string; links: ThreadLink[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = 260;
  const cx = w / 2;
  const cy = H / 2;
  const r = Math.min(w, H) / 2 - 46;
  const nodes = useMemo(
    () =>
      links.map((l, i) => {
        const angle = (2 * Math.PI * i) / Math.max(links.length, 1) - Math.PI / 2;
        return { l, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      }),
    [links, cx, cy, r],
  );

  return (
    <div ref={ref} className="relative rounded-xl border border-white/[0.06] bg-white/[0.015]" style={{ height: H }}>
      {w > 0 && (
        <>
          <svg width={w} height={H} className="absolute inset-0">
            {nodes.map((n) => (
              <line key={n.l.id} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            ))}
          </svg>
          {/* center — the thread */}
          <div
            className="absolute flex max-w-[150px] items-center gap-1.5 rounded-full border border-white/15 bg-[#141418] px-3 py-1.5 shadow-lg"
            style={{ left: cx, top: cy, transform: "translate(-50%,-50%)" }}
          >
            <Waypoints size={13} className="flex-shrink-0 text-fuchsia-300" />
            <span className="truncate text-[12px] font-medium text-white">{title}</span>
          </div>
          {/* leaves — the linked work items */}
          {nodes.map((n) => {
            const m = KIND_META[n.l.kind] ?? KIND_META.TASK;
            const Icon = m.icon;
            const node = (
              <span className="flex items-center gap-1.5 rounded-full border px-2 py-1 shadow" style={{ borderColor: `${m.color}55`, backgroundColor: "#0d0d0f" }}>
                <Icon size={11} style={{ color: m.color }} />
                <span className="max-w-[120px] truncate text-[10.5px] text-white/75">{n.l.title ?? m.label}</span>
              </span>
            );
            return (
              <div key={n.l.id} className="absolute" style={{ left: n.x, top: n.y, transform: "translate(-50%,-50%)" }}>
                {n.l.refUrl ? <a href={n.l.refUrl} target="_blank" rel="noreferrer">{node}</a> : node}
              </div>
            );
          })}
          {links.length === 0 && (
            <div className="absolute inset-x-0 bottom-4">
              <EmptyState
                icon={<Waypoints size={18} />}
                message="No links yet — add a PR, ticket, or meeting."
                className="py-0"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Link picker — pick a synced work item (Task) to link ───────────────────

function LinkPicker({
  threadId,
  existing,
  onClose,
  onLinked,
}: {
  threadId: string;
  existing: Set<string>;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [term, setTerm] = useState("");
  const tasks = trpc.task.list.useQuery({ limit: 200 });
  const link = trpc.thread.link.useMutation({ onSuccess: onLinked });
  const items = useMemo(() => {
    const all = (tasks.data?.items ?? []) as { id: string; title: string; source: string[]; externalUrl: string | null }[];
    const q = term.toLowerCase();
    return all
      .filter((t) => (t.source.includes("JIRA") || t.source.includes("GITHUB")) && !existing.has(t.id))
      .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [tasks.data, term, existing]);

  return (
    <Modal onClose={onClose} title="Link a work item">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5">
        <Search size={13} className="text-white/35" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search PRs & tickets…"
          className="w-full bg-transparent py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none"
        />
      </div>
      <div className="max-h-[45vh] space-y-0.5 overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-white/30">No matching synced work items.</div>
        ) : (
          items.map((t) => {
            const kind = t.source.includes("JIRA") ? "JIRA_ISSUE" : "GITHUB_PR";
            const m = KIND_META[kind];
            const Icon = m.icon;
            return (
              <button
                key={t.id}
                disabled={link.isPending}
                onClick={() => link.mutate({ threadId, kind: "TASK", refId: t.id, title: t.title, refUrl: t.externalUrl ?? undefined })}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04] disabled:opacity-50"
              >
                <Icon size={13} style={{ color: m.color }} className="flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[12.5px] text-white/80">{t.title}</span>
                <Plus size={13} className="flex-shrink-0 text-white/30" />
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}

// ─── Modal shell ────────────────────────────────────────────────────────────

function Modal({ onClose, title, children, wide }: { onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-white truncate">
            <Waypoints size={14} className="flex-shrink-0 text-white/50" /> <span className="truncate">{title}</span>
          </div>
          <button onClick={onClose} className="flex-shrink-0 text-white/40 hover:text-white/80"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
