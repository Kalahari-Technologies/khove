"use client";

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

/** Weekly bar chart (e.g. throughput). */
export function BarTrend({ points, color = "rgb(16,185,129)", height = 96 }: { points: Point[]; color?: string; height?: number }) {
  if (points.length === 0) return <Empty height={height} />;
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const W = 640;
  const padB = 14;
  const gap = 2;
  const bw = (W - gap * (points.length - 1)) / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {points.map((p, i) => {
        const v = p.value ?? 0;
        const h = (v / max) * (height - padB);
        return (
          <rect
            key={p.week}
            x={i * (bw + gap)}
            y={height - padB - h}
            width={bw}
            height={Math.max(h, v > 0 ? 2 : 0)}
            rx={1.5}
            fill={color}
            opacity={v > 0 ? 0.85 : 0.15}
          >
            <title>{`${p.week}: ${v}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Weekly line chart (e.g. cycle-time p50). Nulls create gaps. */
export function LineTrend({
  points,
  color = "rgb(56,189,248)",
  height = 96,
  format = (n: number) => String(n),
}: {
  points: Point[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <Empty height={height} />;
  const max = Math.max(...vals);
  const min = Math.min(...vals, 0);
  const W = 640;
  const padT = 8;
  const padB = 14;
  const padR = 4;
  const x = (i: number) => (i / (points.length - 1)) * (W - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (height - padT - padB);

  // Build path segments, breaking on nulls.
  const segments: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
    } else {
      cur.push(`${x(i)},${y(p.value)}`);
    }
  });
  if (cur.length) segments.push(cur.join(" "));

  const lastIdx = [...points].map((p, i) => (p.value != null ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  const lastVal = points[lastIdx]?.value ?? null;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <line x1={0} x2={W - padR} y1={y(max)} y2={y(max)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      <line x1={0} x2={W - padR} y1={y(min)} y2={y(min)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      {segments.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {lastVal != null && <circle cx={x(lastIdx)} cy={y(lastVal)} r={2.5} fill={color} />}
      <text x={4} y={y(max) - 3} fontSize={9} fill="rgba(255,255,255,0.35)">{format(max)}</text>
    </svg>
  );
}

interface BurndownPoint {
  date: string;
  remaining: number | null;
  ideal: number;
}

/** Sprint burndown — actual remaining (solid) vs. ideal (dashed), points down to 0. */
export function Burndown({ committed, series, height = 128 }: { committed: number; series: BurndownPoint[]; height?: number }) {
  if (series.length < 2 || committed <= 0) return <Empty height={height} />;
  const W = 640;
  const padT = 8;
  const padB = 16;
  const padL = 22;
  const n = series.length - 1;
  const x = (i: number) => padL + (i / n) * (W - padL - 4);
  const y = (v: number) => padT + (1 - v / committed) * (height - padT - padB);

  const idealPts = series.map((p, i) => `${x(i)},${y(p.ideal)}`).join(" ");
  const actualPts: string[] = [];
  series.forEach((p, i) => {
    if (p.remaining != null) actualPts.push(`${x(i)},${y(p.remaining)}`);
  });
  const lastActualIdx = series.map((p, i) => (p.remaining != null ? i : -1)).filter((i) => i >= 0).pop() ?? 0;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <line x1={padL} x2={W - 4} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <line x1={padL} x2={W - 4} y1={y(committed)} y2={y(committed)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      {/* ideal */}
      <polyline points={idealPts} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeDasharray="4 3" />
      {/* actual */}
      {actualPts.length >= 2 && (
        <polyline points={actualPts.join(" ")} fill="none" stroke="rgb(99,102,241)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {series[lastActualIdx]?.remaining != null && (
        <circle cx={x(lastActualIdx)} cy={y(series[lastActualIdx].remaining!)} r={2.5} fill="rgb(99,102,241)" />
      )}
      <text x={2} y={y(committed) + 3} fontSize={9} fill="rgba(255,255,255,0.35)">{committed}</text>
      <text x={2} y={y(0) + 3} fontSize={9} fill="rgba(255,255,255,0.35)">0</text>
    </svg>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-[11.5px] text-white/30" style={{ height }}>
      Not enough history yet.
    </div>
  );
}
