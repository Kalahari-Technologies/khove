import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { exchangeCodeForToken } from "@/lib/integrations/github";
import { publishEvent } from "@/lib/realtime";
import { inngest } from "@/lib/inngest";

/**
 * GET /api/integrations/github/callback
 * State carries userId:workspaceId for CSRF + workspace targeting.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Parse state → userId:workspaceId
  const [stateUserId, stateWorkspaceId] = (state ?? "").split(":");

  // Resolve workspace slug for redirect
  const workspace = stateWorkspaceId
    ? await db.workspace.findUnique({ where: { id: stateWorkspaceId }, select: { slug: true } })
    : null;
  const githubPath = workspace ? `/${workspace.slug}/github` : "/github";

  if (!code) {
    return NextResponse.redirect(new URL(`${githubPath}?error=missing_code`, req.url));
  }

  if (!stateWorkspaceId || stateUserId !== user.id) {
    return NextResponse.redirect(new URL(`${githubPath}?error=invalid_state`, req.url));
  }

  try {
    const { accessToken } = await exchangeCodeForToken(code);

    // Get GitHub user info for metadata
    const octokit = await import("@octokit/rest").then(
      (m) => new m.Octokit({ auth: accessToken }),
    );
    const { data: ghUser } = await octokit.users.getAuthenticated();

    await db.integration.upsert({
      where: {
        provider_workspaceId: { provider: "GITHUB", workspaceId: stateWorkspaceId },
      },
      create: {
        provider: "GITHUB",
        userId: user.id,
        workspaceId: stateWorkspaceId,
        accessTokenEnc: encrypt(accessToken),
        isActive: true,
        metadata: {
          login: ghUser.login,
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
          name: ghUser.name,
        },
      },
      update: {
        userId: user.id,
        accessTokenEnc: encrypt(accessToken),
        isActive: true,
        metadata: {
          login: ghUser.login,
          githubId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
          name: ghUser.name,
        },
      },
    });

    await inngest.send({
      name: "github/initial-sync",
      data: { userId: user.id, workspaceId: stateWorkspaceId },
    });

    await publishEvent(user.id, { type: "refresh" }).catch(() => {});

    return NextResponse.redirect(new URL(`${githubPath}?connected=true`, req.url));
  } catch (error) {
    console.error("[GitHub OAuth callback] Error:", error);
    return NextResponse.redirect(new URL(`${githubPath}?error=github_auth_failed`, req.url));
  }
}
