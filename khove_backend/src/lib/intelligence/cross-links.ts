import { db } from "@backend/lib/db";

// Cross-tool chains — the connectivity moat. Links GitHub PRs to Jira issues by the
// issue key referenced in the PR title (the universal convention "ENG-45: ..."), then
// folds merge state from the Signal store. See design §10 (cross-tool chains).

export interface GhLink {
  taskId: string;
  title: string;
  url: string | null;
  number?: number;
  merged: boolean;
  state?: string; // open | closed
}

interface Resolved {
  byJiraKey: Map<string, GhLink[]>;
}

/** Build the map: Jira issue key → the GitHub PRs whose title references it. */
async function resolveJiraLinks(workspaceId: string): Promise<Resolved> {
  // Project keys scope the regex so we don't match arbitrary "WORD-123" tokens.
  const projects = await db.entity.findMany({
    where: { workspaceId, provider: "JIRA", kind: "PROJECT" },
    select: { key: true },
  });
  let keys = projects.map((p) => p.key).filter((k): k is string => !!k);
  if (keys.length === 0) {
    // Fall back to distinct project keys from synced Jira tasks.
    const jira = await db.task.findMany({ where: { workspaceId, source: { has: "JIRA" } }, select: { metadata: true } });
    keys = [
      ...new Set(
        jira
          .map((t) => ((t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined)?.projectKey as string | undefined)
          .filter((k): k is string => !!k),
      ),
    ];
  }
  const byJiraKey = new Map<string, GhLink[]>();
  if (keys.length === 0) return { byJiraKey };

  const re = new RegExp(`\\b(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})-(\\d+)\\b`, "gi");

  // Merge state from the Signal store.
  const merges = await db.signal.findMany({
    where: { workspaceId, provider: "GITHUB", kind: "WORK_MERGED" },
    select: { entityKey: true },
  });
  const mergedKeys = new Set(merges.map((m) => m.entityKey));

  const ghTasks = await db.task.findMany({
    where: { workspaceId, source: { has: "GITHUB" } },
    select: { id: true, title: true, externalId: true, externalUrl: true, metadata: true },
  });
  for (const t of ghTasks) {
    const g = (t.metadata as Record<string, unknown> | null)?.github as Record<string, unknown> | undefined;
    if (g?.type !== "pull_request") continue;
    const seen = new Set<string>();
    for (const m of t.title.matchAll(re)) {
      const jiraKey = `${m[1].toUpperCase()}-${m[2]}`;
      if (seen.has(jiraKey)) continue;
      seen.add(jiraKey);
      const link: GhLink = {
        taskId: t.id,
        title: t.title,
        url: t.externalUrl,
        number: g.number as number | undefined,
        merged: t.externalId ? mergedKeys.has(t.externalId) : false,
        state: g.state as string | undefined,
      };
      const arr = byJiraKey.get(jiraKey);
      if (arr) arr.push(link);
      else byJiraKey.set(jiraKey, [link]);
    }
  }
  return { byJiraKey };
}

export interface EpicChainStory {
  id: string;
  issueKey?: string;
  title: string;
  status?: string;
  category?: string;
  prs: GhLink[];
}
export interface EpicChain {
  total: number;
  done: number;
  storiesWithCode: number;
  prsMerged: number;
  stories: EpicChainStory[];
}

/** The delivery chain for an epic: its stories, each with the PRs implementing it. */
export async function computeEpicChain(workspaceId: string, epicKey: string): Promise<EpicChain> {
  const { byJiraKey } = await resolveJiraLinks(workspaceId);
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "JIRA" } },
    select: { id: true, title: true, metadata: true },
  });

  const stories: EpicChainStory[] = [];
  let prsMerged = 0;
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    if ((j?.epic as { key?: string } | undefined)?.key !== epicKey) continue;
    const issueKey = j?.issueKey as string | undefined;
    const prs = (issueKey ? byJiraKey.get(issueKey) : undefined) ?? [];
    prsMerged += prs.filter((p) => p.merged).length;
    stories.push({
      id: t.id,
      issueKey,
      title: t.title.replace(/^\[[^\]]+\]\s*/, ""),
      status: j?.status as string | undefined,
      category: j?.statusCategory as string | undefined,
      prs,
    });
  }
  stories.sort((a, b) => (a.category === "DONE" ? 1 : 0) - (b.category === "DONE" ? 1 : 0));
  return {
    total: stories.length,
    done: stories.filter((s) => s.category === "DONE").length,
    storiesWithCode: stories.filter((s) => s.prs.length > 0).length,
    prsMerged,
    stories,
  };
}

export interface CrossToolGap {
  issueKey: string;
  title: string;
  taskId: string;
  status?: string;
  prs: GhLink[];
}
export interface CrossToolIntegrity {
  codeAheadOfTicket: CrossToolGap[]; // a PR is merged but the ticket isn't Done
  doneWithOpenPr: CrossToolGap[]; // ticket is Done but a linked PR isn't merged
  linkedTickets: number;
}

/** Where Jira and GitHub disagree — actionable delivery gaps only Khove can see. */
export async function computeCrossToolIntegrity(workspaceId: string): Promise<CrossToolIntegrity> {
  const { byJiraKey } = await resolveJiraLinks(workspaceId);
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "JIRA" } },
    select: { id: true, title: true, metadata: true },
  });

  const codeAheadOfTicket: CrossToolGap[] = [];
  const doneWithOpenPr: CrossToolGap[] = [];
  let linkedTickets = 0;

  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const key = j?.issueKey as string | undefined;
    if (!key) continue;
    const prs = byJiraKey.get(key);
    if (!prs || prs.length === 0) continue;
    linkedTickets++;
    const done = j?.statusCategory === "DONE";
    const anyMerged = prs.some((p) => p.merged);
    const allMerged = prs.every((p) => p.merged);
    const gap: CrossToolGap = {
      issueKey: key,
      title: t.title.replace(/^\[[^\]]+\]\s*/, ""),
      taskId: t.id,
      status: j?.status as string | undefined,
      prs,
    };
    if (!done && anyMerged) codeAheadOfTicket.push(gap);
    if (done && !allMerged) doneWithOpenPr.push(gap);
  }

  return { codeAheadOfTicket, doneWithOpenPr, linkedTickets };
}
