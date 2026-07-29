import { Prisma } from "@prisma/client";
import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import {
  listPullRequests,
  listIssues,
  listUserRepos,
  listInstallationRepos,
  listReleases,
  listMilestones,
  getShepherdClient,
} from "@backend/lib/integrations/github";
import { recordEntities, type EntityInput } from "@backend/lib/entities/record";
import { githubRepoEntity, githubReleaseEntity, githubMilestoneEntity } from "@backend/lib/entities/github";
import { publishWorkspaceEvent } from "@backend/lib/realtime";
import { redis } from "@backend/lib/redis";
import { linkPRToThreads } from "@backend/lib/threads";
import { shepherdScanPR } from "@backend/lib/agent/shepherd";
import { recordSignals } from "@backend/lib/signals/record";
import {
  prWebhookSignals,
  reviewSubmittedSignal,
  ciCompletedSignal,
  backfilledMergedPR,
} from "@backend/lib/signals/github";

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
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
    select: { metadata: true },
  });
  const meta = (integration?.metadata ?? {}) as Record<string, unknown>;
  const hasInstallation = typeof meta.installationId === "number";

  let repos: SyncRepo[] = [];
  if (hasInstallation) {
    // Installed as an App → the installation's repos are the ONLY correct source.
    // Never fall back to the user's personal repos here — that would sync the wrong
    // account's data under the org.
    try {
      const installed = await listInstallationRepos(workspaceId);
      repos = installed.map((r) => ({ owner: r.owner, name: r.name, fullName: r.fullName }));
    } catch (err) {
      console.error("[github-sync] installation repo listing failed:", err);
      repos = [];
    }
  } else {
    // OAuth-only (no App installation) → the connecting user's own repos.
    const owned = await listUserRepos(workspaceId, { per_page: 30 });
    repos = owned.map((r) => ({ owner: r.owner, name: r.name, fullName: r.fullName }));
  }

  // Honor the workspace's chosen scope (the product boundary). If a selection is
  // set, sync only those repos; if it no longer matches anything, fall back to all.
  const scope = meta.scope as { repos?: string[] } | undefined;
  if (scope?.repos?.length) {
    const set = new Set(scope.repos);
    const filtered = repos.filter((r) => set.has(r.fullName));
    if (filtered.length) return filtered;
  }
  return repos;
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

export interface GitHubSyncOutcome {
  prsCreated: number;
  issuesCreated: number;
  backfillSignals: number;
  reposSynced: number;
  reposAccessible: number;
}

// Core GitHub sync body — writes Tasks + Signals + Entities and prunes out-of-scope
// repos. (Body kept verbatim from the former sync-github-data step; over-indented.)
async function syncGithubData(workspaceId: string, userId: string): Promise<GitHubSyncOutcome> {
      const defaultStatus =
        await db.workflowStatus.findFirst({
          where: { category: "NOT_STARTED", workspaceId, isDefault: true },
        }) ??
        await db.workflowStatus.findFirst({
          where: { category: "NOT_STARTED", workspaceId: null, isDefault: true },
        });

      const repos = await resolveSyncableRepos(workspaceId);
      // Prefer the installation client for listing so coverage matches the repos
      // we discovered (org/collaborator repos the user token can't read).
      const octokit = await getShepherdClient(workspaceId).catch(() => undefined);
      let issuesCreated = 0;
      let prsCreated = 0;
      let backfillSignals = 0;
      const backfillSince = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const scanned = repos.slice(0, 15);

      // Rich repo data (language/description/etc.) for the REPOSITORY entities.
      const richRepos = await listInstallationRepos(workspaceId).catch(() => []);
      const richByName = new Map(richRepos.map((r) => [r.fullName, r]));
      const entities = new Map<string, EntityInput>();
      const addEntity = (e: EntityInput) => {
        if (!entities.has(e.externalId)) entities.set(e.externalId, e);
      };

      // Cap breadth to keep the initial sync within the step budget.
      for (const repo of scanned) {
        try {
          // Repository entity + its releases + milestones (the context graph).
          const rich = richByName.get(repo.fullName);
          if (rich) addEntity(githubRepoEntity(rich));
          const [releases, milestones] = await Promise.all([
            listReleases(workspaceId, repo.owner, repo.name, octokit, 10).catch(() => []),
            listMilestones(workspaceId, repo.owner, repo.name, "all", octokit).catch(() => []),
          ]);
          for (const r of releases) addEntity(githubReleaseEntity(repo.fullName, r));
          for (const m of milestones) addEntity(githubMilestoneEntity(repo.fullName, m));

          const prs = await listPullRequests(workspaceId, repo.owner, repo.name, "open", 20, octokit);
          for (const pr of prs) {
            const externalId = `github-pr-${repo.fullName}-${pr.number}`;
            const existing = await db.task.findFirst({
              where: { externalId, workspaceId },
            });
            if (!existing) {
              const created = await db.task.create({
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
                      milestone: pr.milestone,
                      labels: pr.labels,
                      updatedAt: pr.updatedAt,
                    },
                  },
                },
              });
              // Upgrade any placeholder Thread link that cited this PR by URL.
              await linkPRToThreads(workspaceId, created.id).catch(() => {});
              prsCreated++;
            }
          }

          const issues = await listIssues(workspaceId, repo.owner, repo.name, "open", 20, octokit);
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
                      milestone: issue.milestone,
                      labels: issue.labels,
                    },
                  },
                },
              });
              issuesCreated++;
            }
          }

          // Backfill flow history — merged PRs in the last 90 days become
          // WORK_OPENED + WORK_MERGED Signals, so cycle-time / throughput / burn-up
          // charts aren't empty on day one. Idempotent (recordSignals dedupes).
          const closed = await listPullRequests(workspaceId, repo.owner, repo.name, "closed", 30, octokit);
          const merged = closed.filter((p) => p.mergedAt && new Date(p.mergedAt).getTime() >= backfillSince);
          for (const p of merged) {
            backfillSignals += await recordSignals(
              workspaceId,
              backfilledMergedPR(repo.fullName, p.number, p.author, p.createdAt, p.mergedAt ?? undefined),
            );
          }
        } catch (err) {
          console.error(`[github-sync] ${repo.fullName} failed:`, err);
        }
      }

      // Prune stale GitHub data: delete any GITHUB Task (and its Signals) whose
      // repo is NOT in the current scope. This makes a re-sync self-healing —
      // switching accounts (personal → org) or narrowing scope no longer leaves
      // orphaned tasks/repos behind.
      let prunedTasks = 0;
      const scopeRepos = new Set(scanned.map((r) => r.fullName));
      const ghTasks = await db.task.findMany({
        where: { workspaceId, source: { has: "GITHUB" } },
        select: { id: true, externalId: true, metadata: true },
      });
      const stale = ghTasks.filter((t) => {
        const repo = ((t.metadata as Record<string, unknown>)?.github as Record<string, unknown> | undefined)?.repo as
          | string
          | undefined;
        return repo ? !scopeRepos.has(repo) : false;
      });
      if (stale.length) {
        await db.task.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
        const staleKeys = stale.map((t) => t.externalId).filter((k): k is string => !!k);
        if (staleKeys.length) {
          await db.signal.deleteMany({ where: { workspaceId, provider: "GITHUB", entityKey: { in: staleKeys } } });
        }
        prunedTasks = stale.length;
      }

      // Persist the context-graph entities (repos, releases, milestones).
      if (entities.size) await recordEntities(workspaceId, [...entities.values()]).catch(() => {});

      // Persist the repos we actually scanned so the dashboard can show them even
      // when a repo has no open PRs/issues (the sync used to throw this away).
      const integration = await db.integration.findFirst({
        where: { workspaceId, provider: "GITHUB", isActive: true },
        select: { id: true, metadata: true },
      });
      if (integration) {
        const meta = (integration.metadata ?? {}) as Record<string, unknown>;
        await db.integration.update({
          where: { id: integration.id },
          data: {
            metadata: {
              ...meta,
              syncedRepos: scanned.map((r) => r.fullName),
              repoCount: repos.length,
              lastSyncAt: new Date().toISOString(),
            } as Prisma.InputJsonObject,
          },
        });
      }

      return { prsCreated, issuesCreated, backfillSignals, reposSynced: scanned.length, reposAccessible: repos.length };
}

/**
 * Run a GitHub sync INLINE (no Inngest) — used by the connect/resync HTTP routes so
 * data lands (and the real outcome is returned) even when the Inngest runtime isn't
 * processing background events. Mirrors performJiraSync.
 */
export async function performGitHubSync(workspaceId: string, userId: string): Promise<GitHubSyncOutcome> {
  await redis.set(`gh-sync:${workspaceId}`, "syncing", { ex: 600 }).catch(() => {});
  try {
    const result = await syncGithubData(workspaceId, userId);
    await redis
      .set(`gh-sync:${workspaceId}`, JSON.stringify({ status: "done", at: new Date().toISOString(), ...result }), { ex: 300 })
      .catch(() => {});
    await publishWorkspaceEvent(workspaceId, { type: "task.created", taskId: "github-sync" }).catch(() => {});
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "GitHub sync failed";
    console.error(`[github-sync] inline sync failed for ${workspaceId}:`, message);
    await redis
      .set(
        `gh-sync:${workspaceId}`,
        JSON.stringify({ status: "error", message: message.slice(0, 300), at: new Date().toISOString() }),
        { ex: 600 },
      )
      .catch(() => {});
    throw err;
  }
}

export const initialGitHubSync = inngest.createFunction(
  {
    id: "github-initial-sync",
    concurrency: { limit: 1, key: "event.data.workspaceId" },
    triggers: [{ event: "github/initial-sync" }],
  },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string };
    return await step.run("perform-sync", () => performGitHubSync(workspaceId, userId));
  },
);

// ---------------------------------------------------------------------------
// Disconnect cleanup — purge synced GitHub data so nothing goes stale
// ---------------------------------------------------------------------------

export const githubDisconnectCleanup = inngest.createFunction(
  { id: "github-disconnect-cleanup", triggers: [{ event: "github/disconnected" }] },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    const result = await step.run("purge", async () => {
      const tasks = await db.task.deleteMany({ where: { workspaceId, source: { has: "GITHUB" } } });
      const signals = await db.signal.deleteMany({ where: { workspaceId, provider: "GITHUB" } });
      await db.entity.deleteMany({ where: { workspaceId, provider: "GITHUB" } });
      await redis.del(`gh-sync:${workspaceId}`).catch(() => {});
      return { tasksDeleted: tasks.count, signalsDeleted: signals.count };
    });

    await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: "github-sync" });
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
              created_at?: string;
              updated_at?: string;
              merged_at?: string | null;
              closed_at?: string | null;
            };
            repository: { full_name: string };
          };

          const integrations = await findWorkspacesByInstallation(installationId);
          const repo = pr.repository.full_name;
          const prNum = pr.pull_request.number;
          const externalId = `github-pr-${repo}-${prNum}`;
          const derived = derivePRState(pr.pull_request);
          const prSignals = prWebhookSignals(pr.action, pr.pull_request, repo);

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
            // Record the flow Signals (open/merge/close) for delivery metrics.
            if (prSignals.length) await recordSignals(wsId, prSignals).catch(() => {});
            // Enrich any Thread that already references this PR (never auto-creates).
            await linkPRToThreads(wsId, task.id).catch(() => {});
            // Draft approval-gated Shepherd actions (state-based signals).
            await shepherdScanPR(task.id).catch(() => {});
            await publishWorkspaceEvent(wsId, { type: "task.updated", taskId: task.id });
          }
          break;
        }

        // Aggregate review decision — latest approved / changes_requested wins.
        case "pull_request_review": {
          const p = payload as {
            action: string;
            review: { state?: string; submitted_at?: string; user?: { login?: string } };
            pull_request: { number: number };
            repository: { full_name: string };
          };
          const st = p.review.state?.toLowerCase();
          const reviewDecision =
            st === "changes_requested" ? "changes_requested" : st === "approved" ? "approved" : undefined;

          const integrations = await findWorkspacesByInstallation(installationId);
          const repoFull = p.repository.full_name;
          const externalId = `github-pr-${repoFull}-${p.pull_request.number}`;
          // Record REVIEW_SUBMITTED for EVERY review (review-latency counts the first
          // response of any kind), even a comment that doesn't change the decision.
          const reviewSignal = reviewSubmittedSignal(
            repoFull,
            p.pull_request.number,
            p.review.user?.login,
            p.review.state,
            p.review.submitted_at,
          );

          for (const integration of integrations) {
            await recordSignals(integration.workspaceId, [reviewSignal]).catch(() => {});
            if (!reviewDecision) continue; // commented / dismissed — no state change
            const task = await db.task.findFirst({
              where: { externalId, workspaceId: integration.workspaceId },
            });
            if (task) {
              await patchGithubMeta(task, { reviewDecision });
              await shepherdScanPR(task.id).catch(() => {});
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
              const ekey = ((t.metadata as Record<string, unknown>)?.github as Record<string, unknown> | undefined);
              const entityKey = `github-pr-${repoFull}-${(ekey?.number as number) ?? ""}`;
              if (repoFull) await recordSignals(wsId, [ciCompletedSignal(entityKey, repoFull, ciStatus)]).catch(() => {});
              await shepherdScanPR(t.id).catch(() => {});
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
