import { db } from "@backend/lib/db";
import { linkToThread } from "@backend/lib/threads";

/**
 * Auto-link a GitHub PR Task into any Connectivity Thread that ALREADY
 * references it, and attach the PR's author + requested reviewers as people.
 *
 * Never *creates* a thread — a standalone PR with people becomes a
 * `SUGGEST_THREAD` proposal (drafted by the Shepherd engine). This only enriches
 * threads that were already formed (e.g. a meeting whose notes cite the PR).
 *
 * Handles the "placeholder" case: `autoLinkMeeting` links a cited PR by its
 * `externalId` when the PR Task doesn't exist yet; once it's synced, that link
 * is upgraded to point at the real Task id.
 */
export async function linkPRToThreads(
  workspaceId: string,
  prTaskId: string,
): Promise<{ threads: number }> {
  const task = await db.task.findUnique({ where: { id: prTaskId } });
  if (!task || task.workspaceId !== workspaceId || !task.source.includes("GITHUB")) {
    return { threads: 0 };
  }
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const gh = (meta.github ?? {}) as Record<string, unknown>;
  if (gh.type !== "pull_request") return { threads: 0 };

  // Threads referencing this PR — by real Task id OR the externalId placeholder.
  const refIds = [task.id, task.externalId].filter(Boolean) as string[];
  const links = await db.threadLink.findMany({
    where: { kind: "GITHUB_PR", refId: { in: refIds }, thread: { workspaceId } },
    select: { id: true, threadId: true, refId: true },
  });
  if (links.length === 0) return { threads: 0 };

  const author = typeof gh.author === "string" ? gh.author : undefined;
  const reviewers = Array.isArray(gh.requestedReviewers) ? (gh.requestedReviewers as string[]) : [];
  const logins = [...new Set([author, ...reviewers].filter(Boolean))] as string[];

  const threadIds = new Set<string>();
  for (const link of links) {
    threadIds.add(link.threadId);
    // Point the link at the real Task (idempotent) and refresh title/url.
    await linkToThread(workspaceId, link.threadId, {
      kind: "GITHUB_PR",
      refId: task.id,
      refUrl: task.externalUrl,
      title: task.title,
      metadata: { externalId: task.externalId },
    });
    // Drop a stale placeholder link that pointed at the externalId.
    if (link.refId !== task.id) {
      await db.threadLink.delete({ where: { id: link.id } }).catch(() => {});
    }
  }

  // Attach the PR's people, keyed by GitHub login (external — not member emails).
  for (const threadId of threadIds) {
    for (const login of logins) {
      await linkToThread(workspaceId, threadId, {
        kind: "PERSON",
        refId: `github:${login}`,
        title: login,
        metadata: { githubLogin: login },
      });
    }
  }

  return { threads: threadIds.size };
}
