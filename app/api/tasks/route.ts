import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushTaskToGoogleCalendar } from "@/lib/integrations/google-calendar";
import { publishEvent } from "@/lib/realtime";
import { requireWorkspaceMembership } from "@/lib/workspace/resolve";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, statusId, priority, dueDate, description, syncToGoogle, gcal, workspaceId } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Validate workspace membership
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

    // Push to Google Calendar if requested and user has active integration
    if (syncToGoogle && task.dueDate) {
      try {
        const fullTask = await db.task.findUnique({ where: { id: task.id } });
        if (fullTask) {
          const result = await pushTaskToGoogleCalendar(fullTask.workspaceId ?? "", fullTask, gcal ?? undefined);
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
        // Non-blocking — task is created, GCal sync failed silently
      }
    }

    await publishEvent(user.id, { type: "task.created", taskId: task.id }).catch(() => {});

    return NextResponse.json({ id: task.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Not a member of this workspace") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
