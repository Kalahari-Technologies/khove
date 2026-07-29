"use client";

import { useEffect, useRef, useState } from "react";

interface Point {
  date: string;
  done: number;
  total: number;
}

/** Measure the container's rendered width so the SVG draws at true pixels
 *  (no viewBox stretch → no distortion), re-measuring on resize. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Burn-up: cumulative merged work (emerald) rising toward the total (faint line),
 * with the target date (rose marker) and the projected finish (amber dashed line
 * from today's progress to completion). Bespoke SVG rendered at measured width.
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
  const [ref, W] = useWidth();

  const enough = burnup.length >= 2;

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {!enough ? (
        <div className="flex items-center justify-center text-[12px] text-white/30" style={{ height }}>
          Not enough history yet — merges will fill this in.
        </div>
      ) : W === 0 ? null : (
        <BurnupSvg burnup={burnup} targetDate={targetDate} projectedFinish={projectedFinish} width={W} height={height} />
      )}
    </div>
  );
}

function BurnupSvg({
  burnup,
  targetDate,
  projectedFinish,
  width: W,
  height: H,
}: {
  burnup: Point[];
  targetDate: string | null;
  projectedFinish: string | null;
  width: number;
  height: number;
}) {
  const total = Math.max(1, burnup[burnup.length - 1].total);
  const t0 = new Date(burnup[0].date).getTime();
  const tLast = new Date(burnup[burnup.length - 1].date).getTime();
  const tTarget = targetDate ? new Date(targetDate).getTime() : tLast;
  const tProj = projectedFinish ? new Date(projectedFinish).getTime() : tLast;
  const tMax = Math.max(tLast, tTarget, tProj);

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
    <svg width={W} height={H} className="block">
      {gridYs.map((g) => (
        <line key={g} x1={padL} x2={W - padR} y1={y(g * total)} y2={y(g * total)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      ))}
      <line x1={padL} x2={W - padR} y1={y(total)} y2={y(total)} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="2 3" />
      {targetDate && (
        <line x1={x(tTarget)} x2={x(tTarget)} y1={padT} y2={H - padB} stroke="rgba(244,63,94,0.6)" strokeWidth={1} strokeDasharray="3 3" />
      )}
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
      <polyline points={donePts} fill="none" stroke="rgb(16,185,129)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(tLast)} cy={y(lastDone)} r={2.5} fill="rgb(16,185,129)" />
      <text x={4} y={y(total) + 3} fontSize={9} fill="rgba(255,255,255,0.35)">{total}</text>
      <text x={4} y={y(0) + 3} fontSize={9} fill="rgba(255,255,255,0.35)">0</text>
    </svg>
  );
}
