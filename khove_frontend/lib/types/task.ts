import type { Task, WorkflowStatus, TaskAssignee, TaskFieldValue } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type { Task, WorkflowStatus, TaskAssignee, TaskFieldValue };

export type TaskWithStatus = Prisma.TaskGetPayload<{
  include: { status: true };
}>;

export type TaskWithDetails = Prisma.TaskGetPayload<{
  include: {
    status: true;
    assignees: {
      include: {
        user: { select: { id: true; name: true; email: true } };
      };
    };
  };
}>;

export interface PlannerAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string; // accepted | declined | tentative | needsAction
}

export interface PlannerTask {
  id: string;
  title: string;
  /** ISO string — serialized from `task.dueDate` for client component. */
  dueDate: string;
  source: string[];
  priority?: string;
  hasMeetLink?: boolean;
  /** Full Google Meet / conference URL (from metadata.googleCalendar.meetLink). */
  meetLink?: string | null;
  location?: string | null;
  /** Per-attendee RSVP (from metadata.googleCalendar.attendeeStatus). */
  attendees?: PlannerAttendee[];
  /** ISO string — from metadata.googleCalendar.endDateTime (GCal-synced tasks only). */
  endDateTime?: string;
  /** Whether this is an all-day event (from metadata.googleCalendar.isAllDay). */
  isAllDay?: boolean;
  /** Connectivity Thread this meeting is linked to, if any. */
  threadId?: string | null;
  threadTitle?: string | null;
  status: {
    name: string;
    color: string;
  };
}

/** External calendar entry for display-only on the planner (holidays, birthdays, etc.). */
export interface CalendarDisplayEntry {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  isAllDay: boolean;
}
