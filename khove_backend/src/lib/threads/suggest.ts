import type { Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";
import { persistDrafts, type DraftAction } from "@backend/lib/agent/engine";

/**
 * Automatic thread suggestion: cluster related work items into candidate Connectivity
 * Threads and draft them as approval-gated SUGGEST_THREAD proposals (never auto-created).
 * Approving one runs `executeAgentAction` → createThread + link the members.
 *
 * v1 clusters by Jira epic — every epic with ≥2 issues that isn't already covered by a
 * thread becomes one proposal. (PR↔ticket clustering can layer on later.)
 */
export async function suggestThreads(workspaceId: string, proposedBy = "system"): Promise<{ created: number; total: number }> {
  const tasks = await db.task.findMany({
    where: { workspaceId, source: { has: "JIRA" } },
    select: { id: true, title: true, metadata: true },
  });

  // Group Jira issues by their epic key.
  const byEpic = new Map<string, { ids: string[]; titles: string[] }>();
  for (const t of tasks) {
    const j = (t.metadata as Record<string, unknown> | null)?.jira as Record<string, unknown> | undefined;
    const epicKey = (j?.epic as { key?: string } | undefined)?.key;
    if (!epicKey) continue;
    const g = byEpic.get(epicKey) ?? { ids: [], titles: [] };
    g.ids.push(t.id);
    g.titles.push(t.title);
    byEpic.set(epicKey, g);
  }
  if (byEpic.size === 0) return { created: 0, total: 0 };

  // Which task ids are already linked into some thread (so we don't re-suggest).
  const threads = await db.thread.findMany({ where: { workspaceId }, select: { links: { select: { refId: true } } } });
  const linkedIds = new Set(threads.flatMap((t) => t.links.map((l) => l.refId)));

  // Epic display names from the Entity graph.
  const epicEntities = await db.entity.findMany({
    where: { workspaceId, provider: "JIRA", kind: "EPIC", key: { in: [...byEpic.keys()] } },
    select: { key: true, name: true, url: true },
  });
  const nameByKey = new Map(epicEntities.map((e) => [e.key ?? "", { name: e.name, url: e.url }]));

  const drafts: DraftAction[] = [];
  for (const [epicKey, g] of byEpic) {
    if (g.ids.length < 2) continue;
    const covered = g.ids.filter((id) => linkedIds.has(id)).length;
    if (covered >= g.ids.length - 1) continue; // already essentially threaded
    const meta = nameByKey.get(epicKey);
    const name = meta?.name ?? epicKey;
    drafts.push({
      type: "SUGGEST_THREAD",
      dedupeKey: `suggest_thread:epic:${epicKey}`,
      title: `Thread: ${name} (${epicKey})`,
      rationale: `${g.ids.length} Jira issues roll up to epic ${epicKey} — group them into one connectivity thread to track delivery together.`,
      confidence: 0.7,
      sources: g.titles.slice(0, 8).map((title) => ({ kind: "jira", title })) as unknown as Prisma.InputJsonValue,
      payload: { title: `${name} (${epicKey})`, memberTaskIds: g.ids } as unknown as Prisma.InputJsonValue,
    });
  }

  return persistDrafts(workspaceId, drafts, proposedBy);
}
