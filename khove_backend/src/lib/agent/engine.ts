import type { AgentActionType, Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";
import {
  loadWorkspaceEvents,
  computeInsights,
  findFreeWindows,
  type CalendarEventLike,
} from "@backend/lib/calendar/intelligence";
import { parseGitHubRefs, resolvePeople } from "@backend/lib/threads";
import { notifyNewActions } from "@backend/lib/agent/notify";

const WINDOW_DAYS = 14;
const RSVP_HORIZON_MS = 48 * 60 * 60 * 1000;

interface DraftAction {
  type: AgentActionType;
  dedupeKey: string;
  title: string;
  rationale: string;
  confidence?: number;
  sources: Prisma.InputJsonValue;
  payload: Prisma.InputJsonValue;
  threadId?: string | null;
}

// ---------------------------------------------------------------------------
// Draft builders
// ---------------------------------------------------------------------------

function draftsFromInsights(events: CalendarEventLike[]): DraftAction[] {
  const drafts: DraftAction[] = [];
  const insights = computeInsights(events);

  for (const insight of insights) {
    const action = insight.suggestedAction;
    if (!action) continue;

    if (action.type === "BLOCK_FOCUS_TIME") {
      drafts.push({
        type: "BLOCK_FOCUS_TIME",
        dedupeKey: insight.id,
        title: "Block deep-work time",
        rationale: insight.detail,
        confidence: insight.confidence,
        sources: insight.sources as unknown as Prisma.InputJsonValue,
        payload: {
          summary: "Focus time",
          startDateTime: action.startDateTime,
          endDateTime: action.endDateTime,
        },
      });
    } else if (action.type === "RESCHEDULE_EVENT") {
      const ev = events.find((e) => e.taskId === action.taskId);
      if (!ev) continue;
      const durationMs = ev.end.getTime() - ev.start.getTime();
      const windows = findFreeWindows(events, Math.max(30, durationMs / 60000));
      const slot = windows.find((w) => new Date(w.start).getTime() > Date.now());
      if (!slot) continue; // nothing to propose → skip
      const newStart = new Date(slot.start);
      const newEnd = new Date(newStart.getTime() + durationMs);
      drafts.push({
        type: "RESCHEDULE_EVENT",
        dedupeKey: insight.id,
        title: `Reschedule "${ev.title}"`,
        rationale: `${insight.detail} ${action.reason}`,
        confidence: insight.confidence,
        sources: insight.sources as unknown as Prisma.InputJsonValue,
        payload: {
          taskId: action.taskId,
          newStartDateTime: newStart.toISOString(),
          newEndDateTime: newEnd.toISOString(),
        },
      });
    }
  }
  return drafts;
}

async function draftThreadSuggestions(workspaceId: string, from: Date, to: Date): Promise<DraftAction[]> {
  const meetings = await db.task.findMany({
    where: { workspaceId, source: { has: "GOOGLE_CALENDAR" }, dueDate: { gte: from, lte: to } },
  });

  const drafts: DraftAction[] = [];
  for (const task of meetings) {
    // Skip meetings already attached to a thread.
    const linked = await db.threadLink.findFirst({
      where: { kind: "TASK", refId: task.id, thread: { workspaceId } },
      select: { id: true },
    });
    if (linked) continue;

    const refs = parseGitHubRefs(`${task.title}\n${task.description ?? ""}`);
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;
    const emails = Array.isArray(gcal.attendees) ? (gcal.attendees as string[]) : [];
    const people = await resolvePeople(workspaceId, emails);
    const memberCount = people.filter((p) => p.userId).length;

    if (refs.length === 0 && memberCount < 2) continue; // no join signal

    const bits: string[] = [];
    if (refs.length) bits.push(`${refs.length} GitHub reference${refs.length === 1 ? "" : "s"}`);
    if (memberCount) bits.push(`${memberCount} teammate${memberCount === 1 ? "" : "s"}`);

    drafts.push({
      type: "SUGGEST_THREAD",
      dedupeKey: `suggest_thread:${task.id}`,
      title: `Create a thread for "${task.title}"`,
      rationale: `This meeting links ${bits.join(" and ")} — grouping them into a Connectivity Thread keeps the work together.`,
      confidence: 0.75,
      sources: [{ kind: "task", id: task.id, title: task.title }] as unknown as Prisma.InputJsonValue,
      payload: { taskId: task.id, title: task.title },
    });
  }
  return drafts;
}

async function draftRsvpNudges(workspaceId: string, from: Date): Promise<DraftAction[]> {
  const horizon = new Date(Date.now() + RSVP_HORIZON_MS);
  const meetings = await db.task.findMany({
    where: { workspaceId, source: { has: "GOOGLE_CALENDAR" }, dueDate: { gte: from, lte: horizon } },
  });

  const drafts: DraftAction[] = [];
  for (const task of meetings) {
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;
    const attendeeStatus = Array.isArray(gcal.attendeeStatus)
      ? (gcal.attendeeStatus as Array<Record<string, unknown>>)
      : [];
    const pending = attendeeStatus
      .filter((a) => a.responseStatus === "needsAction" && !a.self && !a.organizer)
      .map((a) => a.email as string)
      .filter(Boolean);
    if (pending.length === 0) continue;

    drafts.push({
      type: "RSVP_NUDGE",
      dedupeKey: `rsvp:${task.id}`,
      title: `${pending.length} haven't RSVP'd to "${task.title}"`,
      rationale: `The meeting is within 48 hours and ${pending.length} invitee(s) haven't responded.`,
      confidence: 0.8,
      sources: [{ kind: "task", id: task.id, title: task.title }] as unknown as Prisma.InputJsonValue,
      payload: { taskId: task.id, pending },
    });
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Scan + persist
// ---------------------------------------------------------------------------

const TERMINAL = new Set(["EXECUTED", "APPROVED", "REJECTED", "DISMISSED"]);

/**
 * Scan one workspace, draft proactive AgentActions, and upsert them as PENDING
 * (deduped by dedupeKey). Never resurrects an action the user already resolved.
 * Returns the count of newly-created actions and notifies channels.
 */
export async function scanWorkspace(workspaceId: string): Promise<{ created: number; total: number }> {
  const from = new Date();
  const to = new Date(Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const events = await loadWorkspaceEvents(workspaceId, from, to);
  const drafts = [
    ...draftsFromInsights(events),
    ...(await draftThreadSuggestions(workspaceId, from, to)),
    ...(await draftRsvpNudges(workspaceId, from)),
  ];

  let created = 0;
  const newItems: Array<{ title: string; detail: string }> = [];

  for (const d of drafts) {
    const existing = await db.agentAction.findUnique({
      where: { workspaceId_dedupeKey: { workspaceId, dedupeKey: d.dedupeKey } },
      select: { id: true, status: true },
    });

    if (existing && TERMINAL.has(existing.status)) continue; // user already resolved it

    if (existing) {
      await db.agentAction.update({
        where: { id: existing.id },
        data: {
          title: d.title,
          rationale: d.rationale,
          confidence: d.confidence ?? null,
          sources: d.sources,
          payload: d.payload,
          status: "PENDING",
          error: null,
        },
      });
    } else {
      await db.agentAction.create({
        data: {
          workspaceId,
          threadId: d.threadId ?? null,
          type: d.type,
          title: d.title,
          rationale: d.rationale,
          confidence: d.confidence ?? null,
          sources: d.sources,
          payload: d.payload,
          dedupeKey: d.dedupeKey,
          proposedBy: "agent:calendar-intelligence",
        },
      });
      created++;
      newItems.push({ title: d.title, detail: d.rationale });
    }
  }

  if (newItems.length > 0) {
    await notifyNewActions(workspaceId, newItems);
  }

  return { created, total: drafts.length };
}
