import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  listUpcomingEvents,
  createCalendarEventAndTask,
  checkAvailability,
} from "@backend/lib/integrations/google-calendar";
import {
  loadWorkspaceEvents,
  computeInsights,
  findFreeWindows,
} from "@backend/lib/calendar/intelligence";

/** Default analysis window: now → +14 days. */
function defaultRange(from?: string, to?: string): { from: Date; to: Date } {
  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

/**
 * Google Calendar tools — available to PRO+ tiers when GOOGLE_CALENDAR is connected.
 * Every execute() is wrapped in try/catch — tool failures never crash the conversation.
 */
export function getCalendarTools(workspaceId: string) {
  return {
    listUpcomingEvents: tool({
      description:
        "List upcoming Google Calendar events. Use when the user asks about their schedule, meetings, or what's on their calendar.",
      inputSchema: zodSchema(
        z.object({
          timeMin: z
            .string()
            .optional()
            .describe("ISO 8601 start of range (default: now)"),
          timeMax: z
            .string()
            .optional()
            .describe("ISO 8601 end of range (default: 7 days from now)"),
          maxResults: z
            .number()
            .optional()
            .default(10)
            .describe("Max events to return (default 10)"),
        }),
      ),
      execute: async ({ timeMin, timeMax, maxResults }) => {
        try {
          // Default timeMax to 7 days from now if not specified
          const defaultMax = new Date();
          defaultMax.setDate(defaultMax.getDate() + 7);

          const events = await listUpcomingEvents(workspaceId, {
            timeMin: timeMin ?? new Date().toISOString(),
            timeMax: timeMax ?? defaultMax.toISOString(),
            maxResults: maxResults ?? 10,
          });

          return {
            success: true,
            count: events.length,
            events: events.map((e) => ({
              id: e.id,
              summary: e.summary ?? "(No title)",
              start: e.start?.dateTime ?? e.start?.date ?? null,
              end: e.end?.dateTime ?? e.end?.date ?? null,
              location: e.location ?? null,
              attendees:
                e.attendees?.map((a) => a.email).filter(Boolean) ?? [],
              htmlLink: e.htmlLink ?? null,
              status: e.status ?? null,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    createCalendarEvent: tool({
      description:
        "Create a Google Calendar event. Use when the user asks to schedule a meeting, block time, or add a calendar event.",
      inputSchema: zodSchema(
        z.object({
          summary: z.string().describe("Event title"),
          startDateTime: z
            .string()
            .describe("ISO 8601 start time (e.g. 2026-03-27T14:00:00+01:00)"),
          endDateTime: z
            .string()
            .describe("ISO 8601 end time (e.g. 2026-03-27T14:30:00+01:00)"),
          description: z.string().optional().describe("Event description"),
          attendees: z
            .array(z.string())
            .optional()
            .describe("Email addresses of attendees"),
          location: z.string().optional().describe("Event location"),
        }),
      ),
      execute: async ({
        summary,
        startDateTime,
        endDateTime,
        description,
        attendees,
        location,
      }) => {
        try {
          const { event, taskId } = await createCalendarEventAndTask(workspaceId, {
            summary,
            startDateTime,
            endDateTime,
            description,
            attendees,
            location,
          });

          return {
            success: true,
            event: {
              id: event.id,
              taskId,
              summary: event.summary,
              start: event.start?.dateTime ?? event.start?.date,
              end: event.end?.dateTime ?? event.end?.date,
              htmlLink: event.htmlLink,
            },
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    checkAvailability: tool({
      description:
        "Check if the user is free or busy during a time range. Use when the user asks about their availability or free time.",
      inputSchema: zodSchema(
        z.object({
          timeMin: z
            .string()
            .describe("ISO 8601 start of range to check"),
          timeMax: z
            .string()
            .describe("ISO 8601 end of range to check"),
        }),
      ),
      execute: async ({ timeMin, timeMax }) => {
        try {
          const result = await checkAvailability(workspaceId, timeMin, timeMax);
          const isFree = result.busy.length === 0;

          return {
            success: true,
            free: isFree,
            busyPeriods: result.busy,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    detectScheduleConflicts: tool({
      description:
        "Analyze the user's calendar for scheduling problems — double-booked meetings, overloaded days, and days with no protected deep-work time. Use when the user asks about conflicts, how busy they are, or to review their schedule.",
      inputSchema: zodSchema(
        z.object({
          from: z.string().optional().describe("ISO 8601 start of analysis window (default: now)"),
          to: z.string().optional().describe("ISO 8601 end of window (default: +14 days)"),
        }),
      ),
      execute: async ({ from, to }) => {
        try {
          const range = defaultRange(from, to);
          const events = await loadWorkspaceEvents(workspaceId, range.from, range.to);
          const insights = computeInsights(events);
          return {
            success: true,
            count: insights.length,
            insights: insights.map((i) => ({
              type: i.type,
              severity: i.severity,
              title: i.title,
              detail: i.detail,
              day: i.day,
              confidence: i.confidence,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    findFocusTime: tool({
      description:
        "Find free windows in the user's calendar suitable for focused/deep work. Use when the user asks when they're free for heads-down work or to block focus time.",
      inputSchema: zodSchema(
        z.object({
          from: z.string().optional().describe("ISO 8601 start (default: now)"),
          to: z.string().optional().describe("ISO 8601 end (default: +14 days)"),
          minMinutes: z
            .number()
            .optional()
            .default(120)
            .describe("Minimum free-window length in minutes (default 120)"),
        }),
      ),
      execute: async ({ from, to, minMinutes }) => {
        try {
          const range = defaultRange(from, to);
          const events = await loadWorkspaceEvents(workspaceId, range.from, range.to);
          const windows = findFreeWindows(events, minMinutes ?? 120);
          return { success: true, count: windows.length, windows };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    suggestReschedule: tool({
      description:
        "Suggest concrete fixes for calendar problems (which meeting to move to resolve a conflict, or when to block focus time). Use after detecting conflicts or when the user asks how to fix their schedule.",
      inputSchema: zodSchema(
        z.object({
          from: z.string().optional().describe("ISO 8601 start (default: now)"),
          to: z.string().optional().describe("ISO 8601 end (default: +14 days)"),
        }),
      ),
      execute: async ({ from, to }) => {
        try {
          const range = defaultRange(from, to);
          const events = await loadWorkspaceEvents(workspaceId, range.from, range.to);
          const actionable = computeInsights(events).filter((i) => i.suggestedAction);
          return {
            success: true,
            count: actionable.length,
            suggestions: actionable.map((i) => ({
              problem: i.detail,
              action: i.suggestedAction,
              confidence: i.confidence,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}
