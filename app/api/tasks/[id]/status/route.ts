import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushTaskToGoogleCalendar } from "@/lib/integrations/google-calendar";
import { publishEvent } from "@/lib/realtime";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const { statusId } = await req.json();
    if (typeof statusId !== "string") {
      return NextResponse.json({ error: "statusId required" }, { status: 400 });
    }

    const updated = await db.task.update({
      where: { id: params.id },
      data: { statusId },
    });

    // Push to GCal if this task is synced
    if (updated.externalId) {
      try { await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated); } catch {}
    }

    await publishEvent(user.id, { type: "task.updated", taskId: params.id }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
