"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipProps,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { chartDateLabel, roundTip } from "@/lib/format";

export interface Point {
  week: string;
  value: number | null;
}

/** Format an hours value as a compact duration. */
export function fmtHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return "<1h";
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

// ─── Shared dark-theme axis + tooltip ───────────────────────────────────────

const AXIS = { stroke: "rgba(255,255,255,0.28)", fontSize: 10, tickLine: false, axisLine: false } as const;
const GRID = "rgba(255,255,255,0.06)";

function DarkTooltip({ active, payload, label, fmt }: TooltipProps<number, string> & { fmt?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0d0d0f] px-2.5 py-1.5 shadow-xl">
      <div className="mb-0.5 text-[10.5px] text-white/45">{chartDateLabel(label)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5 text-[11.5px] text-white/85">
          <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: p.color ?? "#fff" }} />
          {p.name ? <span className="text-white/50">{p.name}</span> : null}
          <span className="tabular-nums font-medium">
            {p.value == null ? "—" : fmt ? fmt(Number(p.value)) : roundTip(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ height }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-white/25">
        <LineChartIcon size={16} />
      </span>
      <span className="text-[11.5px] text-white/35">Not enough history yet.</span>
    </div>
  );
}

// ─── Bar trend (e.g. throughput) ────────────────────────────────────────────

export function BarTrend({ points, color = "rgb(16,185,129)", height = 120 }: { points: Point[]; color?: string; height?: number }) {
  if (points.length === 0) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -18 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" minTickGap={16} tickFormatter={chartDateLabel} />
        <YAxis {...AXIS} width={30} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip />} />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={34} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Line trend (e.g. cycle-time p50). Nulls create gaps. ───────────────────

export function LineTrend({
  points,
  color = "rgb(56,189,248)",
  height = 120,
  format = (n: number) => String(n),
}: {
  points: Point[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" minTickGap={16} tickFormatter={chartDateLabel} />
        <YAxis {...AXIS} width={34} tickFormatter={(v) => format(Number(v))} />
        <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)" }} content={<DarkTooltip fmt={format} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: color }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Sprint burndown — actual remaining (solid) vs. ideal (dashed) ──────────

interface BurndownPoint {
  date: string;
  remaining: number | null;
  ideal: number;
}

export function Burndown({ committed, series, height = 150 }: { committed: number; series: BurndownPoint[]; height?: number }) {
  if (series.length < 2 || committed <= 0) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" minTickGap={20} tickFormatter={chartDateLabel} />
        <YAxis {...AXIS} width={30} domain={[0, committed]} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)" }} content={<DarkTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.10)" />
        <Line name="Ideal" type="linear" dataKey="ideal" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <Line name="Remaining" type="monotone" dataKey="remaining" stroke="rgb(99,102,241)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "rgb(99,102,241)" }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Area trend (e.g. opened vs merged over time) ───────────────────────────

export function AreaTrend({ points, color = "rgb(56,189,248)", height = 120 }: { points: Point[]; color?: string; height?: number }) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <Empty height={height} />;
  const gid = `area-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" minTickGap={16} tickFormatter={chartDateLabel} />
        <YAxis {...AXIS} width={30} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)" }} content={<DarkTooltip />} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gid})`} connectNulls={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Stacked bar (e.g. sprint velocity: committed vs completed) ──────────────

export interface StackSeries {
  key: string;
  name: string;
  color: string;
}

export function StackedBar({
  data,
  keys,
  xKey,
  height = 140,
}: {
  data: Record<string, string | number>[];
  keys: StackSeries[];
  xKey: string;
  height?: number;
}) {
  if (data.length === 0) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={12} tickFormatter={chartDateLabel} />
        <YAxis {...AXIS} width={30} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip />} />
        {keys.map((k, i) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            name={k.name}
            stackId="a"
            fill={k.color}
            radius={i === keys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={34}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Donut (e.g. PR pipeline / status distribution) ─────────────────────────

export interface DonutDatum {
  name: string;
  value: number;
}

// White-opacity ramp — strict B&W system; a single accent slice is allowed via `colors`.
const DONUT_RAMP = [
  "rgba(255,255,255,0.85)",
  "rgba(255,255,255,0.55)",
  "rgba(255,255,255,0.38)",
  "rgba(255,255,255,0.26)",
  "rgba(255,255,255,0.16)",
  "rgba(255,255,255,0.10)",
];

export function Donut({
  data,
  colors,
  height = 150,
  centerLabel,
}: {
  data: DonutDatum[];
  colors?: string[];
  height?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <Empty height={height} />;
  const palette = colors ?? DONUT_RAMP;
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip content={<DarkTooltip />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-white/90">{total}</span>
          {centerLabel ? <span className="text-[10px] uppercase tracking-wide text-white/40">{centerLabel}</span> : null}
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-1.5 text-[11.5px]">
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: palette[i % palette.length] }} />
            <span className="min-w-0 flex-1 truncate text-white/55">{d.name}</span>
            <span className="tabular-nums font-medium text-white/85">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Sparkline — tiny, axis-less line for inline KPI cards ───────────────────

export function Sparkline({
  points,
  color = "rgb(56,189,248)",
  height = 28,
}: {
  points: { value: number | null }[];
  color?: string;
  height?: number;
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
