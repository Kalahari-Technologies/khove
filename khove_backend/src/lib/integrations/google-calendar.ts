import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { Task, Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";
import { encrypt, decrypt } from "@backend/lib/encryption";
import { classifyEvent, shouldBecomeTask } from "@backend/lib/calendar/classify";

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

/**
 * True when an error is a fatal OAuth failure (revoked/expired refresh token).
 * These are permanent — retrying is pointless; the integration must be marked
 * inactive and the user prompted to reconnect (stops the invalid_grant storm).
 */
export function isAuthError(err: unknown): boolean {
  const e = err as { message?: string; code?: string | number; response?: { data?: { error?: string } } };
  const msg = String(e?.message ?? err ?? "");
  const code = e?.response?.data?.error ?? e?.code;
  return (
    msg.includes("invalid_grant") ||
    msg.includes("invalid_token") ||
    code === "invalid_grant" ||
    code === "invalid_token"
  );
}

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
): Promise<Array<calendar_v3.Schema$Event & { _calendarId: string; _calendarSummary: string; _isHolidayOrBirthday: boolean; _calendarColor: string | null }>> {
  const { calendar } = await getCalendarClient(workspaceId);

  const now = new Date().toISOString();
  const timeMin = opts?.timeMin ?? now;
  const timeMax = opts?.timeMax ?? undefined;
  const maxPerCalendar = opts?.maxResults ?? 50;

  // Get all calendars the user has access to
  const calListRes = await calendar.calendarList.list();
  const calendars = calListRes.data.items ?? [];

  const allEvents: Array<calendar_v3.Schema$Event & { _calendarId: string; _calendarSummary: string; _isHolidayOrBirthday: boolean; _calendarColor: string | null }> = [];

  for (const cal of calendars) {
    if (!cal.id) continue;

    // Identify non-actionable calendar types
    const isHolidayOrBirthday = isNonActionableCalendar(cal);

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
          _calendarColor: cal.backgroundColor ?? null,
        });
      }
    } catch {
      // Skip calendars that fail (permissions, etc.)
    }
  }

  return allEvents;
}

/** Create a calendar event and return it. */
export interface CreateEventInput {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: string[];
  location?: string;
  /** Generate a Google Meet link (conferenceData.createRequest). */
  generateMeetLink?: boolean;
}

export async function createEvent(
  workspaceId: string,
  event: CreateEventInput,
): Promise<calendar_v3.Schema$Event> {
  const { calendar, calendarId } = await getCalendarClient(workspaceId);

  const requestBody: calendar_v3.Schema$Event = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.startDateTime },
    end: { dateTime: event.endDateTime },
    attendees: event.attendees?.map((email) => ({ email })),
  };

  if (event.generateMeetLink) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `khove-meet-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody,
    conferenceDataVersion: event.generateMeetLink ? 1 : undefined,
  });

  return res.data;
}

/**
 * Create a Google Calendar event AND mirror it into the local DB immediately.
 * Mirrors as a Task when it's a genuine meeting (or `asTask` is forced), else as
 * a calendar-only CalendarEntry — same rule as inbound sync classification.
 */
export async function createCalendarEventAndTask(
  workspaceId: string,
  event: CreateEventInput,
  opts?: { asTask?: boolean },
): Promise<{ event: calendar_v3.Schema$Event; taskId: string | null; entryId: string | null }> {
  const created = await createEvent(workspaceId, event);
  const { calendarId } = await getCalendarClient(workspaceId);

  let taskId: string | null = null;
  let entryId: string | null = null;

  if (created.id) {
    const becomeTask = opts?.asTask || shouldBecomeTask(classifyEvent(created));
    if (becomeTask) {
      await upsertTaskFromEvent(workspaceId, created, calendarId);
      const task = await db.task.findFirst({
        where: { workspaceId, source: { has: "GOOGLE_CALENDAR" }, externalId: created.id },
        select: { id: true },
      });
      taskId = task?.id ?? null;
    } else {
      await upsertCalendarEntry(workspaceId, created);
      const entry = await db.calendarEntry.findUnique({
        where: { workspaceId_externalId: { workspaceId, externalId: created.id } },
        select: { id: true },
      });
      entryId = entry?.id ?? null;
    }
  }

  return { event: created, taskId, entryId };
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
/**
 * A calendar whose events are display-only noise (holidays, birthdays, subscribed
 * read-only feeds, contacts) rather than actionable meetings.
 */
export function isNonActionableCalendar(
  cal: calendar_v3.Schema$CalendarListEntry,
): boolean {
  return (
    cal.accessRole === "reader" || // subscribed calendars (holidays, sports, etc.)
    (cal.id?.includes("#holiday@") ?? false) ||
    (cal.id?.includes("#contacts@") ?? false) ||
    (cal.id?.includes("addressbook#") ?? false) ||
    (cal.summary?.toLowerCase().includes("holiday") ?? false) ||
    (cal.summary?.toLowerCase().includes("birthday") ?? false)
  );
}

/**
 * Whether a synced Google event should become a Khove Task.
 *
 * Only genuine meetings (conference link OR real attendees) become tasks; every
 * other event — birthdays, appointments, travel, focus blocks, personal/all-day —
 * stays calendar-only (a CalendarEntry). Events from holiday/birthday/subscribed
 * calendars are never tasks. See lib/calendar/classify.ts.
 */
export function eventBecomesTask(
  event: calendar_v3.Schema$Event & { _isHolidayOrBirthday?: boolean },
): boolean {
  if (event._isHolidayOrBirthday) return false;
  return shouldBecomeTask(classifyEvent(event));
}

// ---------------------------------------------------------------------------
// Sync: Google → Khove
// ---------------------------------------------------------------------------

/** Extract the Google Meet / video-conference link from an event, if any. */
function extractMeetLink(event: calendar_v3.Schema$Event): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  return video?.uri ?? null;
}

/**
 * Build the `googleCalendar` metadata block for a synced Google Calendar task.
 *
 * NOTE: the caller namespaces this under `metadata.googleCalendar` (matching the
 * outbound push path in routes/tasks.ts and every frontend reader). Attendees are
 * kept as `string[]` (emails) for back-compat with existing readers/push-back, and
 * the richer per-attendee RSVP info is added alongside as `attendeeStatus[]`.
 */
function buildEventMetadata(
  event: calendar_v3.Schema$Event,
  calendarId: string,
) {
  const attendees = event.attendees ?? [];
  const meetLink = extractMeetLink(event);
  const classification = classifyEvent(event);

  return {
    calendarId,
    eventId: event.id ?? null,
    // Normalized classification (see lib/calendar/classify.ts).
    type: classification.type,
    isMeeting: classification.isMeeting,
    meetingProvider: classification.provider,
    joinUrl: classification.joinUrl ?? meetLink ?? null,
    attendeeCount: classification.attendeeCount,
    classificationConfidence: classification.confidence,
    endDateTime: event.end?.dateTime ?? event.end?.date ?? null,
    location: event.location ?? null,
    htmlLink: event.htmlLink ?? null,
    // Back-compat: emails only. Existing readers + push-back rely on this shape.
    attendees: attendees.map((a) => a.email).filter((e): e is string => !!e),
    // Rich per-attendee RSVP (used by the planner popover + RSVP nudges).
    attendeeStatus: attendees
      .filter((a) => !!a.email)
      .map((a) => ({
        email: a.email as string,
        displayName: a.displayName ?? null,
        responseStatus: a.responseStatus ?? "needsAction",
        organizer: a.organizer ?? false,
        optional: a.optional ?? false,
        self: a.self ?? false,
      })),
    organizer: event.organizer
      ? {
          email: event.organizer.email ?? null,
          displayName: event.organizer.displayName ?? null,
          self: event.organizer.self ?? false,
        }
      : null,
    meetLink,
    conferenceType:
      event.conferenceData?.conferenceSolution?.name ?? (meetLink ? "Google Meet" : null),
    recurringEventId: event.recurringEventId ?? null,
    recurrence: event.recurrence ?? null,
    reminders: event.reminders
      ? {
          useDefault: event.reminders.useDefault ?? true,
          overrides: (event.reminders.overrides ?? []).map((o) => ({
            method: o.method ?? null,
            minutes: o.minutes ?? null,
          })),
        }
      : null,
    eventStatus: event.status ?? "confirmed",
    isAllDay: !event.start?.dateTime,
    eventType: event.eventType ?? "default",
    updated: event.updated ?? null,
  };
}

/**
 * Metadata for a calendar-only entry (non-meeting event). Lighter than the task
 * metadata but still carries the classification + any join link, so the planner
 * can show the event's type/provider even though it isn't a task.
 */
function buildEntryMetadata(event: calendar_v3.Schema$Event) {
  const c = classifyEvent(event);
  const meetLink = extractMeetLink(event);
  const tagged = event as calendar_v3.Schema$Event & { _calendarId?: string; _calendarColor?: string | null };
  return {
    eventType: event.eventType ?? "default",
    location: event.location ?? null,
    type: c.type,
    isMeeting: c.isMeeting,
    meetingProvider: c.provider,
    joinUrl: c.joinUrl ?? meetLink ?? null,
    attendeeCount: c.attendeeCount,
    isAllDay: !event.start?.dateTime,
    attendees: (event.attendees ?? []).map((a) => a.email).filter((e): e is string => !!e),
    // The source calendar — powers the calendar picker + per-calendar colors.
    calendarId: tagged._calendarId ?? null,
    calendarColor: tagged._calendarColor ?? null,
  };
}

export interface UserCalendar {
  id: string;
  summary: string;
  color: string | null;
}

/** List the user's Google calendars with their display colors (for the picker). */
export async function listUserCalendars(workspaceId: string): Promise<UserCalendar[]> {
  const { calendar } = await getCalendarClient(workspaceId);
  const res = await calendar.calendarList.list();
  return (res.data.items ?? [])
    .filter((c) => c.id)
    .map((c) => ({
      id: c.id!,
      summary: c.summaryOverride ?? c.summary ?? c.id!,
      color: c.backgroundColor ?? null,
    }));
}

/** Persist the user's calendar list + colors into Integration.metadata, preserving
 *  any prior per-calendar `selected` choice (new calendars default to selected). */
async function persistCalendars(workspaceId: string): Promise<void> {
  try {
    const cals = await listUserCalendars(workspaceId);
    const integ = await db.integration.findFirst({
      where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
      select: { id: true, metadata: true },
    });
    if (!integ) return;
    const meta = (integ.metadata ?? {}) as Record<string, unknown>;
    const prev = (meta.calendars as { id: string; selected?: boolean }[] | undefined) ?? [];
    const prevSel = new Map(prev.map((c) => [c.id, c.selected !== false]));
    const calendars = cals.map((c) => ({ ...c, selected: prevSel.get(c.id) ?? true }));
    await db.integration.update({
      where: { id: integ.id },
      data: { metadata: { ...meta, calendars } as unknown as Prisma.InputJsonObject },
    });
  } catch {
    /* best-effort — picker just won't populate until the next sync */
  }
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
  // Namespace under `googleCalendar` (CLAUDE.md rule + aligns with the outbound
  // push path and every frontend reader, which all read metadata.googleCalendar.*).
  const gcalMeta = buildEventMetadata(event, calendarId);

  if (existing) {
    const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    await db.task.update({
      where: { id: existing.id },
      data: {
        title,
        description: event.description ?? existing.description,
        dueDate,
        externalUrl: event.htmlLink ?? existing.externalUrl,
        metadata: { ...existingMeta, googleCalendar: gcalMeta },
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
      metadata: { googleCalendar: gcalMeta },
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
      data: { title, startDate, endDate, isAllDay, metadata: buildEntryMetadata(event) },
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
      metadata: buildEntryMetadata(event),
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
  await persistCalendars(workspaceId);

  // Collapse the same Google event returned under multiple calendars to a single
  // occurrence, preferring an actionable (writable) calendar — otherwise one event
  // could land as both a Task (from a writable calendar) AND a CalendarEntry (from a
  // reader/subscribed one) and show twice in the planner.
  const byId = new Map<string, (typeof events)[number]>();
  for (const ev of events) {
    if (!ev.id) continue;
    const prev = byId.get(ev.id);
    if (!prev || (prev._isHolidayOrBirthday && !ev._isHolidayOrBirthday)) byId.set(ev.id, ev);
  }
  const deduped = [...byId.values()];

  let tasksCreated = 0;
  let tasksUpdated = 0;
  let entriesCreated = 0;

  for (const event of deduped) {
    if (eventBecomesTask(event)) {
      const result = await upsertTaskFromEvent(workspaceId, event, event._calendarId);
      if (result === "created") tasksCreated++;
      if (result === "updated") tasksUpdated++;
    } else {
      const result = await upsertCalendarEntry(workspaceId, event);
      if (result === "created") entriesCreated++;
    }
  }

  // Self-heal any pre-existing duplicate meeting Tasks left by the old
  // concurrent-sync race (inline + Inngest ran together with no unique guard on
  // Task(workspaceId, externalId)). Keep the earliest row per externalId.
  await dedupeGoogleTasks(workspaceId);

  return { tasksCreated, tasksUpdated, entriesCreated };
}

/** Delete duplicate GOOGLE_CALENDAR Tasks sharing an externalId, keeping the oldest. */
async function dedupeGoogleTasks(workspaceId: string): Promise<void> {
  const rows = await db.task.findMany({
    where: { workspaceId, source: { has: "GOOGLE_CALENDAR" }, externalId: { not: null } },
    select: { id: true, externalId: true },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const dupeIds: string[] = [];
  for (const r of rows) {
    const key = r.externalId as string;
    if (seen.has(key)) dupeIds.push(r.id);
    else seen.add(key);
  }
  if (dupeIds.length) {
    await db.task.deleteMany({ where: { id: { in: dupeIds } } }).catch(() => {});
  }
}

/** True for a Google API "410 Gone" — the sync token has expired. */
function isSyncTokenExpired(err: unknown): boolean {
  const code = (err as { code?: number; response?: { status?: number } })?.code;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return code === 410 || status === 410;
}

/**
 * Incremental sync across ALL of the user's calendars using a per-calendar sync
 * token (previously the webhook only re-synced `primary`, so changes on secondary
 * calendars were missed). Tokens live in `Integration.metadata.syncTokens` keyed
 * by calendarId; a 410 clears that calendar's token to force a full re-fetch.
 * Throws on auth failure so the caller can deactivate the integration.
 */
export async function incrementalSyncAllCalendars(
  workspaceId: string,
): Promise<{ tasksUpserted: number; entriesUpserted: number }> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
  });
  if (!integration) return { tasksUpserted: 0, entriesUpserted: 0 };

  const { calendar } = await getCalendarClient(workspaceId);
  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  const syncTokens: Record<string, string> = { ...((meta.syncTokens as Record<string, string>) ?? {}) };
  // Migrate the legacy single primary syncToken into the per-calendar map.
  if (typeof meta.syncToken === "string" && !syncTokens["primary"]) {
    syncTokens["primary"] = meta.syncToken as string;
  }

  const calListRes = await calendar.calendarList.list();
  const calendars = calListRes.data.items ?? [];

  let tasksUpserted = 0;
  let entriesUpserted = 0;

  for (const cal of calendars) {
    if (!cal.id) continue;
    const nonActionable = isNonActionableCalendar(cal);
    const token = syncTokens[cal.id];

    try {
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;
      do {
        const listParams: Record<string, unknown> = {
          calendarId: cal.id,
          singleEvents: true,
          maxResults: 250,
        };
        if (pageToken) listParams.pageToken = pageToken;
        else if (token) listParams.syncToken = token;
        else listParams.timeMin = new Date().toISOString();

        const res = await calendar.events.list(listParams as never);

        for (const ev of res.data.items ?? []) {
          if (eventBecomesTask({ ...ev, _isHolidayOrBirthday: nonActionable })) {
            await upsertTaskFromEvent(workspaceId, ev, cal.id);
            tasksUpserted++;
          } else {
            await upsertCalendarEntry(workspaceId, ev);
            entriesUpserted++;
          }
        }

        pageToken = res.data.nextPageToken ?? undefined;
        nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);

      if (nextSyncToken) syncTokens[cal.id] = nextSyncToken;
    } catch (err) {
      if (isSyncTokenExpired(err)) {
        delete syncTokens[cal.id]; // force a full re-fetch on the next push
      } else if (isAuthError(err)) {
        throw err; // let the caller deactivate the integration
      }
      // otherwise skip this calendar (permissions, transient) and continue
    }
  }

  const { syncToken: _drop, ...restMeta } = meta;
  await db.integration.update({
    where: { id: integration.id },
    data: { metadata: { ...restMeta, syncTokens } },
  });

  return { tasksUpserted, entriesUpserted };
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
