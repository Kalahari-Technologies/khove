import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import {
  createOAuth2Client,
  syncGoogleCalendar,
  isActionableEvent,
  upsertTaskFromEvent,
  upsertCalendarEntry,
  registerWebhook,
  stopWebhook,
} from "@/lib/integrations/google-calendar";
import { google } from "googleapis";
import { publishEvent, publishWorkspaceEvent } from "@/lib/realtime";
import { Redis } from "@upstash/redis";

function getSyncRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

// ---------------------------------------------------------------------------
// Initial sync — background job dispatched from OAuth callback
// ---------------------------------------------------------------------------

export const initialCalendarSync = inngest.createFunction(
  {
    id: "google-calendar-initial-sync",
    concurrency: { limit: 1, key: "event.data.workspaceId" },
    triggers: [{ event: "google-calendar/initial-sync" }],
  },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string };

    // Mark as syncing in Redis (5 min TTL as safety)
    await step.run("set-syncing", async () => {
      const redis = getSyncRedis();
      await redis.set(`cal-sync:${workspaceId}`, "syncing", { ex: 300 });
    });

    const result = await step.run("sync-events", async () => {
      return syncGoogleCalendar(workspaceId);
    });

    // Mark sync as done in Redis (60s TTL — page can read it)
    await step.run("set-done", async () => {
      const redis = getSyncRedis();
      await redis.set(`cal-sync:${workspaceId}`, JSON.stringify({
        status: "done",
        tasksCreated: result.tasksCreated,
        tasksUpdated: result.tasksUpdated,
        entriesCreated: result.entriesCreated,
      }), { ex: 60 });
    });

    // Register webhook for real-time push notifications (production only)
    await step.run("register-webhook", async () => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl || appUrl.includes("localhost")) return { skipped: true, reason: "local dev" };

      try {
        const webhookUrl = `${appUrl}/api/webhooks/google-calendar`;
        const { channelId, resourceId, expiration } = await registerWebhook(workspaceId, webhookUrl);

        // Store webhook channel info in integration metadata for renewal/cleanup
        const integration = await db.integration.findFirst({
          where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
        });
        if (integration) {
          const meta = (integration.metadata ?? {}) as Record<string, unknown>;
          await db.integration.update({
            where: { id: integration.id },
            data: {
              metadata: {
                ...meta,
                webhookChannelId: channelId,
                webhookResourceId: resourceId,
                webhookExpiration: expiration,
              },
            },
          });
        }
        return { channelId, expiration };
      } catch (err) {
        // Non-fatal — sync still works, just no real-time push
        console.error("[Calendar webhook] Registration failed:", err);
        return { skipped: true, reason: String(err) };
      }
    });

    // Notify all workspace members via SSE → triggers router.refresh()
    await publishWorkspaceEvent(workspaceId, {
      type: "calendar.synced",
      tasksCreated: result.tasksCreated,
      tasksUpdated: result.tasksUpdated,
      entriesCreated: result.entriesCreated,
    });

    return result;
  },
);

// ---------------------------------------------------------------------------
// Webhook channel renewal — daily cron (channels expire after 7 days)
// ---------------------------------------------------------------------------

export const renewCalendarWebhooks = inngest.createFunction(
  {
    id: "google-calendar-renew-webhooks",
    triggers: [{ cron: "0 9 * * *" }], // Daily at 9am
  },
  async ({ step }) => {
    // Find integrations with webhook channels expiring within 24 hours
    const integrations = await step.run("find-expiring-channels", async () => {
      const all = await db.integration.findMany({
        where: { provider: "GOOGLE_CALENDAR", isActive: true },
      });

      const threshold = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
      return all.filter((i) => {
        const meta = (i.metadata ?? {}) as Record<string, unknown>;
        const exp = meta.webhookExpiration;
        if (!exp) return false;
        return Number(exp) < threshold;
      });
    });

    let renewed = 0;

    for (const integration of integrations) {
      await step.run(`renew-${integration.id}`, async () => {
        const meta = (integration.metadata ?? {}) as Record<string, unknown>;
        const oldChannelId = meta.webhookChannelId as string | undefined;
        const oldResourceId = meta.webhookResourceId as string | undefined;

        // Stop old channel
        if (oldChannelId && oldResourceId) {
          try {
            await stopWebhook(integration.workspaceId, oldChannelId, oldResourceId);
          } catch {
            // Old channel may already be expired — continue
          }
        }

        // Register new channel
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (!appUrl || appUrl.includes("localhost")) return;

        try {
          const webhookUrl = `${appUrl}/api/webhooks/google-calendar`;
          const { channelId, resourceId, expiration } = await registerWebhook(
            integration.workspaceId,
            webhookUrl,
          );

          await db.integration.update({
            where: { id: integration.id },
            data: {
              metadata: {
                ...meta,
                webhookChannelId: channelId,
                webhookResourceId: resourceId,
                webhookExpiration: expiration,
              },
            },
          });

          renewed++;
        } catch (err) {
          console.error(`[Calendar webhook] Renewal failed for ${integration.id}:`, err);
        }
      });
    }

    return { found: integrations.length, renewed };
  },
);

// ---------------------------------------------------------------------------
// Webhook handler — incremental sync
// ---------------------------------------------------------------------------

export const handleCalendarWebhook = inngest.createFunction(
  {
    id: "google-calendar-webhook",
    concurrency: { limit: 1, key: "event.data.workspaceId" },
    triggers: [{ event: "google-calendar/webhook.received" }],
  },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { userId: string; workspaceId: string; channelId: string; resourceId: string };

    const integration = await step.run("load-integration", async () => {
      return db.integration.findFirst({
        where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
      });
    });

    if (!integration) return { skipped: true, reason: "no active integration" };

    await step.run("sync-changes", async () => {
      const oauth2 = createOAuth2Client();
      const accessToken = decrypt(integration.accessTokenEnc);
      const refreshToken = integration.refreshTokenEnc
        ? decrypt(integration.refreshTokenEnc)
        : undefined;

      oauth2.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: integration.tokenExpiresAt
          ? new Date(integration.tokenExpiresAt).getTime()
          : undefined,
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2 });
      const metadata = integration.metadata as Record<string, unknown>;
      const calendarId = (metadata?.calendarId as string) ?? "primary";
      const syncToken = metadata?.syncToken as string | undefined;

      const params: Record<string, unknown> = {
        calendarId,
        singleEvents: true,
        maxResults: 50,
      };
      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        params.timeMin = new Date().toISOString();
      }

      try {
        const res = await calendar.events.list(params as never);

        let tasksUpserted = 0;
        let entriesUpserted = 0;
        for (const ev of res.data.items ?? []) {
          if (isActionableEvent(ev)) {
            await upsertTaskFromEvent(workspaceId, ev, calendarId);
            tasksUpserted++;
          } else {
            await upsertCalendarEntry(workspaceId, ev);
            entriesUpserted++;
          }
        }

        if (res.data.nextSyncToken) {
          await db.integration.update({
            where: { id: integration.id },
            data: {
              metadata: { ...metadata, syncToken: res.data.nextSyncToken },
            },
          });
        }

        if (tasksUpserted > 0 || entriesUpserted > 0) {
          await publishWorkspaceEvent(workspaceId, {
            type: "calendar.synced",
            tasksCreated: tasksUpserted,
            tasksUpdated: 0,
            entriesCreated: entriesUpserted,
          });
        }

        return { eventsProcessed: res.data.items?.length ?? 0, tasksUpserted, entriesUpserted };
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 410) {
          await db.integration.update({
            where: { id: integration.id },
            data: { metadata: { ...metadata, syncToken: undefined } },
          });
          return { eventsProcessed: 0, syncTokenCleared: true };
        }
        throw err;
      }
    });
  },
);

// ---------------------------------------------------------------------------
// Token refresh — cron job
// ---------------------------------------------------------------------------

export const refreshExpiringTokens = inngest.createFunction(
  {
    id: "google-calendar-refresh-tokens",
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    const threshold = new Date(Date.now() + 10 * 60 * 1000);

    const expiring = await step.run("find-expiring", async () => {
      return db.integration.findMany({
        where: {
          provider: "GOOGLE_CALENDAR",
          isActive: true,
          tokenExpiresAt: { lt: threshold },
        },
      });
    });

    let refreshed = 0;

    for (const integration of expiring) {
      await step.run(`refresh-${integration.id}`, async () => {
        const oauth2 = createOAuth2Client();
        const accessToken = decrypt(integration.accessTokenEnc);
        const refreshToken = integration.refreshTokenEnc
          ? decrypt(integration.refreshTokenEnc)
          : null;

        if (!refreshToken) return;

        oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

        const { credentials } = await oauth2.refreshAccessToken();

        const data: Record<string, unknown> = {};
        if (credentials.access_token) data.accessTokenEnc = encrypt(credentials.access_token);
        if (credentials.refresh_token) data.refreshTokenEnc = encrypt(credentials.refresh_token);
        if (credentials.expiry_date) data.tokenExpiresAt = new Date(credentials.expiry_date);

        if (Object.keys(data).length > 0) {
          await db.integration.update({ where: { id: integration.id }, data });
        }
        refreshed++;
      });
    }

    return { found: expiring.length, refreshed };
  },
);

// ---------------------------------------------------------------------------
// Disconnect cleanup
// ---------------------------------------------------------------------------

export const disconnectCalendarCleanup = inngest.createFunction(
  {
    id: "google-calendar-disconnect-cleanup",
    triggers: [{ event: "google-calendar/disconnected" }],
  },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string };

    // Stop webhook channel before deleting data
    await step.run("stop-webhook", async () => {
      const integration = await db.integration.findFirst({
        where: { workspaceId, provider: "GOOGLE_CALENDAR" },
      });
      if (!integration) return;

      const meta = (integration.metadata ?? {}) as Record<string, unknown>;
      const channelId = meta.webhookChannelId as string | undefined;
      const resourceId = meta.webhookResourceId as string | undefined;

      if (channelId && resourceId) {
        try {
          await stopWebhook(workspaceId, channelId, resourceId);
        } catch {
          // Channel may already be expired
        }
      }
    });

    const deletedTasks = await step.run("delete-tasks", async () => {
      return db.task.deleteMany({
        where: { workspaceId, source: { has: "GOOGLE_CALENDAR" } },
      });
    });

    const deletedEntries = await step.run("delete-entries", async () => {
      return db.calendarEntry.deleteMany({
        where: { workspaceId, source: "GOOGLE_CALENDAR" },
      });
    });

    await publishEvent(userId, { type: "calendar.disconnected" });

    return { deletedTasks: deletedTasks.count, deletedEntries: deletedEntries.count };
  },
);
