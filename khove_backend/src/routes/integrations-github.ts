import { Router } from "express";
import { getCurrentUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";
import { encrypt } from "@backend/lib/encryption";
import { canAdminWorkspace } from "@backend/lib/workspace/authorization";
import { createGitHubOAuthUrl, exchangeCodeForToken } from "@backend/lib/integrations/github";
import { publishEvent } from "@backend/lib/realtime";
import { inngest } from "@backend/lib/inngest";
import { env } from "@backend/env";

const router = Router();

// GET /api/integrations/github/connect?workspaceId=xxx — requires OWNER/ADMIN
router.get("/connect", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const workspaceId = req.query.workspaceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return res.status(403).json({ error: "Only workspace admins can connect integrations" });
  }

  // Return the OAuth URL as JSON — the authenticated frontend redirects to it
  // (a cross-origin browser navigation to this route wouldn't carry the session).
  return res.json({ url: createGitHubOAuthUrl(user.id, workspaceId) });
});

// GET /api/integrations/github/callback — redirects back to the FRONTEND origin
router.get("/callback", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.redirect(`${env.FRONTEND_ORIGIN}/login`);

  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const [stateUserId, stateWorkspaceId] = (state ?? "").split(":");

  const workspace = stateWorkspaceId
    ? await db.workspace.findUnique({ where: { id: stateWorkspaceId }, select: { slug: true } })
    : null;
  const githubPath = workspace ? `/${workspace.slug}/github` : "/github";

  if (!code) return res.redirect(`${env.FRONTEND_ORIGIN}${githubPath}?error=missing_code`);
  if (!stateWorkspaceId || stateUserId !== user.id) {
    return res.redirect(`${env.FRONTEND_ORIGIN}${githubPath}?error=invalid_state`);
  }

  try {
    const { accessToken } = await exchangeCodeForToken(code);
    const octokit = await import("@octokit/rest").then((m) => new m.Octokit({ auth: accessToken }));
    const { data: ghUser } = await octokit.users.getAuthenticated();

    await db.integration.upsert({
      where: { provider_workspaceId: { provider: "GITHUB", workspaceId: stateWorkspaceId } },
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

    return res.redirect(`${env.FRONTEND_ORIGIN}${githubPath}?connected=true`);
  } catch (error) {
    console.error("[GitHub OAuth callback] Error:", error);
    return res.redirect(`${env.FRONTEND_ORIGIN}${githubPath}?error=github_auth_failed`);
  }
});

// POST /api/integrations/github/disconnect — requires OWNER/ADMIN
router.post("/disconnect", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { workspaceId } = req.body ?? {};
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return res.status(403).json({ error: "Only workspace admins can disconnect integrations" });
  }

  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
  });
  if (!integration) return res.status(404).json({ error: "GitHub is not connected" });

  await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
  await publishEvent(user.id, { type: "refresh" }).catch(() => {});

  return res.json({ success: true });
});

export default router;
