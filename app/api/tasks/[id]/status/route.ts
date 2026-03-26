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

    const { statusId } = await req.json();
    if (typeof statusId !== "string") {
      return NextResponse.json({ error: "statusId required" }, { status: 400 });
    }

    await db.task.update({
      where: { id: params.id },
      data: { statusId },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
