import type { AgentAction } from "@prisma/client";
import { db } from "@backend/lib/db";
import {
  createCalendarEventAndTask,
  pushTaskToGoogleCalendar,
} from "@backend/lib/integrations/google-calendar";
import { createThread, autoLinkMeeting, linkToThread, linkPRToThreads } from "@backend/lib/threads";
import { commentOnPR, requestReviewers } from "@backend/lib/integrations/github";

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

      // Seeded from a PR (Shepherd): link the PR + its author/reviewers.
      if (p.prTaskId) {
        const prTask = await db.task.findUnique({ where: { id: p.prTaskId as string } });
        if (prTask) {
          await linkToThread(action.workspaceId, thread.id, {
            kind: "GITHUB_PR",
            refId: prTask.id,
            refUrl: prTask.externalUrl,
            title: prTask.title,
          });
        }
        await linkPRToThreads(action.workspaceId, p.prTaskId as string);
        return { summary: `Thread created for ${prTask?.title ?? "the pull request"}.` };
      }

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

    case "NUDGE_REVIEWER": {
      await commentOnPR(
        action.workspaceId,
        p.owner as string,
        p.repo as string,
        p.prNumber as number,
        p.body as string,
      );
      return { summary: "Reviewer nudge posted on the pull request." };
    }

    case "REQUEST_REVIEW": {
      const reviewer = p.reviewer as string | undefined;
      if (reviewer) {
        await requestReviewers(
          action.workspaceId,
          p.owner as string,
          p.repo as string,
          p.prNumber as number,
          [reviewer],
        );
        return { summary: `Requested review from @${reviewer}.` };
      }
      // No specific reviewer to assign — post a governed comment asking for one.
      await commentOnPR(
        action.workspaceId,
        p.owner as string,
        p.repo as string,
        p.prNumber as number,
        "This PR has no reviewer assigned — consider requesting one so it can move forward. (Sent by Khove)",
      );
      return { summary: "Posted a request-a-reviewer comment." };
    }

    case "FLAG_PR": {
      const reason = (p.reason as string) ?? "needs attention";
      await commentOnPR(
        action.workspaceId,
        p.owner as string,
        p.repo as string,
        p.prNumber as number,
        `⚠️ Khove flagged this PR: ${reason}. (Sent by Khove)`,
      );
      return { summary: "Flag comment posted on the pull request." };
    }

    case "FLAG_RISK": {
      // Safe internal write: log the delivery risk as a high-priority follow-up task
      // for the workspace owner (no external side effects).
      const workspace = await db.workspace.findUnique({
        where: { id: action.workspaceId },
        select: { ownerId: true },
      });
      const blockers = (p.blockers as { title: string; reason: string }[]) ?? [];
      const blockerText = blockers.length
        ? `Blockers:\n${blockers.map((b) => `- ${b.title} — ${b.reason}`).join("\n")}`
        : "The merge rate is too low to hit the target.";
      await db.task.create({
        data: {
          title: `Delivery risk: ${p.title as string}`,
          description:
            (p.daysLate != null ? `Projected ${p.daysLate} day(s) late.\n` : "") + blockerText,
          source: ["KHOVE"],
          priority: "HIGH",
          workspaceId: action.workspaceId,
          userId: workspace?.ownerId ?? action.approvedBy ?? "",
        },
      });
      return { summary: "Delivery risk logged as a follow-up task." };
    }

    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}
