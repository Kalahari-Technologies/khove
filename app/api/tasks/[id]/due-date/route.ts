import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const { dueDate } = await req.json();
    if (typeof dueDate !== "string") {
      return NextResponse.json({ error: "dueDate required" }, { status: 400 });
    }

    await db.task.update({
      where: { id: params.id },
      data: { dueDate: new Date(dueDate) },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
