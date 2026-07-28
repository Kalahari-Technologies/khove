import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { listPullRequests, listIssues, listUserRepos } from "@backend/lib/integrations/github";
import { publishEvent, publishWorkspaceEvent } from "@backend/lib/realtime";

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

      // Fetch top repos (workspaceId-scoped client)
      const repos = await listUserRepos(workspaceId, { per_page: 10 });
      let issuesCreated = 0;
      let prsCreated = 0;

      for (const repo of repos.slice(0, 5)) {
        try {
          const prs = await listPullRequests(workspaceId, repo.owner, repo.name, "open", 10);
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
                      draft: pr.draft,
                      labels: pr.labels,
                    },
                  },
                },
              });
              prsCreated++;
            }
          }

          const issues = await listIssues(workspaceId, repo.owner, repo.name, "open", 10);
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

      return { prsCreated, issuesCreated, reposSynced: Math.min(repos.length, 5) };
    });

    await publishWorkspaceEvent(workspaceId, { type: "task.created", taskId: "github-sync" });

    return result;
  },
);

// ---------------------------------------------------------------------------
// Webhook handler — incremental sync
// ---------------------------------------------------------------------------

export const handleGitHubWebhook = inngest.createFunction(
  {
    id: "github-webhook-handler",
    concurrency: { limit: 5 },
    triggers: [{ event: "github/webhook.received" }],
  },
  async ({ event, step }) => {
    const { eventType, payload } = event.data as {
      eventType: string;
      payload: Record<string, unknown>;
    };

    await step.run("process-webhook", async () => {
      switch (eventType) {
        case "pull_request": {
          const pr = payload as {
            action: string;
            pull_request: {
              number: number;
              title: string;
              html_url: string;
              user: { login: string };
              draft: boolean;
              labels: { name: string }[];
              merged: boolean;
            };
            repository: { full_name: string };
            sender: { login: string };
          };

          // Find ALL workspaces with a GitHub integration matching this sender
          const integrations = await db.integration.findMany({
            where: {
              provider: "GITHUB",
              isActive: true,
              metadata: { path: ["login"], equals: pr.sender.login },
            },
          });

          const repo = pr.repository.full_name;

          for (const integration of integrations) {
            const externalId = `github-pr-${repo}-${pr.pull_request.number}`;
            const wsId = integration.workspaceId;

            if (pr.action === "opened" || pr.action === "reopened") {
              const defaultStatus = await db.workflowStatus.findFirst({
                where: { category: "NOT_STARTED", workspaceId: wsId, isDefault: true },
              });

              const existing = await db.task.findFirst({ where: { externalId, workspaceId: wsId } });
              if (!existing) {
                await db.task.create({
                  data: {
                    title: `PR #${pr.pull_request.number}: ${pr.pull_request.title}`,
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
                        number: pr.pull_request.number,
                        author: pr.pull_request.user.login,
                        draft: pr.pull_request.draft,
                      },
                    },
                  },
                });
              }

              await publishWorkspaceEvent(wsId, { type: "task.created", taskId: externalId });
            } else if (pr.action === "closed") {
              const task = await db.task.findFirst({ where: { externalId, workspaceId: wsId } });
              if (task) {
                const doneStatus = await db.workflowStatus.findFirst({
                  where: { category: pr.pull_request.merged ? "DONE" : "CANCELLED", workspaceId: wsId },
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
            sender: { login: string };
          };

          const integrations = await db.integration.findMany({
            where: {
              provider: "GITHUB",
              isActive: true,
              metadata: { path: ["login"], equals: issue.sender.login },
            },
          });

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
