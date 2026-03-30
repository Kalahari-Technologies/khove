import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAdminWorkspace } from "@/lib/workspace/authorization";
import { publishEvent } from "@/lib/realtime";

/**
 * POST /api/integrations/github/disconnect
 * Body: { workspaceId: string }
 * Soft-deletes the GitHub integration. Requires OWNER/ADMIN role.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await req.json();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return NextResponse.json({ error: "Only workspace admins can disconnect integrations" }, { status: 403 });
  }

  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
  });

  if (!integration) {
    return NextResponse.json({ error: "GitHub is not connected" }, { status: 404 });
  }

  await db.integration.update({
    where: { id: integration.id },
    data: { isActive: false },
  });

  await publishEvent(user.id, { type: "refresh" }).catch(() => {});

  return NextResponse.json({ success: true });
}
