import { db } from "@backend/lib/db";

// Cross-platform connectivity insights — facts no single-tool product can compute,
// because they span the Signal store + the Thread graph. See the design doc.

const DAY = 86_400_000;

export interface ScopeIntegrity {
  windowDays: number;
  merged: number;
  planned: number;
  unplanned: number;
  plannedPct: number | null;
  unplannedItems: { entityKey: string; title: string; url: string | null; mergedAt: string }[];
}

/**
 * Scope integrity: which merged PRs are NOT linked to any Connectivity Thread
 * (unplanned / untracked work). "Companies have a context problem" made visible.
 */
export async function computeScopeIntegrity(workspaceId: string, windowDays = 45): Promise<ScopeIntegrity> {
  const from = new Date(Date.now() - windowDays * DAY);

  const merges = await db.signal.findMany({
    where: { workspaceId, provider: "GITHUB", kind: "WORK_MERGED", occurredAt: { gte: from } },
    orderBy: { occurredAt: "desc" },
    select: { entityKey: true, occurredAt: true },
  });
  const mergedKeys = new Map<string, Date>();
  for (const m of merges) if (!mergedKeys.has(m.entityKey)) mergedKeys.set(m.entityKey, m.occurredAt);

  // Every PR externalId linked into a thread (refId may be a Task id or externalId).
  const links = await db.threadLink.findMany({
    where: { kind: "GITHUB_PR", thread: { workspaceId } },
    select: { refId: true, metadata: true },
  });
  const linkedExternalIds = new Set<string>();
  const refIds = new Set<string>();
  for (const l of links) {
    refIds.add(l.refId);
    const ext = (l.metadata as Record<string, unknown> | null)?.externalId as string | undefined;
    if (ext) linkedExternalIds.add(ext);
  }
  if (refIds.size) {
    const tasks = await db.task.findMany({
      where: { id: { in: [...refIds] }, workspaceId },
      select: { externalId: true },
    });
    for (const t of tasks) if (t.externalId) linkedExternalIds.add(t.externalId);
  }

  const unplannedKeys = [...mergedKeys.keys()].filter((k) => !linkedExternalIds.has(k));
  const unplannedTasks = unplannedKeys.length
    ? await db.task.findMany({
        where: { workspaceId, externalId: { in: unplannedKeys } },
        select: { externalId: true, title: true, externalUrl: true },
      })
    : [];
  const byExt = new Map(unplannedTasks.map((t) => [t.externalId!, t]));

  const merged = mergedKeys.size;
  const unplanned = unplannedKeys.length;
  const planned = merged - unplanned;

  return {
    windowDays,
    merged,
    planned,
    unplanned,
    plannedPct: merged > 0 ? Math.round((planned / merged) * 100) : null,
    unplannedItems: unplannedKeys.slice(0, 12).map((k) => ({
      entityKey: k,
      title: byExt.get(k)?.title ?? k,
      url: byExt.get(k)?.externalUrl ?? null,
      mergedAt: (mergedKeys.get(k) as Date).toISOString(),
    })),
  };
}
