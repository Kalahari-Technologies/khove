import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import {
  createOAuth2Client,
  syncGoogleCalendar,
  isActionableEvent,
  upsertTaskFromEvent,
  upsertCalendarEntry,
} from "@/lib/integrations/google-calendar";
import { google } from "googleapis";
import { publishEvent } from "@/lib/realtime";

// ---------------------------------------------------------------------------
// Initial sync — background job dispatched from OAuth callback
// ---------------------------------------------------------------------------

/**
 * Runs the full Google Calendar → Khove sync in the background.
 * Publishes a real-time event when done so the UI refreshes automatically.
 */
export const initialCalendarSync = inngest.createFunction(
  {
    id: "google-calendar-initial-sync",
    concurrency: { limit: 1, key: "event.data.userId" },
    triggers: [{ event: "google-calendar/initial-sync" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    const result = await step.run("sync-events", async () => {
      return syncGoogleCalendar(userId);
    });

    // Push real-time event → SSE → client calls router.refresh()
    await publishEvent(userId, {
      type: "calendar.synced",
      tasksCreated: result.tasksCreated,
      tasksUpdated: result.tasksUpdated,
      entriesCreated: result.entriesCreated,
    });

    return result;
  },
);

// ---------------------------------------------------------------------------
// Webhook handler — incremental sync
// ---------------------------------------------------------------------------

/**
 * Handle Google Calendar push notification.
 * Dispatched by the webhook route — NEVER processed synchronously.
 * Fetches incremental changes via syncToken and stores updated token in metadata.
 */
export const handleCalendarWebhook = inngest.createFunction(
  {
    id: "google-calendar-webhook",
    concurrency: { limit: 1, key: "event.data.userId" },
    triggers: [{ event: "google-calendar/webhook.received" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string; channelId: string; resourceId: string };

    const integration = await step.run("load-integration", async () => {
      return db.integration.findFirst({
        where: { userId, provider: "GOOGLE_CALENDAR", isActive: true },
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

        // Upsert each changed event as task or calendar entry
        let tasksUpserted = 0;
        let entriesUpserted = 0;
        for (const ev of res.data.items ?? []) {
          if (isActionableEvent(ev)) {
            await upsertTaskFromEvent(userId, ev, calendarId);
            tasksUpserted++;
          } else {
            await upsertCalendarEntry(userId, ev);
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

        // Notify client UI to refresh
        if (tasksUpserted > 0 || entriesUpserted > 0) {
          await publishEvent(userId, {
            type: "calendar.synced",
            tasksCreated: tasksUpserted,
            tasksUpdated: 0,
            entriesCreated: entriesUpserted,
          });
        }

        return {
          eventsProcessed: res.data.items?.length ?? 0,
          tasksUpserted,
          entriesUpserted,
          newSyncToken: !!res.data.nextSyncToken,
        };
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 410) {
          await db.integration.update({
            where: { id: integration.id },
            data: {
              metadata: { ...metadata, syncToken: undefined },
            },
          });
          return { eventsProcessed: 0, syncTokenCleared: true };
        }
        throw err;
      }
    });
  },
);

/**
 * Periodic token refresh for integrations nearing expiry.
 * Runs every 30 minutes via Inngest cron.
 */
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

        oauth2.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        const { credentials } = await oauth2.refreshAccessToken();

        const data: Record<string, unknown> = {};
        if (credentials.access_token) {
          data.accessTokenEnc = encrypt(credentials.access_token);
        }
        if (credentials.refresh_token) {
          data.refreshTokenEnc = encrypt(credentials.refresh_token);
        }
        if (credentials.expiry_date) {
          data.tokenExpiresAt = new Date(credentials.expiry_date);
        }

        if (Object.keys(data).length > 0) {
          await db.integration.update({
            where: { id: integration.id },
            data,
          });
        }

        refreshed++;
      });
    }

    return { found: expiring.length, refreshed };
  },
);

// ---------------------------------------------------------------------------
// Disconnect cleanup — delete synced tasks + entries in background
// ---------------------------------------------------------------------------

/**
 * Fired when a user disconnects Google Calendar.
 * Deletes all GOOGLE_CALENDAR tasks and calendar entries, then notifies the UI.
 */
export const disconnectCalendarCleanup = inngest.createFunction(
  {
    id: "google-calendar-disconnect-cleanup",
    triggers: [{ event: "google-calendar/disconnected" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    const deletedTasks = await step.run("delete-tasks", async () => {
      return db.task.deleteMany({
        where: { userId, source: { has: "GOOGLE_CALENDAR" } },
      });
    });

    const deletedEntries = await step.run("delete-entries", async () => {
      return db.calendarEntry.deleteMany({
        where: { userId, source: "GOOGLE_CALENDAR" },
      });
    });

    await publishEvent(userId, { type: "calendar.disconnected" });

    return {
      deletedTasks: deletedTasks.count,
      deletedEntries: deletedEntries.count,
    };
  },
);
