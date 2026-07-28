import type { Prisma, Task } from "@prisma/client";
import { db } from "@backend/lib/db";
import { persistDrafts, type DraftAction } from "@backend/lib/agent/engine";

const NUDGE_AFTER_MS = 24 * 60 * 60 * 1000;

interface PRMeta {
  type?: string;
  repo?: string; // "owner/name"
  number?: number;
  author?: string;
  state?: string;
  isDraft?: boolean;
  requestedReviewers?: string[];
  reviewDecision?: string; // approved | changes_requested | pending
  ciStatus?: string; // success | failure | pending
  updatedAt?: string;
}

function prMetaOf(task: Task): PRMeta | null {
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const gh = (meta.github ?? {}) as PRMeta;
  return gh.type === "pull_request" ? gh : null;
}

/**
 * The approval-gated Shepherd actions a single open PR warrants. Pure over the
 * PR Task's stored metadata — the webhook keeps that fresh (G2).
 */
function draftsForPR(task: Task, gh: PRMeta, now: number): DraftAction[] {
  if (gh.state !== "open" || gh.isDraft) return [];
  if (!gh.repo || typeof gh.number !== "number") return [];
  const [owner, repo] = gh.repo.split("/");
  if (!owner || !repo) return [];

  const prNumber = gh.number;
  const externalId = task.externalId ?? `${gh.repo}#${prNumber}`;
  const url = task.externalUrl;
  const sources = [{ kind: "task", id: task.id, title: task.title }] as unknown as Prisma.InputJsonValue;
  const reviewers = Array.isArray(gh.requestedReviewers) ? gh.requestedReviewers.filter(Boolean) : [];
  const updatedAt = gh.updatedAt ? new Date(gh.updatedAt).getTime() : task.createdAt.getTime();

  const drafts: DraftAction[] = [];

  // FLAG_PR — red CI or changes requested.
  if (gh.ciStatus === "failure" || gh.reviewDecision === "changes_requested") {
    const reason = gh.ciStatus === "failure" ? "CI is failing" : "changes were requested";
    drafts.push({
      type: "FLAG_PR",
      dedupeKey: `pr:${externalId}:flag`,
      title: `${task.title} needs attention`,
      rationale: `This PR ${reason} — flagging it so it doesn't stall.`,
      confidence: 0.9,
      sources,
      payload: { owner, repo, prNumber, reason, url },
    });
  }

  if (reviewers.length === 0) {
    // REQUEST_REVIEW — open non-draft PR with no requested reviewer.
    drafts.push({
      type: "REQUEST_REVIEW",
      dedupeKey: `pr:${externalId}:request_review`,
      title: `No reviewer on ${task.title}`,
      rationale: "This PR is open with no requested reviewer — it can't move until someone is assigned.",
      confidence: 0.7,
      sources,
      payload: { owner, repo, prNumber, url },
    });
  } else if (gh.reviewDecision === "pending" && now - updatedAt > NUDGE_AFTER_MS) {
    // NUDGE_REVIEWER — waiting > 24h on requested reviewers who haven't reviewed.
    drafts.push({
      type: "NUDGE_REVIEWER",
      dedupeKey: `pr:${externalId}:nudge_reviewer`,
      title: `Review stalled on ${task.title}`,
      rationale: `Requested ${reviewers.length === 1 ? "reviewer has" : "reviewers have"} not reviewed in over 24h.`,
      confidence: 0.75,
      sources,
      payload: {
        owner,
        repo,
        prNumber,
        reviewers,
        body: `👋 Gentle nudge on this PR — ${reviewers.map((r) => `@${r}`).join(" ")} when you get a moment. (Sent by Khove)`,
        url,
      },
    });
  }

  return drafts;
}

/**
 * Draft + persist Shepherd actions for one PR Task. Called from the webhook on
 * PR/review/CI events (state-based signals fire immediately; time-based
 * staleness is caught by the cron below).
 */
export async function shepherdScanPR(taskId: string): Promise<{ created: number; total: number }> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || !task.workspaceId) return { created: 0, total: 0 };
  const gh = prMetaOf(task);
  if (!gh) return { created: 0, total: 0 };
  const drafts = draftsForPR(task, gh, Date.now());
  if (drafts.length === 0) return { created: 0, total: 0 };
  return persistDrafts(task.workspaceId, drafts, "agent:pr-shepherd");
}

/**
 * Scan every open PR Task in a workspace — the cron path, which catches
 * time-based staleness (NUDGE_REVIEWER) that no webhook would surface.
 */
export async function shepherdScanWorkspace(workspaceId: string): Promise<{ created: number; total: number }> {
  const tasks = await db.task.findMany({
    where: {
      workspaceId,
      source: { has: "GITHUB" },
      metadata: { path: ["github", "type"], equals: "pull_request" },
    },
  });

  const now = Date.now();
  const drafts: DraftAction[] = [];
  for (const task of tasks) {
    const gh = prMetaOf(task);
    if (gh) drafts.push(...draftsForPR(task, gh, now));
  }

  return persistDrafts(workspaceId, drafts, "agent:pr-shepherd");
}
