import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { Task } from "@prisma/client";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

// ---------------------------------------------------------------------------
// OAuth2 client factory
// ---------------------------------------------------------------------------

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

/** Bare OAuth2 client (no user tokens) — used by connect / callback routes. */
export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/** Scopes requested during OAuth consent. */
export { SCOPES as GOOGLE_CALENDAR_SCOPES };

// ---------------------------------------------------------------------------
// Authenticated Calendar client
// ---------------------------------------------------------------------------

/**
 * Build a Calendar API client for a specific user.
 * Decrypts tokens from the Integration record, sets them on a fresh OAuth2Client,
 * and attaches a token-refresh listener that re-encrypts and persists new tokens.
 * Throws if no active GOOGLE_CALENDAR integration exists.
 */
export async function getCalendarClient(
  workspaceId: string,
): Promise<{ calendar: calendar_v3.Calendar; calendarId: string; integration: { id: string; userId: string } }> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
  });
  if (!integration) {
    throw new Error("Google Calendar is not connected. Please connect it first.");
  }

  const oauth2 = createOAuth2Client();

  const accessToken = decrypt(integration.accessTokenEnc);
  const refreshToken = integration.refreshTokenEnc
    ? decrypt(integration.refreshTokenEnc)
    : undefined;

  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: integration.tokenExpiresAt?.getTime() ?? undefined,
  });

  // Re-encrypt and persist whenever the library auto-refreshes
  oauth2.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) {
      data.accessTokenEnc = encrypt(tokens.access_token);
    }
    if (tokens.refresh_token) {
      data.refreshTokenEnc = encrypt(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      data.tokenExpiresAt = new Date(tokens.expiry_date);
    }
    if (Object.keys(data).length > 0) {
      await db.integration.update({ where: { id: integration.id }, data }).catch(() => {});
    }
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const calendarId =
    (integration.metadata as Record<string, unknown>)?.calendarId as string | undefined ??
    "primary";

  return { calendar, calendarId, integration: { id: integration.id, userId: integration.userId } };
}

// ---------------------------------------------------------------------------
// High-level helpers
// ---------------------------------------------------------------------------

/** List upcoming events from the workspace's connected calendar (primary only). */
export async function listUpcomingEvents(
  workspaceId: string,
  opts?: { timeMin?: string; timeMax?: string; maxResults?: number },
): Promise<calendar_v3.Schema$Event[]> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);

  const now = new Date().toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin: opts?.timeMin ?? now,
    timeMax: opts?.timeMax ?? undefined,
    maxResults: opts?.maxResults ?? 25,
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items ?? [];
}

/** Fetch events from ALL user calendars (primary, holidays, birthdays, subscribed). */
export async function listAllCalendarEvents(
  workspaceId: string,
  opts?: { timeMin?: string; timeMax?: string; maxResults?: number },
): Promise<Array<calendar_v3.Schema$Event & { _calendarId: string; _calendarSummary: string; _isHolidayOrBirthday: boolean }>> {
  const { calendar } = await getCalendarClient(workspaceId);

  const now = new Date().toISOString();
  const timeMin = opts?.timeMin ?? now;
  const timeMax = opts?.timeMax ?? undefined;
  const maxPerCalendar = opts?.maxResults ?? 50;

  // Get all calendars the user has access to
  const calListRes = await calendar.calendarList.list();
  const calendars = calListRes.data.items ?? [];

  const allEvents: Array<calendar_v3.Schema$Event & { _calendarId: string; _calendarSummary: string; _isHolidayOrBirthday: boolean }> = [];

  for (const cal of calendars) {
    if (!cal.id) continue;

    // Identify non-actionable calendar types
    const isHolidayOrBirthday =
      cal.accessRole === "reader" || // subscribed calendars (holidays, sports, etc.)
      cal.id.includes("#holiday@") ||
      cal.id.includes("#contacts@") ||
      cal.id.includes("addressbook#") ||
      (cal.summary?.toLowerCase().includes("holiday") ?? false) ||
      (cal.summary?.toLowerCase().includes("birthday") ?? false);

    try {
      const res = await calendar.events.list({
        calendarId: cal.id,
        timeMin,
        timeMax,
        maxResults: maxPerCalendar,
        singleEvents: true,
        orderBy: "startTime",
      });

      for (const event of res.data.items ?? []) {
        allEvents.push({
          ...event,
          _calendarId: cal.id,
          _calendarSummary: cal.summary ?? cal.id,
          _isHolidayOrBirthday: isHolidayOrBirthday,
        });
      }
    } catch {
      // Skip calendars that fail (permissions, etc.)
    }
  }

  return allEvents;
}

/** Create a calendar event and return it. */
export async function createEvent(
  workspaceId: string,
  event: {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    attendees?: string[];
    location?: string;
  },
): Promise<calendar_v3.Schema$Event> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startDateTime },
      end: { dateTime: event.endDateTime },
      attendees: event.attendees?.map((email) => ({ email })),
    },
  });

  return res.data;
}

/** Check free/busy availability for a time range. */
export async function checkAvailability(
  workspaceId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ busy: Array<{ start: string; end: string }> }> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });

  const busySlots =
    res.data.calendars?.[calendarId]?.busy?.map((b) => ({
      start: b.start ?? timeMin,
      end: b.end ?? timeMax,
    })) ?? [];

  return { busy: busySlots };
}

// ---------------------------------------------------------------------------
// Webhook management (production only — requires public HTTPS)
// ---------------------------------------------------------------------------

/** Register a push notification channel for calendar changes. */
export async function registerWebhook(
  workspaceId: string,
  webhookUrl: string,
): Promise<{ channelId: string; resourceId: string; expiration: string }> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);
  const channelId = `khove-cal-${workspaceId}-${Date.now()}`;

  const res = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: webhookUrl,
    },
  });

  return {
    channelId: res.data.id!,
    resourceId: res.data.resourceId!,
    expiration: res.data.expiration!,
  };
}

/** Stop a push notification channel. */
export async function stopWebhook(
  workspaceId: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  const { calendar } = await getCalendarClient(workspaceId);

  await calendar.channels.stop({
    requestBody: { id: channelId, resourceId },
  });
}

// ---------------------------------------------------------------------------
// Event classification
// ---------------------------------------------------------------------------

/**
 * Actionable events (meetings, calls, appointments) → become Tasks.
 * External events (holidays, birthdays, OOO, focus time) → CalendarEntry display only.
 *
 * An event is actionable if:
 * 1. It's from the user's primary/writable calendar (not a holiday/birthday subscription)
 * 2. Its eventType is "default" (not "birthday", "focusTime", "outOfOffice", "workingLocation")
 */
export function isActionableEvent(
  event: calendar_v3.Schema$Event & { _isHolidayOrBirthday?: boolean },
): boolean {
  // Events from holiday/birthday/subscribed calendars are never actionable
  if (event._isHolidayOrBirthday) return false;

  // Non-default event types are never actionable
  const eventType = event.eventType ?? "default";
  if (eventType !== "default") return false;

  return true;
}

// ---------------------------------------------------------------------------
// Sync: Google → Khove
// ---------------------------------------------------------------------------

/** Build metadata JSON for a Google Calendar task. */
function buildEventMetadata(
  event: calendar_v3.Schema$Event,
  calendarId: string,
) {
  return {
    calendarId,
    endDateTime: event.end?.dateTime ?? event.end?.date ?? null,
    location: event.location ?? null,
    attendees: (event.attendees?.map((a) => a.email).filter((e): e is string => !!e)) ?? [],
    eventStatus: event.status ?? "confirmed",
    isAllDay: !event.start?.dateTime,
    eventType: event.eventType ?? "default",
  };
}

/**
 * Upsert a single actionable Google Calendar event as a Khove Task.
 * Returns "created" | "updated" | "cancelled" | "skipped".
 */
export async function upsertTaskFromEvent(
  workspaceId: string,
  event: calendar_v3.Schema$Event,
  calendarId: string,
): Promise<"created" | "updated" | "cancelled" | "skipped"> {
  if (!event.id) return "skipped";

  const existing = await db.task.findFirst({
    where: { workspaceId, source: { has: "GOOGLE_CALENDAR" }, externalId: event.id },
  });

  // Cancelled event → mark task as cancelled if it exists
  if (event.status === "cancelled") {
    if (existing) {
      const cancelledStatus = await db.workflowStatus.findFirst({
        where: { category: "CANCELLED", workspaceId },
      }) ?? await db.workflowStatus.findFirst({
        where: { category: "CANCELLED", workspaceId: null },
      });
      await db.task.update({
        where: { id: existing.id },
        data: { statusId: cancelledStatus?.id ?? null },
      });
      return "cancelled";
    }
    return "skipped";
  }

  const title = event.summary ?? "(No title)";
  const dueDate = event.start?.dateTime
    ? new Date(event.start.dateTime)
    : event.start?.date
      ? new Date(event.start.date)
      : null;
  const metadata = buildEventMetadata(event, calendarId);

  if (existing) {
    await db.task.update({
      where: { id: existing.id },
      data: {
        title,
        description: event.description ?? existing.description,
        dueDate,
        externalUrl: event.htmlLink ?? existing.externalUrl,
        metadata,
      },
    });
    return "updated";
  }

  // Get userId from the integration that owns this workspace connection
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
    select: { userId: true },
  });

  const defaultStatus =
    await db.workflowStatus.findFirst({
      where: { category: "NOT_STARTED", workspaceId, isDefault: true },
    }) ??
    await db.workflowStatus.findFirst({
      where: { category: "NOT_STARTED", workspaceId: null, isDefault: true },
    });

  await db.task.create({
    data: {
      title,
      source: ["GOOGLE_CALENDAR"],
      externalId: event.id,
      externalUrl: event.htmlLink ?? null,
      description: event.description ?? null,
      dueDate,
      priority: "MEDIUM",
      statusId: defaultStatus?.id ?? null,
      userId: integration?.userId ?? "",
      workspaceId,
      metadata,
    },
  });
  return "created";
}

/**
 * Upsert a single external/inconsequential event as a CalendarEntry.
 * Returns "created" | "updated" | "deleted" | "skipped".
 */
export async function upsertCalendarEntry(
  workspaceId: string,
  event: calendar_v3.Schema$Event,
): Promise<"created" | "updated" | "deleted" | "skipped"> {
  if (!event.id) return "skipped";

  const existing = await db.calendarEntry.findUnique({
    where: { workspaceId_externalId: { workspaceId, externalId: event.id } },
  });

  // Cancelled → delete if exists
  if (event.status === "cancelled") {
    if (existing) {
      await db.calendarEntry.delete({ where: { id: existing.id } });
      return "deleted";
    }
    return "skipped";
  }

  const title = event.summary ?? "(No title)";
  const startDate = event.start?.dateTime
    ? new Date(event.start.dateTime)
    : event.start?.date
      ? new Date(event.start.date)
      : null;
  if (!startDate) return "skipped";

  const endDate = event.end?.dateTime
    ? new Date(event.end.dateTime)
    : event.end?.date
      ? new Date(event.end.date)
      : null;
  const isAllDay = !event.start?.dateTime;

  // Get userId from the integration that owns this workspace connection
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
    select: { userId: true },
  });

  if (existing) {
    await db.calendarEntry.update({
      where: { id: existing.id },
      data: { title, startDate, endDate, isAllDay },
    });
    return "updated";
  }

  await db.calendarEntry.create({
    data: {
      userId: integration?.userId ?? "",
      workspaceId,
      title,
      startDate,
      endDate,
      isAllDay,
      externalId: event.id,
      source: "GOOGLE_CALENDAR",
      metadata: {
        eventType: event.eventType ?? "default",
        location: event.location ?? null,
      },
    },
  });
  return "created";
}

/**
 * Full sync: fetch upcoming Google Calendar events, classify and persist.
 * Called on OAuth connect (initial sync) and can be called for manual re-sync.
 */
export async function syncGoogleCalendar(
  workspaceId: string,
  opts?: { timeMin?: string; timeMax?: string },
): Promise<{ tasksCreated: number; tasksUpdated: number; entriesCreated: number }> {
  // Fetch 3 months of events from ALL calendars (primary, holidays, birthdays, subscribed)
  const now = new Date();
  const timeMin = opts?.timeMin ?? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = opts?.timeMax ?? new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  const events = await listAllCalendarEvents(workspaceId, { timeMin, timeMax, maxResults: 100 });

  let tasksCreated = 0;
  let tasksUpdated = 0;
  let entriesCreated = 0;

  for (const event of events) {
    if (isActionableEvent(event)) {
      const result = await upsertTaskFromEvent(workspaceId, event, event._calendarId);
      if (result === "created") tasksCreated++;
      if (result === "updated") tasksUpdated++;
    } else {
      const result = await upsertCalendarEntry(workspaceId, event);
      if (result === "created") entriesCreated++;
    }
  }

  return { tasksCreated, tasksUpdated, entriesCreated };
}

// ---------------------------------------------------------------------------
// Sync: Khove → Google Calendar
// ---------------------------------------------------------------------------

/**
 * Push a Khove task to Google Calendar.
 * Creates a new event if no externalId, updates existing event if externalId is set.
 * Returns the Google event ID.
 */
export interface GCalPushResult {
  eventId: string;
  meetLink?: string;
  calendarId: string;
  location?: string;
  attendees: string[];
  endDateTime: string;
}

export async function pushTaskToGoogleCalendar(
  workspaceId: string,
  task: Task,
  gcalOpts?: {
    agenda?: string;
    location?: string;
    guests?: string[];
    startDateTime?: string;
    endDateTime?: string;
    generateMeetLink?: boolean;
  },
): Promise<GCalPushResult | null> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);

  const existingMeta = (task.metadata ?? {}) as Record<string, unknown>;
  const gcalMeta = (existingMeta.googleCalendar ?? {}) as Record<string, unknown>;

  // Start time: gcalOpts override > task.dueDate
  const startDateTime = gcalOpts?.startDateTime ?? task.dueDate?.toISOString();
  if (!startDateTime) return null;

  // End time: gcalOpts override > stored metadata > start + 1hr
  const defaultEnd = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();
  const endDateTime = gcalOpts?.endDateTime ?? (gcalMeta.endDateTime as string) ?? defaultEnd;

  // Location + attendees: gcalOpts override > stored metadata
  const location = gcalOpts?.location ?? (gcalMeta.location as string) ?? undefined;
  const attendees = gcalOpts?.guests ?? (gcalMeta.attendees as string[]) ?? [];

  // Description: gcalOpts agenda > task description
  const description = gcalOpts?.agenda ?? task.description ?? undefined;

  const requestBody: calendar_v3.Schema$Event = {
    summary: task.title,
    description,
    location,
    start: { dateTime: startDateTime },
    end: { dateTime: endDateTime },
    attendees: attendees.length > 0 ? attendees.map((email) => ({ email })) : undefined,
  };

  // Google Meet link generation
  if (gcalOpts?.generateMeetLink) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `khove-meet-${task.id}-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const confVersion = gcalOpts?.generateMeetLink ? 1 : undefined;

  let eventData: calendar_v3.Schema$Event;
  if (task.externalId) {
    const res = await calendar.events.update({
      calendarId,
      eventId: task.externalId,
      requestBody,
      conferenceDataVersion: confVersion,
    });
    eventData = res.data;
  } else {
    const res = await calendar.events.insert({
      calendarId,
      requestBody,
      conferenceDataVersion: confVersion,
    });
    eventData = res.data;
  }

  const meetLink = eventData.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  )?.uri ?? undefined;

  return {
    eventId: eventData.id!,
    meetLink,
    calendarId,
    location: location ?? undefined,
    attendees,
    endDateTime,
  };
}

/**
 * Delete a Google Calendar event by its external ID.
 */
export async function deleteGoogleCalendarEvent(
  workspaceId: string,
  externalId: string,
): Promise<void> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);
  await calendar.events.delete({ calendarId, eventId: externalId });
}
