import { Prisma } from "@prisma/client";
import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import {
  listPullRequests,
  listIssues,
  listUserRepos,
  listInstallationRepos,
} from "@backend/lib/integrations/github";
import { publishWorkspaceEvent } from "@backend/lib/realtime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SyncRepo = { owner: string; name: string; fullName: string };

/**
 * Repos to sync for a workspace: prefer the App installation's accessible repos
 * (works on org/collaborator repos, not just owned ones); fall back to the
 * connecting user's owned repos when no installation is recorded.
 */
async function resolveSyncableRepos(workspaceId: string): Promise<SyncRepo[]> {
  try {
    const repos = await listInstallationRepos(workspaceId);
    if (repos.length > 0) {
      return repos.map((r) => ({ owner: r.owner, name: r.name, fullName: r.fullName }));
    }
  } catch {
    // No installation token / listing failed — fall back to owned repos below.
  }
  const owned = await listUserRepos(workspaceId, { per_page: 30 });
  return owned.map((r) => ({ owner: r.owner, name: r.name, fullName: r.fullName }));
}

/** Find all active workspaces for a given App installation id. */
async function findWorkspacesByInstallation(installationId: number | undefined) {
  if (!installationId) return [];
  return db.integration.findMany({
    where: {
      provider: "GITHUB",
      isActive: true,
      metadata: { path: ["installationId"], equals: installationId },
    },
  });
}

/** Shallow-merge a patch into a task's `metadata.github`, preserving other keys. */
async function patchGithubMeta(
  task: { id: string; metadata: unknown },
  patch: Record<string, unknown>,
) {
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const github = (meta.github ?? {}) as Record<string, unknown>;
  await db.task.update({
    where: { id: task.id },
    data: { metadata: { ...meta, github: { ...github, ...patch } } as Prisma.InputJsonObject },
  });
}

/** The Shepherd-relevant PR state derivable from a `pull_request` webhook object. */
function derivePRState(pr: {
  state?: string;
  draft?: boolean;
  requested_reviewers?: { login: string }[];
  head?: { sha?: string };
  user?: { login?: string };
  updated_at?: string;
  labels?: { name: string }[];
}): Record<string, unknown> {
  return {
    state: pr.state,
    isDraft: pr.draft,
    requestedReviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
    headSha: pr.head?.sha,
    author: pr.user?.login,
    updatedAt: pr.updated_at,
    labels: (pr.labels ?? []).map((l) => l.name),
  };
}

/** Normalise a CI conclusion/status string to the Task's `ciStatus` field. */
function mapCiStatus(raw: string | null | undefined): "success" | "failure" | "pending" | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v === "success") return "success";
  if (["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale", "error"].includes(v)) {
    return "failure";
  }
  if (["pending", "queued", "in_progress", "requested", "waiting", "neutral", "skipped"].includes(v)) {
    return "pending";
  }
  return undefined; // unknown — don't clobber
}

// ---------------------------------------------------------------------------
// Initial sync — dispatched after OAuth callback
// ---------------------------------------------------------------------------

export const initialGitHubSync = inngest.createFunction(
  {
    id: "github-initial-sync",
    concurrency: { limit: 1, key: "event.data.workspaceId" },
    triggers: [{ event: "github/initial-sync" }],
  },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string };

    const result = await step.run("sync-github-data", async () => {
      const defaultStatus =
        await db.workflowStatus.findFirst({
          where: { category: "NOT_STARTED", workspaceId, isDefault: true },
        }) ??
        await db.workflowStatus.findFirst({
          where: { category: "NOT_STARTED", workspaceId: null, isDefault: true },
        });

      const repos = await resolveSyncableRepos(workspaceId);
      let issuesCreated = 0;
      let prsCreated = 0;

      // Cap breadth to keep the initial sync within the step budget.
      for (const repo of repos.slice(0, 15)) {
        try {
          const prs = await listPullRequests(workspaceId, repo.owner, repo.name, "open", 20);
          for (const pr of prs) {
            const externalId = `github-pr-${repo.fullName}-${pr.number}`;
            const existing = await db.task.findFirst({
              where: { externalId, workspaceId },
            });
            if (!existing) {
              await db.task.create({
                data: {
                  title: `PR #${pr.number}: ${pr.title}`,
                  source: ["GITHUB"],
                  externalId,
                  externalUrl: pr.url,
                  userId,
                  workspaceId,
                  statusId: defaultStatus?.id ?? null,
                  priority: "MEDIUM",
                  metadata: {
                    github: {
                      type: "pull_request",
                      repo: repo.fullName,
                      number: pr.number,
                      author: pr.author,
                      state: "open",
                      isDraft: pr.draft,
                      requestedReviewers: pr.reviewers,
                      reviewDecision: "pending",
                      ciStatus: "pending",
                      headSha: pr.headSha,
                      labels: pr.labels,
                      updatedAt: pr.updatedAt,
                    },
                  },
                },
              });
              prsCreated++;
            }
          }

          const issues = await listIssues(workspaceId, repo.owner, repo.name, "open", 20);
          for (const issue of issues) {
            const externalId = `github-issue-${repo.fullName}-${issue.number}`;
            const existing = await db.task.findFirst({
              where: { externalId, workspaceId },
            });
            if (!existing) {
              await db.task.create({
                data: {
                  title: `Issue #${issue.number}: ${issue.title}`,
                  source: ["GITHUB"],
                  externalId,
                  externalUrl: issue.url,
                  userId,
                  workspaceId,
                  statusId: defaultStatus?.id ?? null,
                  priority: "MEDIUM",
                  metadata: {
                    github: {
                      type: "issue",
                      repo: repo.fullName,
                      number: issue.number,
                      author: issue.author,
                      labels: issue.labels,
                    },
                  },
                },
              });
              issuesCreated++;
            }
          }
        } catch {
          // Skip repos that fail
        }
      }

      return { prsCreated, issuesCreated, reposSynced: Math.min(repos.length, 15) };
    });

    await publishWorkspaceEvent(workspaceId, { type: "task.created", taskId: "github-sync" });

    return result;
  },
);

// ---------------------------------------------------------------------------
// Webhook handler — incremental sync, routed by App installation
// ---------------------------------------------------------------------------

export const handleGitHubWebhook = inngest.createFunction(
  {
    id: "github-webhook-handler",
    concurrency: { limit: 5 },
    triggers: [{ event: "github/webhook.received" }],
  },
  async ({ event, step }) => {
    const { eventType, payload, installationId } = event.data as {
      eventType: string;
      payload: Record<string, unknown>;
      installationId?: number;
    };

    await step.run("process-webhook", async () => {
      switch (eventType) {
        // ── App install lifecycle — keep installationId/repos in sync ──
        case "installation": {
          const p = payload as {
            action: string; // created | deleted | suspend | unsuspend | new_permissions_accepted
            installation: { id: number };
            repositories?: { full_name: string }[];
          };
          const integrations = await findWorkspacesByInstallation(p.installation.id);
          for (const integration of integrations) {
            if (p.action === "deleted") {
              await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
            } else if (p.action === "suspend") {
              await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
            } else if (p.action === "unsuspend") {
              await db.integration.update({ where: { id: integration.id }, data: { isActive: true } });
            } else if (p.repositories) {
              const meta = (integration.metadata ?? {}) as Record<string, unknown>;
              await db.integration.update({
                where: { id: integration.id },
                data: { metadata: { ...meta, repos: p.repositories.map((r) => r.full_name) } },
              });
            }
            await publishWorkspaceEvent(integration.workspaceId, { type: "refresh" });
          }
          break;
        }

        case "installation_repositories": {
          const p = payload as {
            installation: { id: number };
            repositories_added?: { full_name: string }[];
            repositories_removed?: { full_name: string }[];
          };
          const integrations = await findWorkspacesByInstallation(p.installation.id);
          for (const integration of integrations) {
            const meta = (integration.metadata ?? {}) as Record<string, unknown>;
            const current = new Set<string>(Array.isArray(meta.repos) ? (meta.repos as string[]) : []);
            for (const r of p.repositories_added ?? []) current.add(r.full_name);
            for (const r of p.repositories_removed ?? []) current.delete(r.full_name);
            await db.integration.update({
              where: { id: integration.id },
              data: { metadata: { ...meta, repos: [...current] } },
            });
            await publishWorkspaceEvent(integration.workspaceId, { type: "refresh" });
          }
          break;
        }

        // opened, reopened, ready_for_review, converted_to_draft, synchronize,
        // review_requested, review_request_removed, labeled, edited, closed
        case "pull_request": {
          const pr = payload as {
            action: string;
            pull_request: {
              number: number;
              title: string;
              html_url: string;
              user: { login: string };
              draft: boolean;
              state?: string;
              labels: { name: string }[];
              merged: boolean;
              requested_reviewers?: { login: string }[];
              head?: { sha?: string };
              updated_at?: string;
            };
            repository: { full_name: string };
          };

          const integrations = await findWorkspacesByInstallation(installationId);
          const repo = pr.repository.full_name;
          const prNum = pr.pull_request.number;
          const externalId = `github-pr-${repo}-${prNum}`;
          const derived = derivePRState(pr.pull_request);

          for (const integration of integrations) {
            const wsId = integration.workspaceId;
            let task = await db.task.findFirst({ where: { externalId, workspaceId: wsId } });

            if (!task) {
              // Create if we missed the open (e.g. a mid-life event) so PRs never vanish.
              const defaultStatus = await db.workflowStatus.findFirst({
                where: { category: "NOT_STARTED", workspaceId: wsId, isDefault: true },
              });
              task = await db.task.create({
                data: {
                  title: `PR #${prNum}: ${pr.pull_request.title}`,
                  source: ["GITHUB"],
                  externalId,
                  externalUrl: pr.pull_request.html_url,
                  userId: integration.userId,
                  workspaceId: wsId,
                  statusId: defaultStatus?.id ?? null,
                  priority: "MEDIUM",
                  metadata: {
                    github: {
                      type: "pull_request",
                      repo,
                      number: prNum,
                      reviewDecision: "pending",
                      ciStatus: "pending",
                      ...derived,
                    },
                  },
                },
              });
              await publishWorkspaceEvent(wsId, { type: "task.created", taskId: externalId });
            } else {
              await patchGithubMeta(task, derived);
            }

            if (pr.action === "closed") {
              const doneStatus = await db.workflowStatus.findFirst({
                where: { category: pr.pull_request.merged ? "DONE" : "CANCELLED", workspaceId: wsId },
              });
              await db.task.update({
                where: { id: task.id },
                data: { statusId: doneStatus?.id ?? null },
              });
            }
            await publishWorkspaceEvent(wsId, { type: "task.updated", taskId: task.id });
          }
          break;
        }

        // Aggregate review decision — latest approved / changes_requested wins.
        case "pull_request_review": {
          const p = payload as {
            action: string;
            review: { state?: string };
            pull_request: { number: number };
            repository: { full_name: string };
          };
          const st = p.review.state?.toLowerCase();
          const reviewDecision =
            st === "changes_requested" ? "changes_requested" : st === "approved" ? "approved" : undefined;
          if (!reviewDecision) break; // commented / dismissed — no decision change

          const integrations = await findWorkspacesByInstallation(installationId);
          const externalId = `github-pr-${p.repository.full_name}-${p.pull_request.number}`;
          for (const integration of integrations) {
            const task = await db.task.findFirst({
              where: { externalId, workspaceId: integration.workspaceId },
            });
            if (task) {
              await patchGithubMeta(task, { reviewDecision });
              await publishWorkspaceEvent(integration.workspaceId, { type: "task.updated", taskId: task.id });
            }
          }
          break;
        }

        // CI signals — matched to PR tasks by PR number and/or head SHA.
        case "check_suite":
        case "check_run":
        case "workflow_run":
        case "status": {
          const integrations = await findWorkspacesByInstallation(installationId);
          if (integrations.length === 0) break;

          let headSha: string | undefined;
          let prNumbers: number[] = [];
          let raw: string | null | undefined;

          if (eventType === "status") {
            const p = payload as { sha: string; state: string };
            headSha = p.sha;
            raw = p.state;
          } else {
            const key = eventType === "check_suite" ? "check_suite" : eventType === "check_run" ? "check_run" : "workflow_run";
            const node = (payload as Record<string, unknown>)[key] as {
              head_sha?: string;
              conclusion?: string | null;
              status?: string;
              pull_requests?: { number: number }[];
            };
            headSha = node.head_sha;
            raw = node.conclusion ?? node.status;
            prNumbers = (node.pull_requests ?? []).map((x) => x.number);
          }

          const ciStatus = mapCiStatus(raw);
          if (!ciStatus) break;

          const repoFull = (payload.repository as { full_name?: string } | undefined)?.full_name;

          for (const integration of integrations) {
            const wsId = integration.workspaceId;
            const matched = new Map<string, { id: string; metadata: unknown }>();

            if (repoFull) {
              for (const n of prNumbers) {
                const t = await db.task.findFirst({
                  where: { externalId: `github-pr-${repoFull}-${n}`, workspaceId: wsId },
                });
                if (t) matched.set(t.id, t);
              }
            }
            if (headSha) {
              const t = await db.task.findFirst({
                where: { workspaceId: wsId, metadata: { path: ["github", "headSha"], equals: headSha } },
              });
              if (t) matched.set(t.id, t);
            }

            for (const t of matched.values()) {
              await patchGithubMeta(t, { ciStatus });
              await publishWorkspaceEvent(wsId, { type: "task.updated", taskId: t.id });
            }
          }
          break;
        }

        case "issues": {
          const issue = payload as {
            action: string;
            issue: {
              number: number;
              title: string;
              html_url: string;
              user: { login: string };
              labels: { name: string }[];
            };
            repository: { full_name: string };
          };

          const integrations = await findWorkspacesByInstallation(installationId);
          const repo = issue.repository.full_name;

          for (const integration of integrations) {
            const externalId = `github-issue-${repo}-${issue.issue.number}`;
            const wsId = integration.workspaceId;

            if (issue.action === "opened") {
              const defaultStatus = await db.workflowStatus.findFirst({
                where: { category: "NOT_STARTED", workspaceId: wsId, isDefault: true },
              });

              const existing = await db.task.findFirst({ where: { externalId, workspaceId: wsId } });
              if (!existing) {
                await db.task.create({
                  data: {
                    title: `Issue #${issue.issue.number}: ${issue.issue.title}`,
                    source: ["GITHUB"],
                    externalId,
                    externalUrl: issue.issue.html_url,
                    userId: integration.userId,
                    workspaceId: wsId,
                    statusId: defaultStatus?.id ?? null,
                    priority: "MEDIUM",
                    metadata: {
                      github: {
                        type: "issue",
                        repo,
                        number: issue.issue.number,
                        author: issue.issue.user.login,
                      },
                    },
                  },
                });
              }

              await publishWorkspaceEvent(wsId, { type: "task.created", taskId: externalId });
            } else if (issue.action === "closed") {
              const task = await db.task.findFirst({ where: { externalId, workspaceId: wsId } });
              if (task) {
                const doneStatus = await db.workflowStatus.findFirst({
                  where: { category: "DONE", workspaceId: wsId },
                });
                await db.task.update({
                  where: { id: task.id },
                  data: { statusId: doneStatus?.id ?? null },
                });
                await publishWorkspaceEvent(wsId, { type: "task.updated", taskId: task.id });
              }
            }
          }
          break;
        }

        default:
          break;
      }
    });
  },
);
