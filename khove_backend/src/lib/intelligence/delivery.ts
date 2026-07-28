import { db } from "@backend/lib/db";

// An initiative = a Thread with a targetDate. Its scope = the work items linked
// via ThreadLink; its progress = folded from the Signal event store (merges are
// the "done for real" event). See product_docs/Connectivity Intelligence — Design.md.

const WORK_KINDS = new Set(["GITHUB_PR", "GITHUB_ISSUE", "JIRA_ISSUE", "TASK"]);
const DAY = 86_400_000;
const VELOCITY_WINDOW_DAYS = 28; // smooth the merge rate over 4 weeks
const AT_RISK_GRACE_DAYS = 3;
const MAX_BURNUP_DAYS = 120;

export type Health = "ON_TRACK" | "AT_RISK" | "SLIPPING" | "DONE" | "NO_TARGET" | "NO_DATA";

export interface DeliveryPoint {
  date: string; // YYYY-MM-DD
  done: number;
  total: number;
}

export interface Blocker {
  taskId: string;
  title: string;
  reason: string;
}

export interface InitiativeDelivery {
  total: number;
  done: number;
  remaining: number;
  velocityPerWeek: number;
  projectedFinish: string | null; // ISO
  targetDate: string | null; // ISO
  daysToTarget: number | null;
  daysProjectedVsTarget: number | null; // + = late, - = early
  health: Health;
  burnup: DeliveryPoint[];
  blockers: Blocker[];
}

interface WorkItem {
  taskId: string;
  title: string;
  entityKey: string;
  category: string | null;
  isPr: boolean;
  doneAt: Date | null;
  github?: Record<string, unknown>;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Resolve a thread's work-item links to Tasks (refId may be a Task id or externalId). */
async function resolveWorkItems(workspaceId: string, threadId: string): Promise<WorkItem[]> {
  const links = await db.threadLink.findMany({ where: { threadId } });
  const workLinks = links.filter((l) => WORK_KINDS.has(l.kind));

  const items: WorkItem[] = [];
  for (const link of workLinks) {
    const task =
      (await db.task.findFirst({ where: { id: link.refId, workspaceId }, include: { status: true } })) ??
      (await db.task.findFirst({ where: { externalId: link.refId, workspaceId }, include: { status: true } }));
    if (!task) continue;
    const github = (task.metadata as Record<string, unknown>)?.github as Record<string, unknown> | undefined;
    items.push({
      taskId: task.id,
      title: task.title,
      entityKey: task.externalId ?? task.id,
      category: task.status?.category ?? null,
      isPr: github?.type === "pull_request",
      doneAt: null,
      github,
    });
  }
  // De-dupe by task id (a PR can be linked more than once).
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.taskId) ? false : (seen.add(i.taskId), true)));
}

function blockerReason(github: Record<string, unknown> | undefined): string | null {
  if (!github) return null;
  if (github.ciStatus === "failure") return "CI failing";
  if (github.reviewDecision === "changes_requested") return "Changes requested";
  if (github.isDraft === true) return "Still a draft";
  const reviewers = Array.isArray(github.requestedReviewers) ? (github.requestedReviewers as string[]) : [];
  if (github.reviewDecision === "pending" && reviewers.length === 0) return "No reviewer assigned";
  if (github.reviewDecision === "pending") return "Awaiting review";
  return null;
}

/**
 * Compute delivery confidence for an initiative (Thread). Folds merge Signals for
 * the linked work into a burn-up, a merge velocity, a projected finish date, and a
 * health verdict vs. the target date.
 */
export async function computeInitiativeDelivery(
  workspaceId: string,
  threadId: string,
): Promise<InitiativeDelivery | null> {
  const thread = await db.thread.findFirst({ where: { id: threadId, workspaceId } });
  if (!thread) return null;

  const items = await resolveWorkItems(workspaceId, threadId);
  const entityKeys = items.map((i) => i.entityKey);

  // Merge events for the linked work — the authoritative "done" timestamps.
  const mergeSignals = entityKeys.length
    ? await db.signal.findMany({
        where: { workspaceId, kind: "WORK_MERGED", entityKey: { in: entityKeys } },
        orderBy: { occurredAt: "asc" },
      })
    : [];
  const mergedAt = new Map<string, Date>();
  for (const s of mergeSignals) if (!mergedAt.has(s.entityKey)) mergedAt.set(s.entityKey, s.occurredAt);

  for (const i of items) {
    const m = mergedAt.get(i.entityKey);
    if (m) i.doneAt = m;
    else if (i.category === "DONE") i.doneAt = thread.updatedAt; // fallback for non-PR done work
  }

  const total = items.length;
  const doneItems = items.filter((i) => i.doneAt);
  const done = doneItems.length;
  const remaining = total - done;

  // Velocity: items completed in the trailing window → per week.
  const now = Date.now();
  const windowStart = now - VELOCITY_WINDOW_DAYS * DAY;
  const recentDone = doneItems.filter((i) => i.doneAt!.getTime() >= windowStart).length;
  const velocityPerWeek = (recentDone / VELOCITY_WINDOW_DAYS) * 7;

  const projectedFinishMs =
    remaining === 0 ? now : velocityPerWeek > 0 ? now + (remaining / velocityPerWeek) * 7 * DAY : null;
  const projectedFinish = projectedFinishMs ? new Date(projectedFinishMs).toISOString() : null;

  const targetMs = thread.targetDate?.getTime() ?? null;
  const daysToTarget = targetMs ? Math.ceil((targetMs - now) / DAY) : null;
  const daysProjectedVsTarget =
    targetMs && projectedFinishMs ? Math.round((projectedFinishMs - targetMs) / DAY) : null;

  // Health verdict.
  let health: Health;
  if (total === 0) health = "NO_DATA";
  else if (remaining === 0) health = "DONE";
  else if (!targetMs) health = "NO_TARGET";
  else if (velocityPerWeek === 0) health = "SLIPPING"; // nothing merging, work remains
  else if (daysProjectedVsTarget! <= 0) health = "ON_TRACK";
  else if (daysProjectedVsTarget! <= AT_RISK_GRACE_DAYS) health = "AT_RISK";
  else health = "SLIPPING";

  // Burn-up series (cumulative done vs. flat total), clamped to a sane window.
  const doneTimes = doneItems.map((i) => i.doneAt!.getTime());
  const earliest = doneTimes.length ? Math.min(...doneTimes) : now;
  const startMs = Math.max(
    thread.startedAt?.getTime() ?? Math.min(earliest, thread.createdAt.getTime()),
    now - MAX_BURNUP_DAYS * DAY,
  );
  const burnup: DeliveryPoint[] = [];
  const startDay = new Date(startMs);
  startDay.setUTCHours(0, 0, 0, 0);
  for (let t = startDay.getTime(); t <= now + DAY; t += DAY) {
    const cutoff = t + DAY;
    const doneByDay = doneTimes.filter((dt) => dt < cutoff).length;
    burnup.push({ date: dayKey(new Date(t)), done: doneByDay, total });
  }

  const blockers: Blocker[] = items
    .filter((i) => !i.doneAt)
    .map((i) => {
      const reason = blockerReason(i.github);
      return reason ? { taskId: i.taskId, title: i.title, reason } : null;
    })
    .filter((b): b is Blocker => b !== null);

  return {
    total,
    done,
    remaining,
    velocityPerWeek: Math.round(velocityPerWeek * 10) / 10,
    projectedFinish,
    targetDate: thread.targetDate?.toISOString() ?? null,
    daysToTarget,
    daysProjectedVsTarget,
    health,
    burnup,
    blockers,
  };
}

/** Recompute + persist a thread's cached `health`. Returns the delivery snapshot. */
export async function refreshInitiativeHealth(
  workspaceId: string,
  threadId: string,
): Promise<InitiativeDelivery | null> {
  const delivery = await computeInitiativeDelivery(workspaceId, threadId);
  if (delivery) {
    await db.thread
      .update({ where: { id: threadId }, data: { health: delivery.health } })
      .catch(() => {});
  }
  return delivery;
}
