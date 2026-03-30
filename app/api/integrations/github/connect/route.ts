import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAdminWorkspace } from "@/lib/workspace/authorization";
import { createGitHubOAuthUrl } from "@/lib/integrations/github";

/**
 * GET /api/integrations/github/connect?workspaceId=xxx
 * Redirects to GitHub OAuth. Requires OWNER/ADMIN role.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return NextResponse.json({ error: "Only workspace admins can connect integrations" }, { status: 403 });
  }

  const url = createGitHubOAuthUrl(user.id, workspaceId);
  return NextResponse.redirect(url);
}
