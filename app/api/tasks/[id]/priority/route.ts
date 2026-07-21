import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushTaskToGoogleCalendar } from "@/lib/integrations/google-calendar";
import { publishEvent } from "@/lib/realtime";

const VALID_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const task = await db.task.findUnique({ where: { id } });
    if (!task || task.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { priority } = await req.json();
    if (typeof priority !== "string" || !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }

    const updated = await db.task.update({
      where: { id },
      data: { priority: priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW" },
    });

    if (updated.externalId) {
      try { await pushTaskToGoogleCalendar(updated.workspaceId ?? "", updated); } catch {}
    }

    await publishEvent(user.id, { type: "task.updated", taskId: id }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
