import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushTaskToGoogleCalendar } from "@/lib/integrations/google-calendar";
import { publishEvent } from "@/lib/realtime";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const task = await db.task.findUnique({ where: { id: params.id } });
    if (!task || task.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { dueDate } = await req.json();
    if (typeof dueDate !== "string") {
      return NextResponse.json({ error: "dueDate required" }, { status: 400 });
    }

    const newStart = new Date(dueDate);
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;

    // If task has GCal meeting metadata, adjust end time
    let updatedMeta = meta;
    if (gcal.endDateTime && task.externalId) {
      const oldStart = task.dueDate ? task.dueDate.getTime() : newStart.getTime();
      const oldEnd = new Date(gcal.endDateTime as string).getTime();
      const interval = oldEnd - oldStart > 0 ? oldEnd - oldStart : 3600000; // fallback 1hr

      let newEnd = new Date(gcal.endDateTime as string);

      // If new start >= old end, shift end by the original interval
      if (newStart.getTime() >= oldEnd) {
        newEnd = new Date(newStart.getTime() + interval);
      }

      updatedMeta = {
        ...meta,
        googleCalendar: {
          ...gcal,
          endDateTime: newEnd.toISOString(),
        },
      };
    }

    const updated = await db.task.update({
      where: { id: params.id },
      data: {
        dueDate: newStart,
        ...(updatedMeta !== meta && { metadata: updatedMeta as any }),
      },
    });

    // Push to GCal if this task is synced
    if (updated.externalId) {
      try {
        await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated);
      } catch {}
    }

    await publishEvent(user.id, { type: "task.updated", taskId: params.id }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
