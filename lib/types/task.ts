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

export interface PlannerTask {
  id: string;
  title: string;
  /** ISO string — serialized from `task.dueDate` for client component. */
  dueDate: string;
  source: string[];
  hasMeetLink?: boolean;
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
