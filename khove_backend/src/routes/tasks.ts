import { Router } from "express";
import { getCurrentUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";
import {
  pushTaskToGoogleCalendar,
  deleteGoogleCalendarEvent,
} from "@backend/lib/integrations/google-calendar";
import { writeAudit } from "@backend/lib/agent/audit";
import { publishEvent } from "@backend/lib/realtime";
import { requireWorkspaceMembership } from "@backend/lib/workspace/resolve";

const router = Router();

// POST /api/tasks — create a task
router.post("/", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { title, statusId, priority, dueDate, description, syncToGoogle, gcal, workspaceId } =
      req.body ?? {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    await requireWorkspaceMembership(workspaceId, user.id);

    const task = await db.task.create({
      data: {
        title: title.trim(),
        statusId: statusId ?? null,
        priority: priority ?? "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        description: typeof description === "string" ? description.trim() || null : null,
        userId: user.id,
        workspaceId,
        source: ["KHOVE"],
      },
    });

    if (syncToGoogle && task.dueDate) {
      try {
        const fullTask = await db.task.findUnique({ where: { id: task.id } });
        if (fullTask) {
          const result = await pushTaskToGoogleCalendar(
            fullTask.workspaceId ?? "",
            fullTask,
            gcal ?? undefined
          );
          if (result) {
            await db.task.update({
              where: { id: task.id },
              data: {
                source: { push: "GOOGLE_CALENDAR" },
                externalId: result.eventId,
                metadata: {
                  googleCalendar: {
                    eventId: result.eventId,
                    calendarId: result.calendarId,
                    meetLink: result.meetLink ?? null,
                    location: result.location ?? null,
                    attendees: result.attendees,
                    endDateTime: result.endDateTime,
                  },
                },
              },
            });
          }
        }
      } catch {
        // Non-blocking — task created, GCal sync failed silently.
      }
    }

    await publishEvent(user.id, { type: "task.created", taskId: task.id }).catch(() => {});
    return res.status(201).json({ id: task.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Not a member of this workspace") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Shared owner-scoped task loader for the PATCH routes.
async function loadOwnedTask(req: import("express").Request, res: import("express").Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const task = await db.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.userId !== user.id) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  return { user, task };
}

// PATCH /api/tasks/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    const ctx = await loadOwnedTask(req, res);
    if (!ctx) return;
    const { statusId } = req.body ?? {};
    if (typeof statusId !== "string") return res.status(400).json({ error: "statusId required" });

    const updated = await db.task.update({ where: { id: req.params.id }, data: { statusId } });
    if (updated.externalId) {
      try { await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated); } catch {}
    }
    await publishEvent(ctx.user.id, { type: "task.updated", taskId: req.params.id }).catch(() => {});
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/tasks/:id/priority
const VALID_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"];
router.patch("/:id/priority", async (req, res) => {
  try {
    const ctx = await loadOwnedTask(req, res);
    if (!ctx) return;
    const { priority } = req.body ?? {};
    if (typeof priority !== "string" || !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: "Invalid priority" });
    }
    const updated = await db.task.update({
      where: { id: req.params.id },
      data: { priority: priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW" },
    });
    if (updated.externalId) {
      try { await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated); } catch {}
    }
    await publishEvent(ctx.user.id, { type: "task.updated", taskId: req.params.id }).catch(() => {});
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/tasks/:id/due-date
router.patch("/:id/due-date", async (req, res) => {
  try {
    const ctx = await loadOwnedTask(req, res);
    if (!ctx) return;
    const { task } = ctx;
    const { dueDate } = req.body ?? {};
    if (typeof dueDate !== "string") return res.status(400).json({ error: "dueDate required" });

    const newStart = new Date(dueDate);
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;

    let updatedMeta = meta;
    if (gcal.endDateTime && task.externalId) {
      const oldStart = task.dueDate ? task.dueDate.getTime() : newStart.getTime();
      const oldEnd = new Date(gcal.endDateTime as string).getTime();
      const interval = oldEnd - oldStart > 0 ? oldEnd - oldStart : 3600000;
      let newEnd = new Date(gcal.endDateTime as string);
      if (newStart.getTime() >= oldEnd) newEnd = new Date(newStart.getTime() + interval);
      updatedMeta = { ...meta, googleCalendar: { ...gcal, endDateTime: newEnd.toISOString() } };
    }

    const updated = await db.task.update({
      where: { id: req.params.id },
      data: {
        dueDate: newStart,
        ...(updatedMeta !== meta && { metadata: updatedMeta as object }),
      },
    });
    if (updated.externalId) {
      try { await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated); } catch {}
    }
    await publishEvent(ctx.user.id, { type: "task.updated", taskId: req.params.id }).catch(() => {});
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tasks/:id — explicit delete. Propagates the deletion to Google
// Calendar for linked events (delete=explicit governance) so the webhook can't
// re-sync it back. deleteGoogleCalendarEvent was previously dead code.
router.delete("/:id", async (req, res) => {
  try {
    const ctx = await loadOwnedTask(req, res);
    if (!ctx) return;
    const { task } = ctx;

    if (task.externalId && task.source.includes("GOOGLE_CALENDAR")) {
      try {
        await deleteGoogleCalendarEvent(task.workspaceId ?? "", task.externalId);
      } catch {
        // Non-fatal: event may already be gone on Google's side.
      }
    }

    await db.task.delete({ where: { id: task.id } });
    if (task.workspaceId) {
      await writeAudit({
        workspaceId: task.workspaceId,
        actorType: "USER",
        actorId: ctx.user.id,
        action: task.externalId ? "calendar.event.deleted" : "task.deleted",
        targetType: "Task",
        targetId: task.id,
        metadata: { title: task.title, source: task.source },
      });
    }
    await publishEvent(ctx.user.id, { type: "task.deleted", taskId: task.id }).catch(() => {});
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
