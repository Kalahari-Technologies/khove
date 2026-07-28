import type { AgentAction } from "@prisma/client";
import { db } from "@backend/lib/db";
import {
  createCalendarEventAndTask,
  pushTaskToGoogleCalendar,
} from "@backend/lib/integrations/google-calendar";
import { createThread, autoLinkMeeting } from "@backend/lib/threads";

/**
 * Apply an approved agent action's payload via existing write paths. Throws on
 * failure so the caller can mark the action FAILED and record the error. The
 * caller is responsible for the status transition + audit log.
 */
export async function executeAgentAction(action: AgentAction): Promise<{ summary: string }> {
  const p = (action.payload ?? {}) as Record<string, unknown>;

  switch (action.type) {
    case "BLOCK_FOCUS_TIME": {
      await createCalendarEventAndTask(action.workspaceId, {
        summary: (p.summary as string) ?? "Focus time",
        startDateTime: p.startDateTime as string,
        endDateTime: p.endDateTime as string,
        description: "Deep-work block reserved by Khove.",
      });
      return { summary: "Focus block added to your calendar." };
    }

    case "CREATE_EVENT": {
      await createCalendarEventAndTask(action.workspaceId, {
        summary: p.summary as string,
        startDateTime: p.startDateTime as string,
        endDateTime: p.endDateTime as string,
        attendees: (p.attendees as string[]) ?? undefined,
        location: (p.location as string) ?? undefined,
      });
      return { summary: "Event created." };
    }

    case "RESCHEDULE_EVENT": {
      const task = await db.task.findUnique({ where: { id: p.taskId as string } });
      if (!task) throw new Error("Task no longer exists");
      const meta = (task.metadata ?? {}) as Record<string, unknown>;
      const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;
      const updated = await db.task.update({
        where: { id: task.id },
        data: {
          dueDate: new Date(p.newStartDateTime as string),
          metadata: {
            ...meta,
            googleCalendar: { ...gcal, endDateTime: p.newEndDateTime as string },
          },
        },
      });
      if (updated.externalId) {
        await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated);
      }
      return { summary: "Meeting rescheduled." };
    }

    case "SUGGEST_THREAD": {
      const thread = await createThread(action.workspaceId, { title: p.title as string });
      const linked = await autoLinkMeeting(action.workspaceId, thread.id, p.taskId as string);
      return { summary: `Thread created with ${linked.github} GitHub link(s) and ${linked.people} person(s).` };
    }

    case "RSVP_NUDGE": {
      // Safe, non-external write: a follow-up task for the organizer rather than
      // emailing attendees directly.
      const task = await db.task.findUnique({ where: { id: p.taskId as string } });
      if (!task) throw new Error("Task no longer exists");
      const pending = (p.pending as string[]) ?? [];
      await db.task.create({
        data: {
          title: `Follow up: ${pending.length} haven't RSVP'd to "${task.title}"`,
          description: pending.length ? `Awaiting: ${pending.join(", ")}` : null,
          source: ["KHOVE"],
          priority: "MEDIUM",
          userId: task.userId,
          workspaceId: action.workspaceId,
        },
      });
      return { summary: "Follow-up task created." };
    }

    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}
