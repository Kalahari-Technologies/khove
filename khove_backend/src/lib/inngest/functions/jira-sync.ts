import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { publishWorkspaceEvent } from "@backend/lib/realtime";
import {
  searchIssues,
  mapJiraStatusCategory,
  registerJiraWebhook,
  refreshJiraWebhooks,
  isAuthError,
  refreshAccessToken,
  type JiraIssue,
} from "@backend/lib/integrations/jira";
import { encrypt, decrypt } from "@backend/lib/encryption";

// ---------------------------------------------------------------------------
// Shared upsert — maps Jira issues to workspace-scoped Tasks (no personal data)
// ---------------------------------------------------------------------------

type StatusCategory = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

async function findStatusId(workspaceId: string, category: StatusCategory): Promise<string | null> {
  const status =
    (await db.workflowStatus.findFirst({ where: { category, workspaceId, isDefault: true } })) ??
    (await db.workflowStatus.findFirst({ where: { category, workspaceId } })) ??
    (await db.workflowStatus.findFirst({ where: { category, workspaceId: null, isDefault: true } }));
  return status?.id ?? null;
}

/** Upsert a single Jira issue into a Task. Returns "created" | "updated". */
async function upsertIssueTask(
  workspaceId: string,
  userId: string,
  siteUrl: string,
  issue: JiraIssue,
): Promise<"created" | "updated"> {
  const issueKey = issue.key;
  const externalId = `jira-${issueKey}`;
  const summary = issue.fields.summary ?? issueKey;
  const projectKey = issue.fields.project?.key ?? issueKey.split("-")[0];
  const statusName = issue.fields.status?.name ?? "";
  const category = mapJiraStatusCategory(issue.fields.status?.statusCategory?.key);
  const issueType = issue.fields.issuetype?.name ?? "Task";
  const externalUrl = siteUrl ? `${siteUrl}/browse/${issueKey}` : null;
  const statusId = await findStatusId(workspaceId, category);

  // Minimal, content-only metadata — no assignee/reporter/personal fields.
  const metadata = {
    jira: { issueKey, projectKey, status: statusName, statusCategory: category, issueType, url: externalUrl },
  };

  const existing = await db.task.findFirst({ where: { externalId, workspaceId } });
  if (existing) {
    await db.task.update({
      where: { id: existing.id },
      data: { title: `[${issueKey}] ${summary}`, statusId, externalUrl, metadata },
    });
    return "updated";
  }

  await db.task.create({
    data: {
      title: `[${issueKey}] ${summary}`,
      source: ["JIRA"],
      externalId,
      externalUrl,
      userId,
      workspaceId,
      statusId,
      priority: "MEDIUM",
      metadata,
    },
  });
  return "created";
}

/** Sync issues matching a JQL into Tasks. Returns counts + distinct project keys. */
async function syncJiraIssues(
  workspaceId: string,
  userId: string,
  jql: string,
): Promise<{ created: number; updated: number; projectKeys: string[] }> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "JIRA", isActive: true },
    select: { metadata: true },
  });
  const siteUrl = ((integration?.metadata ?? {}) as Record<string, unknown>).siteUrl as string ?? "";

  const issues = await searchIssues(workspaceId, jql);
  let created = 0;
  let updated = 0;
  const projectKeys = new Set<string>();

  for (const issue of issues) {
    const key = issue.fields.project?.key ?? issue.key.split("-")[0];
    if (key) projectKeys.add(key);
    try {
      const r = await upsertIssueTask(workspaceId, userId, siteUrl, issue);
      if (r === "created") created++;
      else updated++;
    } catch {
      // skip individual failures
    }
  }

  return { created, updated, projectKeys: [...projectKeys] };
}

// ---------------------------------------------------------------------------
// Initial sync — last 30 days + register the dynamic webhook
// ---------------------------------------------------------------------------

export const jiraInitialSync = inngest.createFunction(
  {
    id: "jira-initial-sync",
    concurrency: { limit: 1, key: "event.data.workspaceId" },
    triggers: [{ event: "jira/initial-sync" }],
  },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string };

    const result = await step.run("sync-issues", async () =>
      syncJiraIssues(workspaceId, userId, "updated >= -30d ORDER BY updated DESC"),
    );

    // Best-effort: register a project-scoped dynamic webhook for live updates.
    await step.run("register-webhook", async () => {
      if (result.projectKeys.length === 0) return { registered: false };
      const secret = crypto.randomUUID();
      const res = await registerJiraWebhook(workspaceId, secret, result.projectKeys);
      const integration = await db.integration.findFirst({
        where: { workspaceId, provider: "JIRA", isActive: true },
        select: { id: true, metadata: true },
      });
      if (integration) {
        const meta = (integration.metadata ?? {}) as Record<string, unknown>;
        await db.integration.update({
          where: { id: integration.id },
          data: {
            metadata: {
              ...meta,
              webhookSecret: secret,
              webhookIds: res ? [res.id] : [],
              projectKeys: result.projectKeys,
            },
          },
        });
      }
      return { registered: !!res };
    });

    await publishWorkspaceEvent(workspaceId, { type: "task.created", taskId: "jira-sync" });
    return result;
  },
);

// ---------------------------------------------------------------------------
// Poll sync — daily incremental (reliable backstop for webhooks)
// ---------------------------------------------------------------------------

export const jiraPollSync = inngest.createFunction(
  { id: "jira-poll-sync", triggers: [{ cron: "0 7 * * *" }] }, // daily 07:00 UTC
  async ({ step }) => {
    const integrations = await step.run("find-jira-workspaces", async () =>
      db.integration.findMany({
        where: { provider: "JIRA", isActive: true },
        select: { workspaceId: true, userId: true },
      }),
    );

    let created = 0;
    let updated = 0;
    for (const { workspaceId, userId } of integrations) {
      const res = await step.run(`poll-${workspaceId}`, async () => {
        try {
          return await syncJiraIssues(workspaceId, userId, "updated >= -2d ORDER BY updated DESC");
        } catch (err) {
          console.error(`[jira-poll] ${workspaceId} failed`, err);
          return { created: 0, updated: 0, projectKeys: [] };
        }
      });
      created += res.created;
      updated += res.updated;
      if (res.created + res.updated > 0) {
        await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: "jira-sync" });
      }
    }
    return { workspaces: integrations.length, created, updated };
  },
);

// ---------------------------------------------------------------------------
// Webhook handler — incremental single-issue upsert/delete
// ---------------------------------------------------------------------------

export const handleJiraWebhook = inngest.createFunction(
  { id: "jira-webhook-handler", concurrency: { limit: 5 }, triggers: [{ event: "jira/webhook.received" }] },
  async ({ event, step }) => {
    const { workspaceId, userId, payload } = event.data as {
      workspaceId: string;
      userId: string;
      payload: { webhookEvent?: string; issue?: JiraIssue };
    };

    await step.run("process", async () => {
      const issue = payload.issue;
      if (!issue?.key) return;
      const externalId = `jira-${issue.key}`;

      if (payload.webhookEvent === "jira:issue_deleted") {
        await db.task.deleteMany({ where: { externalId, workspaceId } });
        await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: externalId });
        return;
      }

      const integration = await db.integration.findFirst({
        where: { workspaceId, provider: "JIRA", isActive: true },
        select: { metadata: true },
      });
      const siteUrl = ((integration?.metadata ?? {}) as Record<string, unknown>).siteUrl as string ?? "";
      await upsertIssueTask(workspaceId, userId, siteUrl, issue);
      await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: externalId });
    });
  },
);

// ---------------------------------------------------------------------------
// Token refresh cron — refresh near-expiry tokens; deactivate on hard failure
// ---------------------------------------------------------------------------

export const refreshJiraTokens = inngest.createFunction(
  { id: "jira-refresh-tokens", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    const soon = new Date(Date.now() + 10 * 60 * 1000); // within 10 min
    const integrations = await step.run("find-expiring", async () =>
      db.integration.findMany({
        where: { provider: "JIRA", isActive: true, tokenExpiresAt: { lte: soon } },
      }),
    );

    let refreshed = 0;
    for (const integration of integrations) {
      await step.run(`refresh-${integration.id}`, async () => {
        if (!integration.refreshTokenEnc) return;
        try {
          const tokens = await refreshAccessToken(decrypt(integration.refreshTokenEnc));
          await db.integration.update({
            where: { id: integration.id },
            data: {
              accessTokenEnc: encrypt(tokens.access_token),
              ...(tokens.refresh_token && { refreshTokenEnc: encrypt(tokens.refresh_token) }),
              tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            },
          });
          refreshed++;
        } catch (err) {
          if (isAuthError(err)) {
            await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
            await publishWorkspaceEvent(integration.workspaceId, { type: "refresh" }).catch(() => {});
          }
        }
      });
    }
    return { checked: integrations.length, refreshed };
  },
);

// ---------------------------------------------------------------------------
// Webhook renewal cron — extend the 30-day expiry
// ---------------------------------------------------------------------------

export const renewJiraWebhooks = inngest.createFunction(
  { id: "jira-renew-webhooks", triggers: [{ cron: "0 6 * * *" }] }, // daily 06:00 UTC
  async ({ step }) => {
    const integrations = await step.run("find-webhooked", async () =>
      db.integration.findMany({ where: { provider: "JIRA", isActive: true } }),
    );

    let renewed = 0;
    for (const integration of integrations) {
      const meta = (integration.metadata ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(meta.webhookIds) ? (meta.webhookIds as number[]) : [];
      if (ids.length === 0) continue;
      await step.run(`renew-${integration.id}`, async () => {
        const expiry = await refreshJiraWebhooks(integration.workspaceId, ids);
        if (expiry) renewed++;
      });
    }
    return { renewed };
  },
);

// ---------------------------------------------------------------------------
// Disconnect cleanup — delete synced Tasks + registered webhooks
// ---------------------------------------------------------------------------

// The webhook deletion happens in the disconnect route (while the token is still
// valid); this only clears the synced Tasks.
export const jiraDisconnectCleanup = inngest.createFunction(
  { id: "jira-disconnect-cleanup", triggers: [{ event: "jira/disconnected" }] },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    await step.run("delete-tasks", async () => {
      await db.task.deleteMany({ where: { workspaceId, source: { has: "JIRA" } } });
    });

    await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: "jira-sync" });
    return { ok: true };
  },
);
