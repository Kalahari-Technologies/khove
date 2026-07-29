"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipProps,
} from "recharts";

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
      <div className="mb-0.5 text-[10.5px] text-white/45">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5 text-[11.5px] text-white/85">
          <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: p.color ?? "#fff" }} />
          {p.name ? <span className="text-white/50">{p.name}</span> : null}
          <span className="tabular-nums font-medium">
            {p.value == null ? "—" : fmt ? fmt(Number(p.value)) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-[11.5px] text-white/30" style={{ height }}>
      Not enough history yet.
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
        <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" minTickGap={16} />
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
        <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" minTickGap={16} />
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
        <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" minTickGap={20} />
        <YAxis {...AXIS} width={30} domain={[0, committed]} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)" }} content={<DarkTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.10)" />
        <Line name="Ideal" type="linear" dataKey="ideal" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <Line name="Remaining" type="monotone" dataKey="remaining" stroke="rgb(99,102,241)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "rgb(99,102,241)" }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
