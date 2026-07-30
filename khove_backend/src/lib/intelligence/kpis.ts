import type { IntegrationProvider, TaskSource } from "@prisma/client";
import { db } from "@backend/lib/db";
import { DAY, HOUR, percentile, weekKey, weekSpine } from "@backend/lib/intelligence/flow";

// Hero KPI cards for the dashboard headers: each metric computed for the current
// trailing window AND the previous window of the same length, so we can show a
// period-over-period delta + a per-week sparkline. Folded from the Signal store —
// consistent with flow.ts (WORK_MERGED = throughput/done for both providers).

export type KpiUnit = "count" | "hours" | "per_week" | "points";

export interface KpiCard {
  key: string;
  label: string;
  value: number | null;
  unit: KpiUnit;
  delta: number | null; // current − previous (signed); null when either window is empty
  deltaPct: number | null; // null when previous is 0 or missing
  trend: "up" | "down" | "flat";
  goodDirection: "up" | "down"; // lets the UI color "improvement" green regardless of metric
  sparkline: { x: string; value: number | null }[];
  description: string; // plain-English "what is this" for the help tooltip
}

export interface KpiResult {
  windowDays: number;
  provider: "github" | "jira" | "all";
  cards: KpiCard[];
}

type ProviderInput = "github" | "jira" | "all";

const round1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);

/** Reduced signal timelines over the whole loaded (2×window) range. */
interface Reduced {
  openedAt: Map<string, number>;
  firstReviewAt: Map<string, number>;
  merges: { key: string; at: number }[];
  deploys: number[];
}

interface WindowMetrics {
  merged: number;
  opened: number;
  deploys: number;
  cycleP50: number | null;
  reviewP50: number | null;
  points: number;
}

function windowMetrics(r: Reduced, taskPoints: Map<string, number>, from: number, to: number): WindowMetrics {
  const merges = r.merges.filter((m) => m.at >= from && m.at < to);
  let opened = 0;
  for (const at of r.openedAt.values()) if (at >= from && at < to) opened++;
  const deploys = r.deploys.filter((t) => t >= from && t < to).length;

  const cycle: number[] = [];
  let points = 0;
  for (const m of merges) {
    const o = r.openedAt.get(m.key);
    if (o != null && m.at >= o) cycle.push((m.at - o) / HOUR);
    points += taskPoints.get(m.key) ?? 0;
  }

  const review: number[] = [];
  for (const [key, at] of r.firstReviewAt) {
    if (at < from || at >= to) continue;
    const o = r.openedAt.get(key);
    if (o != null && at >= o) review.push((at - o) / HOUR);
  }

  return {
    merged: merges.length,
    opened,
    deploys,
    cycleP50: round1(percentile([...cycle].sort((a, b) => a - b), 0.5)),
    reviewP50: round1(percentile([...review].sort((a, b) => a - b), 0.5)),
    points: Math.round(points * 10) / 10,
  };
}

/** Per-week series over the current window for a count metric. */
function countByWeek(weeks: string[], times: number[]): { x: string; value: number | null }[] {
  const m = new Map<string, number>();
  for (const t of times) m.set(weekKey(new Date(t)), (m.get(weekKey(new Date(t))) ?? 0) + 1);
  return weeks.map((w) => ({ x: w, value: m.get(w) ?? 0 }));
}

/** Per-week p50 series for a duration metric (hours). */
function p50ByWeek(weeks: string[], samples: { at: number; hours: number }[]): { x: string; value: number | null }[] {
  const buckets = new Map<string, number[]>();
  for (const s of samples) {
    const w = weekKey(new Date(s.at));
    (buckets.get(w) ?? buckets.set(w, []).get(w)!).push(s.hours);
  }
  return weeks.map((w) => {
    const arr = buckets.get(w);
    return { x: w, value: arr && arr.length ? round1(percentile([...arr].sort((a, b) => a - b), 0.5)) : null };
  });
}

function makeCard(
  key: string,
  label: string,
  unit: KpiUnit,
  goodDirection: "up" | "down",
  value: number | null,
  previous: number | null,
  sparkline: { x: string; value: number | null }[],
  description = "",
): KpiCard {
  let delta: number | null = null;
  let deltaPct: number | null = null;
  let trend: "up" | "down" | "flat" = "flat";
  if (value != null && previous != null) {
    delta = round1(value - previous);
    if (previous > 0) deltaPct = Math.round(((value - previous) / previous) * 100);
    const eps = 0.05;
    trend = delta! > eps ? "up" : delta! < -eps ? "down" : "flat";
  }
  return { key, label, value, unit, delta, deltaPct, trend, goodDirection, sparkline, description };
}

export async function computeKpis(
  workspaceId: string,
  opts?: { provider?: ProviderInput; windowDays?: number },
): Promise<KpiResult> {
  const provider: ProviderInput = opts?.provider ?? "all";
  const windowDays = opts?.windowDays ?? 28;
  const now = Date.now();
  const windowMs = windowDays * DAY;
  const fromMs = now - 2 * windowMs;

  const providers: IntegrationProvider[] =
    provider === "github" ? ["GITHUB"] : provider === "jira" ? ["JIRA"] : ["GITHUB", "JIRA"];

  // Honor the GitHub product-scope (repos) when the widget is GitHub-only.
  let sources: string[] | undefined;
  if (provider === "github") {
    const integ = await db.integration.findFirst({
      where: { workspaceId, provider: "GITHUB", isActive: true },
      select: { metadata: true },
    });
    const scope = ((integ?.metadata ?? {}) as Record<string, unknown>).scope as { repos?: string[] } | undefined;
    if (scope?.repos?.length) sources = scope.repos;
  }

  const signals = await db.signal.findMany({
    where: {
      workspaceId,
      occurredAt: { gte: new Date(fromMs) },
      provider: { in: providers },
      ...(sources?.length ? { source: { in: sources } } : {}),
      kind: { in: ["WORK_OPENED", "WORK_MERGED", "REVIEW_SUBMITTED", "DEPLOY"] },
    },
    orderBy: { occurredAt: "asc" },
    select: { kind: true, entityKey: true, occurredAt: true },
  });

  const r: Reduced = { openedAt: new Map(), firstReviewAt: new Map(), merges: [], deploys: [] };
  for (const s of signals) {
    const t = s.occurredAt.getTime();
    if (s.kind === "WORK_OPENED") {
      if (!r.openedAt.has(s.entityKey)) r.openedAt.set(s.entityKey, t);
    } else if (s.kind === "WORK_MERGED") {
      r.merges.push({ key: s.entityKey, at: t });
    } else if (s.kind === "REVIEW_SUBMITTED") {
      if (!r.firstReviewAt.has(s.entityKey)) r.firstReviewAt.set(s.entityKey, t);
    } else if (s.kind === "DEPLOY") {
      r.deploys.push(t);
    }
  }

  // Story points per entity (Jira only) — Signal.entityKey === Task.externalId.
  const taskPoints = new Map<string, number>();
  if (provider === "jira" || provider === "all") {
    const tasks = await db.task.findMany({
      where: { workspaceId, source: { has: "JIRA" }, externalId: { not: null } },
      select: { externalId: true, metadata: true },
    });
    for (const t of tasks) {
      const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
      const pts = typeof j?.storyPoints === "number" ? (j.storyPoints as number) : 0;
      if (t.externalId && pts) taskPoints.set(t.externalId, pts);
    }
  }

  const curFrom = now - windowMs;
  const cur = windowMetrics(r, taskPoints, curFrom, now + 1);
  const prev = windowMetrics(r, taskPoints, fromMs, curFrom);

  const weeks = weekSpine(curFrom, now);
  const weeksCount = Math.max(1, Math.round(windowDays / 7));

  // Sparkline source series over the current window.
  const curMerges = r.merges.filter((m) => m.at >= curFrom);
  const curOpened = [...r.openedAt.values()].filter((t) => t >= curFrom);
  const curDeploys = r.deploys.filter((t) => t >= curFrom);
  const cycleSamples = curMerges
    .map((m) => {
      const o = r.openedAt.get(m.key);
      return o != null && m.at >= o ? { at: m.at, hours: (m.at - o) / HOUR } : null;
    })
    .filter((x): x is { at: number; hours: number } => x != null);
  const reviewSamples = [...r.firstReviewAt.entries()]
    .filter(([, at]) => at >= curFrom)
    .map(([key, at]) => {
      const o = r.openedAt.get(key);
      return o != null && at >= o ? { at, hours: (at - o) / HOUR } : null;
    })
    .filter((x): x is { at: number; hours: number } => x != null);
  const pointsByWeekArr = (() => {
    const m = new Map<string, number>();
    for (const mg of curMerges) {
      const w = weekKey(new Date(mg.at));
      m.set(w, (m.get(w) ?? 0) + (taskPoints.get(mg.key) ?? 0));
    }
    return weeks.map((w) => ({ x: w, value: m.get(w) ?? 0 }));
  })();

  const mergedByWeek = countByWeek(weeks, curMerges.map((m) => m.at));
  const openedByWeek = countByWeek(weeks, curOpened);
  const deployByWeek = countByWeek(weeks, curDeploys);
  const cycleByWeek = p50ByWeek(weeks, cycleSamples);
  const reviewByWeek = p50ByWeek(weeks, reviewSamples);

  const perWeek = (n: number) => round1(n / weeksCount);

  // Current-state cards: counts of work that's open RIGHT NOW (no historical
  // snapshot → no trend/sparkline). Read from the Task store.
  const stateTasks = await db.task.findMany({
    where: { workspaceId, source: { hasSome: providers as unknown as TaskSource[] } },
    select: { status: { select: { category: true } }, metadata: true },
  });
  const isOpenCat = (c?: string | null) => c !== "DONE" && c !== "CANCELLED";
  let openCount = 0;
  let wip = 0;
  let bugs = 0;
  let awaitingReview = 0;
  for (const t of stateTasks) {
    const cat = t.status?.category as string | undefined;
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    const gh = meta.github as Record<string, unknown> | undefined;
    const j = meta.jira as Record<string, unknown> | undefined;
    if (isOpenCat(cat)) openCount++;
    if (cat === "IN_PROGRESS") wip++;
    if (isOpenCat(cat) && typeof j?.issueType === "string" && (j.issueType as string).toLowerCase() === "bug") bugs++;
    if (gh?.type === "pull_request" && gh?.reviewDecision === "pending") awaitingReview++;
  }
  const stateCard = (key: string, label: string, value: number, goodDirection: "up" | "down", description: string): KpiCard =>
    makeCard(key, label, "count", goodDirection, value, null, [], description);

  let cards: KpiCard[];
  if (provider === "jira") {
    cards = [
      makeCard("done", "Completed", "count", "up", cur.merged, prev.merged, mergedByWeek, "Jira issues moved to Done in the window."),
      makeCard("throughput", "Throughput / wk", "per_week", "up", perWeek(cur.merged), perWeek(prev.merged), mergedByWeek, "Average issues completed per week."),
      makeCard("cycle", "Cycle time", "hours", "down", cur.cycleP50, prev.cycleP50, cycleByWeek, "Median time from an issue opening to Done."),
      makeCard("points", "Points done", "points", "up", cur.points, prev.points, pointsByWeekArr, "Story points completed in the window."),
      stateCard("open", "Open", openCount, "down", "Issues currently open (not Done/Cancelled)."),
      stateCard("wip", "In progress", wip, "down", "Issues currently in progress."),
      stateCard("bugs", "Open bugs", bugs, "down", "Open issues of type Bug."),
    ];
  } else {
    // github + all
    cards = [
      makeCard("merged", "Merged", "count", "up", cur.merged, prev.merged, mergedByWeek, "Pull requests merged in the window."),
      makeCard("throughput", "Throughput / wk", "per_week", "up", perWeek(cur.merged), perWeek(prev.merged), mergedByWeek, "Average items completed per week."),
      makeCard("cycle", "Cycle time", "hours", "down", cur.cycleP50, prev.cycleP50, cycleByWeek, "Median time from an item opening to done."),
      makeCard("review", "Review latency", "hours", "down", cur.reviewP50, prev.reviewP50, reviewByWeek, "Median time from a PR opening to its first review."),
      makeCard("opened", "Opened", "count", "up", cur.opened, prev.opened, openedByWeek, "Work items opened in the window."),
      makeCard("deploy", "Deploys / wk", "per_week", "up", perWeek(cur.deploys), perWeek(prev.deploys), deployByWeek, "Deployments per week (DORA deploy frequency)."),
      stateCard("open", "Open", openCount, "down", "Work items currently open."),
      stateCard("awaiting", "Awaiting review", awaitingReview, "down", "Open PRs still waiting on a first review."),
    ];
  }

  return { windowDays, provider, cards };
}
