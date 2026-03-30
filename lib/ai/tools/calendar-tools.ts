import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  listUpcomingEvents,
  createEvent,
  checkAvailability,
} from "@/lib/integrations/google-calendar";

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
          const event = await createEvent(workspaceId, {
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
  };
}
