import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { username, gradient } = body as { username: string; gradient?: string };

    if (!username || typeof username !== "string" || !username.trim()) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const slug = username.trim().toLowerCase();

    // Check if slug is already taken by another workspace
    const existing = await db.workspace.findUnique({ where: { slug } });
    if (existing && existing.ownerId !== user.id) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }

    // Find user's personal workspace and update its slug + gradient
    const personalWorkspace = await db.workspace.findFirst({
      where: { ownerId: user.id, isPersonal: true },
    });

    if (!personalWorkspace) {
      return NextResponse.json({ error: "Personal workspace not found" }, { status: 404 });
    }

    await db.workspace.update({
      where: { id: personalWorkspace.id },
      data: {
        slug,
        ...(gradient && { gradient }),
      },
    });

    return NextResponse.json({ success: true, slug });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[/api/onboarding] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
