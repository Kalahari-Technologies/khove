import { Router } from "express";
import { getCurrentUser } from "@backend/lib/auth";
import { createCalendarEventAndTask } from "@backend/lib/integrations/google-calendar";
import { publishEvent } from "@backend/lib/realtime";
import { requireWorkspaceMembership } from "@backend/lib/workspace/resolve";

const router = Router();

// POST /api/calendar/events — create a Google Calendar event AND mirror it to a
// local Task (two-way write). Used by the planner's inline "click-empty-slot".
router.post("/events", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const {
      workspaceId,
      summary,
      startDateTime,
      endDateTime,
      description,
      attendees,
      location,
      generateMeetLink,
      addAsTask,
    } = req.body ?? {};

    if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });
    if (!summary || typeof summary !== "string" || !summary.trim()) {
      return res.status(400).json({ error: "summary is required" });
    }
    if (!startDateTime || !endDateTime) {
      return res.status(400).json({ error: "startDateTime and endDateTime are required" });
    }

    await requireWorkspaceMembership(workspaceId, user.id);

    const { event, taskId, entryId } = await createCalendarEventAndTask(
      workspaceId,
      {
        summary: summary.trim(),
        startDateTime,
        endDateTime,
        description: typeof description === "string" ? description : undefined,
        attendees: Array.isArray(attendees) ? attendees : undefined,
        location: typeof location === "string" ? location : undefined,
        generateMeetLink: generateMeetLink === true,
      },
      // A Meet link makes it a meeting; the user can also opt in explicitly.
      { asTask: addAsTask === true || generateMeetLink === true },
    );

    if (taskId) await publishEvent(user.id, { type: "task.created", taskId }).catch(() => {});
    else await publishEvent(user.id, { type: "refresh" }).catch(() => {});
    return res.status(201).json({ taskId, entryId, eventId: event.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Not a member of this workspace") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (error instanceof Error && error.message.includes("not connected")) {
      return res.status(409).json({ error: "Google Calendar is not connected" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
