"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Sparkline, fmtHours } from "@/components/integrations/metric-charts";

type Provider = "github" | "jira" | "all";

interface KpiCard {
  key: string;
  label: string;
  value: number | null;
  unit: "count" | "hours" | "per_week" | "points";
  delta: number | null;
  deltaPct: number | null;
  trend: "up" | "down" | "flat";
  goodDirection: "up" | "down";
  sparkline: { x: string; value: number | null }[];
}

function fmtValue(v: number | null, unit: KpiCard["unit"]): string {
  if (v == null) return "—";
  if (unit === "hours") return fmtHours(v);
  if (unit === "per_week") return String(Math.round(v * 10) / 10);
  return String(v);
}

/** A single hero KPI card: big value, period-over-period delta, sparkline. */
export function KpiCardView({ card, windowDays }: { card: KpiCard; windowDays: number }) {
  const improved = card.trend !== "flat" && card.trend === card.goodDirection;
  const worsened = card.trend !== "flat" && card.trend !== card.goodDirection;
  const deltaColor = improved ? "text-emerald-300" : worsened ? "text-red-300" : "text-white/35";
  const sparkColor = improved ? "rgb(52,211,153)" : worsened ? "rgb(248,113,113)" : "rgba(255,255,255,0.4)";
  const DeltaIcon = card.trend === "up" ? ArrowUpRight : card.trend === "down" ? ArrowDownRight : Minus;

  return (
    <div className="relative flex min-w-0 flex-col gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <span className="truncate text-[11px] font-medium tracking-tight text-white/45">{card.label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-[22px] font-semibold leading-none tabular-nums text-white/90">
          {fmtValue(card.value, card.unit)}
        </span>
        <div className="mb-0.5 h-7 w-16 shrink-0">
          <Sparkline points={card.sparkline} color={sparkColor} height={28} />
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10.5px]">
        <DeltaIcon size={12} className={deltaColor} />
        <span className={`tabular-nums ${deltaColor}`}>
          {card.deltaPct != null ? `${card.deltaPct > 0 ? "+" : ""}${card.deltaPct}%` : card.delta != null ? `${card.delta > 0 ? "+" : ""}${card.delta}` : "—"}
        </span>
        <span className="text-white/25">vs prev {windowDays}d</span>
      </div>
    </div>
  );
}

/**
 * The hero KPI strip — a row of period-over-period cards for a provider. Doubles
 * as the `kpi.row` dashboard widget (self-contained: fetches its own data).
 */
export function KpiRow({ provider = "all", windowDays = 28 }: { provider?: Provider; windowDays?: number }) {
  const { data, isLoading } = trpc.metrics.kpis.useQuery(
    { provider, windowDays },
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[86px] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
        ))}
      </div>
    );
  }

  const cards = (data?.cards ?? []) as KpiCard[];
  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-6 text-center text-[12px] text-white/30">
        Not enough activity yet to compute trends.
      </div>
    );
  }

  const cols = cards.length <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-6";
  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${cols}`}>
      {cards.map((c) => (
        <KpiCardView key={c.key} card={c} windowDays={data?.windowDays ?? windowDays} />
      ))}
    </div>
  );
}
