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
