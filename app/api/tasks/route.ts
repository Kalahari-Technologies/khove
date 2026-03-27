import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushTaskToGoogleCalendar } from "@/lib/integrations/google-calendar";
import { publishEvent } from "@/lib/realtime";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, statusId, priority, dueDate, description, syncToGoogle, gcal } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const task = await db.task.create({
      data: {
        title: title.trim(),
        statusId: statusId ?? null,
        priority: priority ?? "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        description: typeof description === "string" ? description.trim() || null : null,
        userId: user.id,
        source: ["KHOVE"],
      },
    });

    // Push to Google Calendar if requested and user has active integration
    if (syncToGoogle && task.dueDate) {
      try {
        const fullTask = await db.task.findUnique({ where: { id: task.id } });
        if (fullTask) {
          const result = await pushTaskToGoogleCalendar(user.id, fullTask, gcal ?? undefined);
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
