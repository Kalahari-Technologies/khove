import { Prisma } from "@prisma/client";
import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { publishWorkspaceEvent } from "@backend/lib/realtime";
import { redis } from "@backend/lib/redis";
import {
  searchIssues,
  mapJiraStatusCategory,
  registerJiraWebhook,
  refreshJiraWebhooks,
  isAuthError,
  refreshAccessToken,
  discoverJiraFields,
  parseSprintField,
  type JiraIssue,
  type JiraFieldMap,
} from "@backend/lib/integrations/jira";
import { encrypt, decrypt } from "@backend/lib/encryption";
import { recordSignals } from "@backend/lib/signals/record";
import { jiraBackfillSignals, jiraWebhookSignals } from "@backend/lib/signals/jira";
import { recordEntities, type EntityInput } from "@backend/lib/entities/record";
import { jiraEntitiesFromIssue } from "@backend/lib/entities/jira";

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
  fieldMap: JiraFieldMap = {},
): Promise<"created" | "updated"> {
  const issueKey = issue.key;
  const externalId = `jira-${issueKey}`;
  const f = issue.fields;
  const summary = f.summary ?? issueKey;
  const projectKey = f.project?.key ?? issueKey.split("-")[0];
  const statusName = f.status?.name ?? "";
  const category = mapJiraStatusCategory(f.status?.statusCategory?.key);
  const issueType = f.issuetype?.name ?? "Task";
  const externalUrl = siteUrl ? `${siteUrl}/browse/${issueKey}` : null;
  const statusId = await findStatusId(workspaceId, category);

  // Jira due date → Task.dueDate, so dated issues plot on the planner (the only
  // path besides Google Calendar that populates a plottable date).
  const dueRaw = (f as Record<string, unknown>).duedate as string | null | undefined;
  const dueDate = dueRaw ? new Date(dueRaw) : null;

  // Rich, content-only context (no assignee/reporter → still no personal data).
  const storyPoints = fieldMap.storyPoints ? (f[fieldMap.storyPoints] as number | null) ?? null : null;
  const sprint = fieldMap.sprint ? parseSprintField(f[fieldMap.sprint]) : null;
  const parent = f.parent?.key
    ? { key: f.parent.key, summary: f.parent.fields?.summary, type: f.parent.fields?.issuetype?.name }
    : null;
  const epicKey = fieldMap.epicLink ? (f[fieldMap.epicLink] as string | null) ?? null : null;
  const epic = epicKey
    ? { key: epicKey }
    : parent && (parent.type ?? "").toLowerCase() === "epic"
      ? { key: parent.key, name: parent.summary }
      : null;

  const metadata = {
    jira: {
      issueKey,
      projectKey,
      status: statusName,
      statusCategory: category,
      issueType,
      url: externalUrl,
      priority: f.priority?.name ?? null,
      labels: Array.isArray(f.labels) ? f.labels : [],
      components: Array.isArray(f.components) ? f.components.map((c) => c.name).filter(Boolean) : [],
      fixVersions: Array.isArray(f.fixVersions) ? f.fixVersions.map((v) => v.name).filter(Boolean) : [],
      storyPoints,
      sprint,
      epic,
      parentKey: parent?.key ?? null,
    },
  };

  const json = metadata as unknown as Prisma.InputJsonObject;
  const existing = await db.task.findFirst({ where: { externalId, workspaceId } });
  if (existing) {
    await db.task.update({
      where: { id: existing.id },
      data: { title: `[${issueKey}] ${summary}`, statusId, externalUrl, dueDate, metadata: json },
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
      dueDate,
      priority: "MEDIUM",
      metadata: json,
    },
  });
  return "created";
}

/**
 * Build a JQL bounded by the workspace's project scope (the product boundary)
 * and, optionally, a time clause. Pass no `timeClause` for a full backfill —
 * the initial sync must not be date-boxed, or a project whose issues predate the
 * window syncs nothing (and the whole dashboard, which derives epics/releases/
 * projects/flow FROM the issues, shows empty). Volume is capped by pages instead.
 */
async function scopedJql(workspaceId: string, timeClause?: string | null): Promise<string> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "JIRA", isActive: true },
    select: { metadata: true },
  });
  const scope = ((integration?.metadata ?? {}) as Record<string, unknown>).scope as { projects?: string[] } | undefined;
  const clauses: string[] = [];
  if (scope?.projects?.length) clauses.push(`project in (${scope.projects.join(",")})`);
  if (timeClause) clauses.push(timeClause);
  const where = clauses.join(" AND ");
  return where ? `${where} ORDER BY updated DESC` : `ORDER BY updated DESC`;
}

/** Get the site's custom-field ids, discovering + caching them in metadata once. */
async function getJiraFieldMap(workspaceId: string): Promise<JiraFieldMap> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "JIRA", isActive: true },
    select: { id: true, metadata: true },
  });
  if (!integration) return {};
  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  const cached = meta.jiraFields as JiraFieldMap | undefined;
  if (cached && (cached.sprint || cached.storyPoints || cached.epicLink)) return cached;

  // Custom-field discovery is OPTIONAL enrichment (sprint/story-points/epic-link).
  // It must never block the core issue sync — if it fails, sync with base fields.
  let map: JiraFieldMap = {};
  try {
    map = await discoverJiraFields(workspaceId);
  } catch (err) {
    console.error(`[jira-sync] field discovery failed for ${workspaceId}:`, err instanceof Error ? err.message : err);
    return {};
  }
  await db.integration
    .update({ where: { id: integration.id }, data: { metadata: { ...meta, jiraFields: map } as unknown as Prisma.InputJsonObject } })
    .catch(() => {});
  return map;
}

/** Sync issues matching a JQL into Tasks. Returns counts + distinct project keys. */
async function syncJiraIssues(
  workspaceId: string,
  userId: string,
  jql: string,
  maxPages = 3,
): Promise<{ created: number; updated: number; projectKeys: string[]; found: number; jql: string; site: string }> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "JIRA", isActive: true },
    select: { metadata: true },
  });
  const meta = (integration?.metadata ?? {}) as Record<string, unknown>;
  const siteUrl = (meta.siteUrl as string) ?? "";
  const site = (meta.siteName as string) || siteUrl || (meta.cloudId as string) || "unknown site";

  const fieldMap = await getJiraFieldMap(workspaceId);
  const extraFields = [fieldMap.sprint, fieldMap.storyPoints, fieldMap.epicLink].filter((x): x is string => !!x);
  const issues = await searchIssues(workspaceId, jql, maxPages, extraFields);
  // Unconditional breadcrumb — shows the exact query + site + count even on a
  // 200-but-empty result (the case that produces no error and no other signal).
  console.log(`[jira-sync] ${workspaceId} site="${site}" jql="${jql}" → ${issues.length} issues`);
  let created = 0;
  let updated = 0;
  const projectKeys = new Set<string>();
  const entities = new Map<string, EntityInput>();

  for (const issue of issues) {
    const key = issue.fields.project?.key ?? issue.key.split("-")[0];
    if (key) projectKeys.add(key);
    try {
      const r = await upsertIssueTask(workspaceId, userId, siteUrl, issue, fieldMap);
      if (r === "created") created++;
      else updated++;
      // Feed the cross-platform Signal store (idempotent) so Jira lights up the
      // same flow metrics / status report / scope integrity as GitHub.
      await recordSignals(workspaceId, jiraBackfillSignals(issue)).catch(() => {});
      // Collect the container entities embedded in this issue (dedupe by id).
      for (const e of jiraEntitiesFromIssue(issue, fieldMap, siteUrl)) {
        if (!entities.has(e.externalId)) entities.set(e.externalId, e);
      }
    } catch {
      // skip individual failures
    }
  }

  if (entities.size) await recordEntities(workspaceId, [...entities.values()]).catch(() => {});

  return { created, updated, projectKeys: [...projectKeys], found: issues.length, jql, site };
}

export interface JiraSyncOutcome {
  created: number;
  updated: number;
  projectKeys: string[];
  found: number;
  jql: string;
  site: string;
}

/**
 * Run a full Jira sync INLINE (no Inngest) — writes Tasks + Signals + Entities
 * and updates the persistent sync status. Used by the connect/resync HTTP routes
 * so data lands (and the real outcome is returned) even when the Inngest runtime
 * isn't processing background events. The Inngest job still runs in parallel for
 * webhook registration + out-of-scope pruning when the runtime IS healthy.
 */
export async function performJiraSync(
  workspaceId: string,
  userId: string,
  maxPages = 10,
): Promise<JiraSyncOutcome> {
  await redis.set(`jira-sync:${workspaceId}`, "syncing", { ex: 600 }).catch(() => {});
  try {
    const jql = await scopedJql(workspaceId);
    const result = await syncJiraIssues(workspaceId, userId, jql, maxPages);
    await redis
      .set(`jira-sync:${workspaceId}`, JSON.stringify({ status: "done", at: new Date().toISOString(), ...result }), { ex: 300 })
      .catch(() => {});
    await publishWorkspaceEvent(workspaceId, { type: "task.created", taskId: "jira-sync" }).catch(() => {});
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jira sync failed";
    console.error(`[jira-sync] inline sync failed for ${workspaceId}:`, message);
    await redis
      .set(
        `jira-sync:${workspaceId}`,
        JSON.stringify({ status: "error", message: message.slice(0, 300), at: new Date().toISOString() }),
        { ex: 600 },
      )
      .catch(() => {});
    throw err;
  }
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

    // Persistent sync status (survives reloads) — the dashboard shows a full-screen
    // loader until this clears. Mirrors GitHub + calendar.
    await step.run("mark-syncing", async () => {
      await redis.set(`jira-sync:${workspaceId}`, "syncing", { ex: 600 }).catch(() => {});
    });

    const result = await step.run("sync-issues", async () => {
      try {
        // Full backfill (no date bound) so a project's issues appear regardless
        // of age; deeper page cap (1000 issues) for the one-time initial pull.
        return await syncJiraIssues(workspaceId, userId, await scopedJql(workspaceId), 10);
      } catch (err) {
        // Surface the real reason instead of swallowing it into a blank dashboard.
        const message = err instanceof Error ? err.message : "Jira sync failed";
        console.error(`[jira-initial-sync] ${workspaceId} failed:`, message);
        await redis
          .set(
            `jira-sync:${workspaceId}`,
            JSON.stringify({ status: "error", message: message.slice(0, 300), at: new Date().toISOString() }),
            { ex: 600 },
          )
          .catch(() => {});
        throw err; // let Inngest record the failure + retry; the error status persists meanwhile
      }
    });

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

    // Prune JIRA tasks/signals for projects no longer in scope (self-healing when
    // the selection narrows).
    await step.run("prune-out-of-scope", async () => {
      const integration = await db.integration.findFirst({
        where: { workspaceId, provider: "JIRA", isActive: true },
        select: { metadata: true },
      });
      const scope = ((integration?.metadata ?? {}) as Record<string, unknown>).scope as { projects?: string[] } | undefined;
      if (!scope?.projects?.length) return { pruned: 0 };
      const allowed = new Set(scope.projects);
      const jiraTasks = await db.task.findMany({
        where: { workspaceId, source: { has: "JIRA" } },
        select: { id: true, externalId: true, metadata: true },
      });
      const stale = jiraTasks.filter((t) => {
        const pk = ((t.metadata as Record<string, unknown>)?.jira as Record<string, unknown> | undefined)?.projectKey as
          | string
          | undefined;
        return pk ? !allowed.has(pk) : false;
      });
      if (stale.length) {
        await db.task.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
        const keys = stale.map((t) => t.externalId).filter((k): k is string => !!k);
        if (keys.length) await db.signal.deleteMany({ where: { workspaceId, provider: "JIRA", entityKey: { in: keys } } });
      }
      return { pruned: stale.length };
    });

    await step.run("mark-done", async () => {
      await redis
        .set(`jira-sync:${workspaceId}`, JSON.stringify({ status: "done", at: new Date().toISOString(), ...result }), { ex: 300 })
        .catch(() => {});
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
          return await syncJiraIssues(workspaceId, userId, await scopedJql(workspaceId, "updated >= -2d"));
        } catch (err) {
          console.error(`[jira-poll] ${workspaceId} failed`, err);
          return { created: 0, updated: 0, projectKeys: [], found: 0, jql: "", site: "" };
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

      // Record the lifecycle Signal (created/updated/done/deleted) for cross-platform metrics.
      await recordSignals(workspaceId, jiraWebhookSignals(payload.webhookEvent, issue)).catch(() => {});

      if (payload.webhookEvent === "jira:issue_deleted") {
        await db.task.deleteMany({ where: { externalId, workspaceId } });
        await db.signal.deleteMany({ where: { workspaceId, provider: "JIRA", entityKey: externalId } }).catch(() => {});
        await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: externalId });
        return;
      }

      const integration = await db.integration.findFirst({
        where: { workspaceId, provider: "JIRA", isActive: true },
        select: { metadata: true },
      });
      const siteUrl = ((integration?.metadata ?? {}) as Record<string, unknown>).siteUrl as string ?? "";
      const fieldMap = await getJiraFieldMap(workspaceId);
      await upsertIssueTask(workspaceId, userId, siteUrl, issue, fieldMap);
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
      await db.signal.deleteMany({ where: { workspaceId, provider: "JIRA" } });
      await db.entity.deleteMany({ where: { workspaceId, provider: "JIRA" } });
      await redis.del(`jira-sync:${workspaceId}`).catch(() => {});
    });

    await publishWorkspaceEvent(workspaceId, { type: "task.updated", taskId: "jira-sync" });
    return { ok: true };
  },
);
