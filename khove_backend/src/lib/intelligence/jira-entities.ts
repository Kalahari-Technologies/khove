import { db } from "@backend/lib/db";

// Epic / release progress + drill-down, grouped from the enriched Jira task metadata
// and joined to the Entity graph for names/status. See design §10.

interface Prog {
  total: number;
  done: number;
  committedPoints: number;
  donePoints: number;
  anyPts: boolean;
}
const mk = (): Prog => ({ total: 0, done: 0, committedPoints: 0, donePoints: 0, anyPts: false });
const acc = (g: Prog, j: Record<string, unknown>) => {
  g.total++;
  const done = j.statusCategory === "DONE";
  if (done) g.done++;
  const pts = typeof j.storyPoints === "number" ? (j.storyPoints as number) : 0;
  if (typeof j.storyPoints === "number") g.anyPts = true;
  g.committedPoints += pts;
  if (done) g.donePoints += pts;
};

export interface EpicSummary {
  key: string;
  name: string;
  url: string | null;
  total: number;
  done: number;
  committedPoints: number;
  donePoints: number;
  hasPoints: boolean;
}

export async function computeEpics(workspaceId: string): Promise<EpicSummary[]> {
  const tasks = await db.task.findMany({ where: { workspaceId, source: { has: "JIRA" } }, select: { metadata: true } });
  const groups = new Map<string, Prog>();
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const epic = j?.epic as { key?: string } | undefined;
    if (!epic?.key) continue;
    let g = groups.get(epic.key);
    if (!g) groups.set(epic.key, (g = mk()));
    acc(g, j!);
  }
  const entities = await db.entity.findMany({
    where: { workspaceId, provider: "JIRA", kind: "EPIC", key: { in: [...groups.keys()] } },
    select: { key: true, name: true, url: true },
  });
  const byKey = new Map(entities.map((e) => [e.key ?? "", e]));
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      name: byKey.get(key)?.name ?? key,
      url: byKey.get(key)?.url ?? null,
      total: g.total,
      done: g.done,
      committedPoints: Math.round(g.committedPoints * 10) / 10,
      donePoints: Math.round(g.donePoints * 10) / 10,
      hasPoints: g.anyPts,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface ReleaseSummary {
  name: string;
  status?: string; // released | unreleased
  total: number;
  done: number;
}

export async function computeReleases(workspaceId: string): Promise<ReleaseSummary[]> {
  const tasks = await db.task.findMany({ where: { workspaceId, source: { has: "JIRA" } }, select: { metadata: true } });
  const groups = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const versions = j?.fixVersions;
    if (!Array.isArray(versions)) continue;
    const done = j?.statusCategory === "DONE";
    for (const v of versions as string[]) {
      let g = groups.get(v);
      if (!g) groups.set(v, (g = { total: 0, done: 0 }));
      g.total++;
      if (done) g.done++;
    }
  }
  const entities = await db.entity.findMany({
    where: { workspaceId, provider: "JIRA", kind: "RELEASE" },
    select: { key: true, status: true },
  });
  const statusByKey = new Map(entities.map((e) => [e.key ?? "", e.status ?? undefined]));
  return [...groups.entries()]
    .map(([name, g]) => ({ name, status: statusByKey.get(name), total: g.total, done: g.done }))
    .sort((a, b) => (a.status === "unreleased" ? -1 : 1) - (b.status === "unreleased" ? -1 : 1) || b.total - a.total);
}

export interface EntityIssue {
  id: string;
  title: string;
  issueKey?: string;
  status?: string;
  category?: string;
  storyPoints?: number | null;
  url: string | null;
}

/** The Jira issues belonging to a sprint / epic / release — powers drill-down. */
export async function entityIssues(
  workspaceId: string,
  kind: "SPRINT" | "EPIC" | "RELEASE",
  key: string,
): Promise<EntityIssue[]> {
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "JIRA" } },
    select: { id: true, title: true, externalUrl: true, metadata: true },
  });
  return tasks
    .filter((t) => {
      const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
      if (!j) return false;
      if (kind === "SPRINT") return (j.sprint as { name?: string } | undefined)?.name === key;
      if (kind === "EPIC") return (j.epic as { key?: string } | undefined)?.key === key;
      if (kind === "RELEASE") return Array.isArray(j.fixVersions) && (j.fixVersions as string[]).includes(key);
      return false;
    })
    .map((t) => {
      const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
      return {
        id: t.id,
        title: t.title,
        issueKey: j?.issueKey as string | undefined,
        status: j?.status as string | undefined,
        category: j?.statusCategory as string | undefined,
        storyPoints: typeof j?.storyPoints === "number" ? (j!.storyPoints as number) : null,
        url: t.externalUrl,
      };
    })
    .sort((a, b) => (a.category === "DONE" ? 1 : 0) - (b.category === "DONE" ? 1 : 0));
}
