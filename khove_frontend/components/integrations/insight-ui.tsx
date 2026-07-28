"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Relative time ──────────────────────────────────────────────────────────

/** Compact relative time, e.g. "3d", "5h", "just now". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

/** Whole days since an ISO timestamp. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

// ─── Tones ──────────────────────────────────────────────────────────────────

export type Tone = "neutral" | "good" | "warn" | "danger" | "accent";

const TONE: Record<Tone, { text: string; ring: string; glow: string; dot: string }> = {
  neutral: { text: "text-white/80", ring: "border-white/[0.10]", glow: "rgba(255,255,255,0.06)", dot: "bg-white/40" },
  good: { text: "text-emerald-300", ring: "border-emerald-400/25", glow: "rgba(16,185,129,0.12)", dot: "bg-emerald-400" },
  warn: { text: "text-amber-300", ring: "border-amber-400/25", glow: "rgba(245,158,11,0.12)", dot: "bg-amber-400" },
  danger: { text: "text-red-300", ring: "border-red-400/25", glow: "rgba(244,63,94,0.13)", dot: "bg-red-400" },
  accent: { text: "text-indigo-300", ring: "border-indigo-400/25", glow: "rgba(99,102,241,0.13)", dot: "bg-indigo-400" },
};

// ─── StatTile — a clickable headline metric ─────────────────────────────────

export function StatTile({
  label,
  value,
  tone = "neutral",
  icon,
  hint,
  active = false,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  icon?: ReactNode;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = TONE[tone];
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={[
        "group relative flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-all duration-[140ms]",
        active ? "bg-white/[0.06] " + t.ring : "bg-white/[0.02] border-white/[0.07]",
        clickable ? "hover:bg-white/[0.05] hover:border-white/[0.14] cursor-pointer active:scale-[0.985]" : "cursor-default",
      ].join(" ")}
      style={{ transitionTimingFunction: ease }}
    >
      {active && (
        <span
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ boxShadow: `inset 0 0 0 1px ${t.glow}, 0 0 24px -8px ${t.glow}` }}
        />
      )}
      <div className="flex items-center gap-1.5 text-white/45">
        {icon}
        <span className="text-[11px] font-medium tracking-tight">{label}</span>
      </div>
      <div className={`text-[22px] font-semibold leading-none tabular-nums ${value === 0 ? "text-white/30" : t.text}`}>
        {value}
      </div>
      {hint && <span className="text-[10.5px] text-white/30 leading-tight">{hint}</span>}
    </button>
  );
}

// ─── DistributionBar — stacked horizontal proportion bar ────────────────────

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function DistributionBar({ segments, height = 8 }: { segments: Segment[]; height?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-white/[0.05]" style={{ height }}>
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              title={`${s.label}: ${s.value}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-white/55">{s.label}</span>
            <span className="text-[11px] text-white/35 tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BreakdownList — ranked label + count + mini bar rows ────────────────────

export function BreakdownList({
  rows,
  color = "rgba(255,255,255,0.5)",
  emptyLabel = "Nothing yet",
  max = 6,
}: {
  rows: { label: string; value: number; sub?: string }[];
  color?: string;
  emptyLabel?: string;
  max?: number;
}) {
  if (rows.length === 0) return <p className="text-[12px] text-white/30 py-2">{emptyLabel}</p>;
  const peak = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.slice(0, max).map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-[12px] text-white/70 truncate w-[42%] flex-shrink-0">{r.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / peak) * 100}%`, backgroundColor: color }} />
          </div>
          <span className="text-[11px] text-white/40 tabular-nums w-6 text-right flex-shrink-0">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SectionCard — titled container ─────────────────────────────────────────

export function SectionCard({
  title,
  icon,
  action,
  children,
  count,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-[12px] font-semibold text-white/70 uppercase tracking-wide">{title}</h2>
          {count != null && <span className="text-[11px] text-white/30 tabular-nums">{count}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Initial-sync polling ───────────────────────────────────────────────────

/**
 * After an OAuth callback lands on the page with `?connected=…`, the initial
 * Inngest sync runs asynchronously — data appears a few seconds later. This polls
 * `router.refresh()` (the realtime `task.created` also refreshes) until data
 * arrives or a cap is hit, then strips the query param. Returns whether we're
 * still waiting on the first sync.
 */
export function useInitialSync(hasData: boolean): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const justConnected = !!params.get("connected");
  const [gaveUp, setGaveUp] = useState(false);
  const triesRef = useRef(0);

  const syncing = justConnected && !hasData && !gaveUp;

  useEffect(() => {
    if (!justConnected) return;

    const stripParam = () => {
      const p = new URLSearchParams(params.toString());
      p.delete("connected");
      router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`);
    };

    if (hasData) {
      stripParam();
      return;
    }

    const id = setInterval(() => {
      triesRef.current += 1;
      if (triesRef.current >= 10) {
        clearInterval(id);
        setGaveUp(true);
        stripParam();
        return;
      }
      router.refresh();
    }, 3000);

    return () => clearInterval(id);
  }, [justConnected, hasData, params, pathname, router]);

  return syncing;
}

/** A thin "syncing your data" banner shown while the first sync runs. */
export function SyncBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
      <Loader2 size={14} className="text-white/60 animate-spin flex-shrink-0" />
      <span className="text-[12.5px] text-white/65">{label}</span>
      <span className="text-[11px] text-white/30">This can take a few seconds.</span>
    </div>
  );
}

// ─── Chip — small labelled pill ─────────────────────────────────────────────

export function Chip({
  children,
  tone = "neutral",
  icon,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  title?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none ${t.ring} ${t.text}`}
    >
      {icon}
      {children}
    </span>
  );
}
