import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, statusId, priority, dueDate, description } = body;

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
        source: "KHOVE",
      },
    });

    return NextResponse.json({ id: task.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
