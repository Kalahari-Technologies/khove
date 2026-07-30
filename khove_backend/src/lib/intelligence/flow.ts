import type { IntegrationProvider } from "@prisma/client";
import { db } from "@backend/lib/db";

// Flow metrics folded from the Signal event store — provider-agnostic, so GitHub
// and (Phase 5) Jira feed the same charts. See Connectivity Intelligence design.

export const DAY = 86_400_000;
export const HOUR = 3_600_000;

export interface WeekPoint {
  week: string; // Monday, YYYY-MM-DD
  value: number | null;
}

export interface FlowMetrics {
  windowDays: number;
  opened: number;
  merged: number;
  throughputPerWeek: number;
  deployFrequencyPerWeek: number;
  cycleTimeP50Hours: number | null;
  cycleTimeP90Hours: number | null;
  reviewLatencyP50Hours: number | null;
  throughputSeries: WeekPoint[]; // merges per week
  cycleTimeSeries: WeekPoint[]; // p50 cycle-time (hrs) per merge week
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

/** The Monday (UTC) of the week a date falls in, as YYYY-MM-DD. */
export function weekKey(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

export function weekSpine(fromMs: number, toMs: number): string[] {
  const weeks: string[] = [];
  const start = new Date(weekKey(new Date(fromMs)) + "T00:00:00Z").getTime();
  for (let t = start; t <= toMs; t += 7 * DAY) weeks.push(weekKey(new Date(t)));
  return weeks;
}

/**
 * Compute flow metrics for a workspace over a trailing window, optionally scoped
 * to a set of sources (repos / projects) and providers.
 */
export async function computeFlowMetrics(
  workspaceId: string,
  opts?: { windowDays?: number; sources?: string[]; providers?: IntegrationProvider[] },
): Promise<FlowMetrics> {
  const windowDays = opts?.windowDays ?? 84; // 12 weeks
  const now = Date.now();
  const fromMs = now - windowDays * DAY;

  const signals = await db.signal.findMany({
    where: {
      workspaceId,
      occurredAt: { gte: new Date(fromMs) },
      ...(opts?.providers?.length ? { provider: { in: opts.providers } } : {}),
      ...(opts?.sources?.length ? { source: { in: opts.sources } } : {}),
      kind: { in: ["WORK_OPENED", "WORK_MERGED", "REVIEW_SUBMITTED", "DEPLOY"] },
    },
    orderBy: { occurredAt: "asc" },
    select: { kind: true, entityKey: true, occurredAt: true },
  });

  // Reduce to per-entity timestamps.
  const openedAt = new Map<string, number>();
  const mergedAt = new Map<string, number>();
  const firstReviewAt = new Map<string, number>();
  let deploys = 0;

  for (const s of signals) {
    const t = s.occurredAt.getTime();
    if (s.kind === "WORK_OPENED") {
      if (!openedAt.has(s.entityKey)) openedAt.set(s.entityKey, t);
    } else if (s.kind === "WORK_MERGED") {
      if (!mergedAt.has(s.entityKey)) mergedAt.set(s.entityKey, t);
    } else if (s.kind === "REVIEW_SUBMITTED") {
      if (!firstReviewAt.has(s.entityKey)) firstReviewAt.set(s.entityKey, t);
    } else if (s.kind === "DEPLOY") {
      deploys++;
    }
  }

  // Cycle times (open → merge) for items merged in-window.
  const cycleHours: number[] = [];
  const mergesByWeek = new Map<string, number>();
  const cycleByWeek = new Map<string, number[]>();
  for (const [key, mAt] of mergedAt) {
    const wk = weekKey(new Date(mAt));
    mergesByWeek.set(wk, (mergesByWeek.get(wk) ?? 0) + 1);
    const oAt = openedAt.get(key);
    if (oAt && mAt >= oAt) {
      const h = (mAt - oAt) / HOUR;
      cycleHours.push(h);
      (cycleByWeek.get(wk) ?? cycleByWeek.set(wk, []).get(wk)!).push(h);
    }
  }

  const reviewLatencies: number[] = [];
  for (const [key, rAt] of firstReviewAt) {
    const oAt = openedAt.get(key);
    if (oAt && rAt >= oAt) reviewLatencies.push((rAt - oAt) / HOUR);
  }

  const cycleSorted = [...cycleHours].sort((a, b) => a - b);
  const reviewSorted = [...reviewLatencies].sort((a, b) => a - b);
  const weeks = weekSpine(fromMs, now);
  const weeksCount = Math.max(1, weeks.length);

  const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

  return {
    windowDays,
    opened: openedAt.size,
    merged: mergedAt.size,
    throughputPerWeek: round1(mergedAt.size / weeksCount)!,
    deployFrequencyPerWeek: round1(deploys / weeksCount)!,
    cycleTimeP50Hours: round1(percentile(cycleSorted, 0.5)),
    cycleTimeP90Hours: round1(percentile(cycleSorted, 0.9)),
    reviewLatencyP50Hours: round1(percentile(reviewSorted, 0.5)),
    throughputSeries: weeks.map((w) => ({ week: w, value: mergesByWeek.get(w) ?? 0 })),
    cycleTimeSeries: weeks.map((w) => {
      const arr = cycleByWeek.get(w);
      return { week: w, value: arr && arr.length ? round1(percentile([...arr].sort((a, b) => a - b), 0.5)) : null };
    }),
  };
}
