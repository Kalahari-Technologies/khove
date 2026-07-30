import { db } from "@backend/lib/db";

// Sprint intelligence — grouped from the enriched Jira issue metadata (each issue
// carries its sprint + story points). No Agile API / extra scopes needed.

export interface SprintSummary {
  id?: number;
  name: string;
  state?: string; // active | closed | future
  startDate?: string;
  endDate?: string;
  goal?: string;
  daysRemaining: number | null;
  totalIssues: number;
  doneIssues: number;
  committedPoints: number;
  donePoints: number;
  hasPoints: boolean;
}

interface Group {
  sprint: { id?: number; name?: string; state?: string; startDate?: string; endDate?: string; goal?: string };
  total: number;
  done: number;
  committedPts: number;
  donePts: number;
  anyPts: boolean;
}

export async function computeSprints(workspaceId: string): Promise<SprintSummary[]> {
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "JIRA" } },
    select: { metadata: true },
  });

  const groups = new Map<string, Group>();
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const sp = j?.sprint as Group["sprint"] | undefined;
    if (!sp?.name) continue;
    const key = String(sp.id ?? sp.name);
    let g = groups.get(key);
    if (!g) {
      g = { sprint: sp, total: 0, done: 0, committedPts: 0, donePts: 0, anyPts: false };
      groups.set(key, g);
    }
    g.total++;
    const isDone = j?.statusCategory === "DONE";
    if (isDone) g.done++;
    const pts = typeof j?.storyPoints === "number" ? (j.storyPoints as number) : 0;
    if (typeof j?.storyPoints === "number") g.anyPts = true;
    g.committedPts += pts;
    if (isDone) g.donePts += pts;
  }

  const now = Date.now();
  const out: SprintSummary[] = [...groups.values()].map((g) => ({
    id: g.sprint.id,
    name: g.sprint.name ?? "Sprint",
    state: g.sprint.state,
    startDate: g.sprint.startDate,
    endDate: g.sprint.endDate,
    goal: g.sprint.goal,
    daysRemaining: g.sprint.endDate ? Math.ceil((new Date(g.sprint.endDate).getTime() - now) / 86_400_000) : null,
    totalIssues: g.total,
    doneIssues: g.done,
    committedPoints: Math.round(g.committedPts * 10) / 10,
    donePoints: Math.round(g.donePts * 10) / 10,
    hasPoints: g.anyPts,
  }));

  // Active sprints first, then most recent by end date.
  const rank = (s: SprintSummary) => (s.state === "active" ? 0 : s.state === "future" ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || (b.endDate ?? "").localeCompare(a.endDate ?? ""));
  return out;
}

const DAY = 86_400_000;

export interface BurndownPoint {
  date: string; // YYYY-MM-DD
  remaining: number | null; // actual remaining points (null after today)
  ideal: number; // linear ideal
}

/**
 * Sprint burndown: remaining work per day vs. the ideal linear line. Burns down by
 * **story points** when the sprint's issues are estimated, otherwise falls back to
 * **issue count** so point-less sprints still chart. Completion times come from the
 * WORK_MERGED Signal store; any issue that is currently DONE but has no completion
 * signal is treated as done as of today, so the line reflects real progress.
 *
 * Returns `null` only when the sprint has no start/end dates or no issues — i.e.
 * there is genuinely nothing to plot.
 */
export async function computeSprintBurndown(
  workspaceId: string,
  sprintName: string,
): Promise<{ committed: number; unit: "points" | "issues"; series: BurndownPoint[] } | null> {
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "JIRA" } },
    select: { externalId: true, metadata: true },
  });

  let startMs: number | null = null;
  let endMs: number | null = null;
  const points = new Map<string, number>(); // entityKey → story points (0 if unestimated)
  const doneKeys = new Set<string>(); // issues currently in a DONE status
  let anyPoints = false;
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const sp = j?.sprint as { name?: string; startDate?: string; endDate?: string } | undefined;
    if (sp?.name !== sprintName || !t.externalId) continue;
    if (sp.startDate) startMs = new Date(sp.startDate).getTime();
    if (sp.endDate) endMs = new Date(sp.endDate).getTime();
    const pts = typeof j?.storyPoints === "number" ? (j.storyPoints as number) : 0;
    if (typeof j?.storyPoints === "number" && pts > 0) anyPoints = true;
    points.set(t.externalId, pts);
    if (j?.statusCategory === "DONE") doneKeys.add(t.externalId);
  }

  if (!startMs || !endMs || points.size === 0) return null;

  // Weight each issue by points when the sprint is estimated, else by a flat 1
  // (issue-count burndown) so unestimated sprints still render a meaningful chart.
  const unit: "points" | "issues" = anyPoints ? "points" : "issues";
  const weightOf = (key: string) => (unit === "points" ? points.get(key) ?? 0 : 1);
  const committed = [...points.keys()].reduce((s, k) => s + weightOf(k), 0);
  if (committed === 0) return null;

  // Completion times from the Signal store, backfilled with "done as of today" for
  // any currently-DONE issue that never emitted a completion signal.
  const merges = await db.signal.findMany({
    where: { workspaceId, provider: "JIRA", kind: "WORK_MERGED", entityKey: { in: [...points.keys()] } },
    orderBy: { occurredAt: "asc" },
    select: { entityKey: true, occurredAt: true },
  });
  const now = Date.now();
  const doneAt = new Map<string, number>();
  for (const m of merges) if (!doneAt.has(m.entityKey)) doneAt.set(m.entityKey, m.occurredAt.getTime());
  for (const key of doneKeys) if (!doneAt.has(key)) doneAt.set(key, Math.min(now, endMs));

  const days = Math.max(1, Math.round((endMs - startMs) / DAY));
  const series: BurndownPoint[] = [];
  for (let i = 0; i <= days; i++) {
    const t = startMs + i * DAY;
    const cutoff = t + DAY;
    let completed = 0;
    for (const key of points.keys()) {
      const d = doneAt.get(key);
      if (d && d < cutoff) completed += weightOf(key);
    }
    series.push({
      date: new Date(t).toISOString().slice(0, 10),
      remaining: t <= now + DAY ? Math.max(0, committed - completed) : null,
      ideal: Math.max(0, committed * (1 - i / days)),
    });
  }
  return { committed, unit, series };
}
