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

interface EntMeta {
  name: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export async function computeSprints(workspaceId: string): Promise<SprintSummary[]> {
  const [tasks, sprintEntities] = await Promise.all([
    db.task.findMany({ where: { workspaceId, source: { has: "JIRA" } }, select: { metadata: true } }),
    // Authoritative sprint metadata (state/dates/goal) from the Agile API — incl.
    // empty/future sprints that have no issues yet.
    db.entity.findMany({
      where: { workspaceId, provider: "JIRA", kind: "SPRINT" },
      select: { externalId: true, key: true, name: true, status: true, metadata: true },
    }),
  ]);

  // Issue-derived membership/points, keyed by sprint id (fallback name).
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

  // Authoritative sprint metadata, keyed the same way (externalId `jira-sprint-{id}`).
  const ents = new Map<string, EntMeta>();
  for (const e of sprintEntities) {
    const id = e.externalId.startsWith("jira-sprint-") ? e.externalId.slice("jira-sprint-".length) : (e.key ?? e.name);
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    ents.set(id, {
      name: e.name,
      state: e.status ?? undefined,
      startDate: (m.startDate as string) ?? undefined,
      endDate: (m.endDate as string) ?? undefined,
      goal: (m.goal as string) ?? undefined,
    });
  }

  const now = Date.now();
  const keys = new Set<string>([...groups.keys(), ...ents.keys()]);
  const out: SprintSummary[] = [];
  for (const key of keys) {
    const g = groups.get(key);
    const e = ents.get(key);
    // Prefer the authoritative Agile entity for state/dates/goal; fall back to issue-derived.
    const name = e?.name ?? g?.sprint.name ?? "Sprint";
    const state = e?.state ?? g?.sprint.state;
    const startDate = e?.startDate ?? g?.sprint.startDate;
    const endDate = e?.endDate ?? g?.sprint.endDate;
    const goal = e?.goal ?? g?.sprint.goal;
    out.push({
      id: g?.sprint.id ?? (/^\d+$/.test(key) ? Number(key) : undefined),
      name,
      state,
      startDate,
      endDate,
      goal,
      daysRemaining: endDate ? Math.ceil((new Date(endDate).getTime() - now) / 86_400_000) : null,
      totalIssues: g?.total ?? 0,
      doneIssues: g?.done ?? 0,
      committedPoints: Math.round((g?.committedPts ?? 0) * 10) / 10,
      donePoints: Math.round((g?.donePts ?? 0) * 10) / 10,
      hasPoints: g?.anyPts ?? false,
    });
  }

  // Active sprints first, then future, then most recent by end date.
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
  const [tasks, ent] = await Promise.all([
    db.task.findMany({
      where: { workspaceId, source: { has: "JIRA" } },
      select: { externalId: true, metadata: true },
    }),
    // Authoritative sprint dates from the Agile entity (preferred over issue metadata).
    db.entity.findFirst({
      where: { workspaceId, provider: "JIRA", kind: "SPRINT", OR: [{ key: sprintName }, { name: sprintName }] },
      select: { metadata: true },
    }),
  ]);

  const em = (ent?.metadata ?? {}) as Record<string, unknown>;
  let startMs: number | null = em.startDate ? new Date(em.startDate as string).getTime() : null;
  let endMs: number | null = em.endDate ? new Date(em.endDate as string).getTime() : null;
  const points = new Map<string, number>(); // entityKey → story points (0 if unestimated)
  const doneKeys = new Set<string>(); // issues currently in a DONE status
  const resolvedAt = new Map<string, number>(); // entityKey → Jira resolution time (ms)
  let anyPoints = false;
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const sp = j?.sprint as { name?: string; startDate?: string; endDate?: string } | undefined;
    if (sp?.name !== sprintName || !t.externalId) continue;
    // Fall back to issue-derived dates only when the entity didn't supply them.
    if (!startMs && sp.startDate) startMs = new Date(sp.startDate).getTime();
    if (!endMs && sp.endDate) endMs = new Date(sp.endDate).getTime();
    const pts = typeof j?.storyPoints === "number" ? (j.storyPoints as number) : 0;
    if (typeof j?.storyPoints === "number" && pts > 0) anyPoints = true;
    points.set(t.externalId, pts);
    if (j?.statusCategory === "DONE") {
      doneKeys.add(t.externalId);
      const c = j?.completedAt as string | undefined;
      const ms = c ? new Date(c).getTime() : NaN;
      if (!Number.isNaN(ms)) resolvedAt.set(t.externalId, ms);
    }
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
  // Prefer Jira's authoritative resolution date, then a WORK_MERGED signal, then
  // "done as of today" — so the actual line drops on the day work really finished.
  for (const [key, ms] of resolvedAt) doneAt.set(key, ms);
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
    // The sprint starts full: day 0 is always the committed total, so the line
    // anchors at the top and descends. (Work completed on the very first day is
    // reflected from the next point on, instead of hiding the starting scope.)
    series.push({
      date: new Date(t).toISOString().slice(0, 10),
      remaining: t > now + DAY ? null : i === 0 ? committed : Math.max(0, committed - completed),
      ideal: Math.max(0, committed * (1 - i / days)),
    });
  }
  return { committed, unit, series };
}
