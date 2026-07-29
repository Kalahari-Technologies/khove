"use client";

interface Point {
  date: string;
  done: number;
  total: number;
}

/**
 * Burn-up: cumulative merged work (emerald) rising toward the total (faint line),
 * with the target date (rose marker) and the projected finish (amber dashed line
 * from today's progress to completion). Pure SVG, scales to its container.
 */
export function BurnupChart({
  burnup,
  targetDate,
  projectedFinish,
  height = 168,
}: {
  burnup: Point[];
  targetDate: string | null;
  projectedFinish: string | null;
  height?: number;
}) {
  if (burnup.length < 2) {
    return (
      <div className="flex items-center justify-center text-[12px] text-white/30" style={{ height }}>
        Not enough history yet — merges will fill this in.
      </div>
    );
  }

  const total = Math.max(1, burnup[burnup.length - 1].total);
  const t0 = new Date(burnup[0].date).getTime();
  const tLast = new Date(burnup[burnup.length - 1].date).getTime();
  const tTarget = targetDate ? new Date(targetDate).getTime() : tLast;
  const tProj = projectedFinish ? new Date(projectedFinish).getTime() : tLast;
  const tMax = Math.max(tLast, tTarget, tProj);

  const W = 640;
  const H = height;
  const padL = 26;
  const padR = 14;
  const padT = 10;
  const padB = 18;
  const span = tMax - t0 || 1;
  const x = (t: number) => padL + ((t - t0) / span) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / total) * (H - padT - padB);

  const donePts = burnup.map((p) => `${x(new Date(p.date).getTime())},${y(p.done)}`).join(" ");
  const lastDone = burnup[burnup.length - 1].done;
  const late = projectedFinish && targetDate ? new Date(projectedFinish).getTime() > new Date(targetDate).getTime() : false;

  const gridYs = [0, 0.5, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {/* grid */}
      {gridYs.map((g) => (
        <line key={g} x1={padL} x2={W - padR} y1={y(g * total)} y2={y(g * total)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      ))}
      {/* total line */}
      <line x1={padL} x2={W - padR} y1={y(total)} y2={y(total)} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="2 3" />
      {/* target vertical marker */}
      {targetDate && (
        <line x1={x(tTarget)} x2={x(tTarget)} y1={padT} y2={H - padB} stroke="rgba(244,63,94,0.6)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {/* projected finish (from last progress to total) */}
      {projectedFinish && lastDone < total && (
        <line
          x1={x(tLast)}
          y1={y(lastDone)}
          x2={x(tProj)}
          y2={y(total)}
          stroke={late ? "rgba(245,158,11,0.85)" : "rgba(16,185,129,0.6)"}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {/* done line */}
      <polyline points={donePts} fill="none" stroke="rgb(16,185,129)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* last done dot */}
      <circle cx={x(tLast)} cy={y(lastDone)} r={2.5} fill="rgb(16,185,129)" />
      {/* y labels */}
      <text x={4} y={y(total) + 3} fontSize={9} fill="rgba(255,255,255,0.35)">{total}</text>
      <text x={4} y={y(0) + 3} fontSize={9} fill="rgba(255,255,255,0.35)">0</text>
    </svg>
  );
}
