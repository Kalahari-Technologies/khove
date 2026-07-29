import { db } from "@backend/lib/db";

// GitHub context-graph intelligence: repositories, milestones, releases + drill-down,
// joining the Entity graph to the synced PR/issue tasks. Mirrors jira-entities.ts.

const gh = (t: { metadata: unknown }) =>
  (t.metadata as Record<string, unknown> | null)?.github as Record<string, unknown> | undefined;

export interface RepoSummary {
  fullName: string;
  language: string | null;
  private: boolean;
  openPrs: number;
  openIssues: number;
  url: string | null;
  pushedAt: string | null;
}

export async function computeRepos(workspaceId: string): Promise<RepoSummary[]> {
  const entities = await db.entity.findMany({ where: { workspaceId, provider: "GITHUB", kind: "REPOSITORY" } });
  const tasks = await db.task.findMany({ where: { workspaceId, source: { has: "GITHUB" } }, select: { metadata: true } });

  const openPrs = new Map<string, number>();
  const openIssues = new Map<string, number>();
  for (const t of tasks) {
    const g = gh(t);
    const repo = g?.repo as string | undefined;
    if (!g || !repo) continue;
    if (g.type === "pull_request" && g.state !== "closed") openPrs.set(repo, (openPrs.get(repo) ?? 0) + 1);
    if (g.type === "issue") openIssues.set(repo, (openIssues.get(repo) ?? 0) + 1);
  }

  return entities
    .map((e) => {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const fullName = e.key ?? e.name;
      return {
        fullName,
        language: (meta.language as string | null) ?? null,
        private: e.status === "private",
        openPrs: openPrs.get(fullName) ?? 0,
        openIssues: openIssues.get(fullName) ?? 0,
        url: e.url,
        pushedAt: (meta.pushedAt as string | null) ?? null,
      };
    })
    .sort((a, b) => b.openPrs + b.openIssues - (a.openPrs + a.openIssues) || (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
}

export interface MilestoneSummary {
  key: string;
  name: string;
  repo: string;
  state: string;
  dueOn: string | null;
  open: number;
  closed: number;
  total: number;
  url: string | null;
}

export async function computeMilestones(workspaceId: string): Promise<MilestoneSummary[]> {
  const entities = await db.entity.findMany({ where: { workspaceId, provider: "GITHUB", kind: "MILESTONE" } });
  return entities
    .map((e) => {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const open = (m.openIssues as number) ?? 0;
      const closed = (m.closedIssues as number) ?? 0;
      return {
        key: e.name,
        name: e.name,
        repo: (m.repo as string) ?? "",
        state: e.status ?? "open",
        dueOn: (m.dueOn as string | null) ?? null,
        open,
        closed,
        total: open + closed,
        url: e.url,
      };
    })
    .filter((m) => m.total > 0)
    .sort((a, b) => (a.state === "open" ? -1 : 1) - (b.state === "open" ? -1 : 1) || (a.dueOn ?? "￿").localeCompare(b.dueOn ?? "￿"));
}

export interface GhReleaseSummary {
  name: string;
  repo: string;
  status: string;
  publishedAt: string | null;
  url: string | null;
}

export async function computeGithubReleases(workspaceId: string): Promise<GhReleaseSummary[]> {
  const entities = await db.entity.findMany({ where: { workspaceId, provider: "GITHUB", kind: "RELEASE" } });
  return entities
    .map((e) => {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      return {
        name: e.name,
        repo: (m.repo as string) ?? "",
        status: e.status ?? "released",
        publishedAt: (m.publishedAt as string | null) ?? null,
        url: e.url,
      };
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 12);
}

export interface GhEntityIssue {
  id: string;
  title: string;
  kind: "pull_request" | "issue";
  state?: string;
  url: string | null;
}

/** Drill-down — the PRs/issues in a repository or milestone. */
export async function githubEntityIssues(
  workspaceId: string,
  kind: "REPOSITORY" | "MILESTONE",
  key: string,
): Promise<GhEntityIssue[]> {
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "GITHUB" } },
    select: { id: true, title: true, externalUrl: true, metadata: true },
  });
  return tasks
    .filter((t) => {
      const g = gh(t);
      if (!g) return false;
      if (kind === "REPOSITORY") return g.repo === key;
      if (kind === "MILESTONE") return g.milestone === key;
      return false;
    })
    .map((t) => {
      const g = gh(t);
      return {
        id: t.id,
        title: t.title,
        kind: (g?.type as "pull_request" | "issue") ?? "issue",
        state: (g?.state as string) ?? undefined,
        url: t.externalUrl,
      };
    });
}
