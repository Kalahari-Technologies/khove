import { Router } from "express";
import { getCurrentUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";
import { encrypt } from "@backend/lib/encryption";
import { canAdminWorkspace } from "@backend/lib/workspace/authorization";
import {
  createGitHubInstallUrl,
  exchangeCodeForToken,
  listInstallationRepos,
  listUserRepos,
} from "@backend/lib/integrations/github";
import { createOAuthState, consumeOAuthState } from "@backend/lib/integrations/oauth-state";
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

  // Return the App INSTALL URL as JSON — the authenticated frontend redirects to
  // it (a cross-origin browser navigation to this route wouldn't carry the
  // session). Installing + authorizing in one step gives the callback both the
  // OAuth `code` and the `installation_id` the Shepherd needs.
  const state = await createOAuthState("github", { userId: user.id, workspaceId });
  return res.json({ url: createGitHubInstallUrl(state) });
});

// GET /api/integrations/github/callback — redirects back to the FRONTEND origin.
// Identity comes from the single-use `state` nonce (no Clerk session exists on a
// cross-origin browser redirect to the backend).
router.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const stateData = await consumeOAuthState("github", req.query.state as string | undefined);

  const workspace = stateData
    ? await db.workspace.findUnique({ where: { id: stateData.workspaceId }, select: { slug: true } })
    : null;
  const githubPath = workspace ? `/${workspace.slug}/github` : "/github";

  if (!code) return res.redirect(`${env.FRONTEND_ORIGIN}${githubPath}?error=missing_code`);
  if (!stateData) {
    return res.redirect(`${env.FRONTEND_ORIGIN}${githubPath}?error=invalid_state`);
  }

  const { userId, workspaceId } = stateData;

  try {
    const { accessToken } = await exchangeCodeForToken(code);
    const octokit = await import("@octokit/rest").then((m) => new m.Octokit({ auth: accessToken }));
    const { data: ghUser } = await octokit.users.getAuthenticated();

    // The install+authorize flow carries `installation_id`. Preserve any
    // existing one if a re-authorize (OAuth-only) callback lacks it.
    const installationIdParam = req.query.installation_id as string | undefined;
    const existing = await db.integration.findUnique({
      where: { provider_workspaceId: { provider: "GITHUB", workspaceId } },
      select: { metadata: true },
    });
    const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>;
    const installationId =
      installationIdParam && !Number.isNaN(Number(installationIdParam))
        ? Number(installationIdParam)
        : (typeof existingMeta.installationId === "number" ? existingMeta.installationId : null);

    const metadata = {
      login: ghUser.login,
      githubId: ghUser.id,
      avatarUrl: ghUser.avatar_url,
      name: ghUser.name,
      installationId,
    };

    await db.integration.upsert({
      where: { provider_workspaceId: { provider: "GITHUB", workspaceId } },
      create: {
        provider: "GITHUB",
        userId,
        workspaceId,
        accessTokenEnc: encrypt(accessToken),
        isActive: true,
        metadata,
      },
      update: {
        userId,
        accessTokenEnc: encrypt(accessToken),
        isActive: true,
        metadata,
      },
    });

    await inngest.send({
      name: "github/initial-sync",
      data: { userId, workspaceId },
    });
    await publishEvent(userId, { type: "refresh" }).catch(() => {});

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

// POST /api/integrations/github/resync — re-run the initial sync. Admin-gated.
router.post("/resync", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { workspaceId } = req.body ?? {};
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return res.status(403).json({ error: "Only workspace admins can sync integrations" });
  }

  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
  });
  if (!integration) return res.status(404).json({ error: "GitHub is not connected" });

  await inngest.send({ name: "github/initial-sync", data: { userId: integration.userId, workspaceId } });
  return res.json({ success: true });
});

// GET /api/integrations/github/repos?workspaceId=xxx — candidate repos (from the
// installation) + the current scope selection. Admin-gated.
router.get("/repos", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const workspaceId = req.query.workspaceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return res.status(403).json({ error: "Only workspace admins can manage scope" });
  }

  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
    select: { metadata: true },
  });
  if (!integration) return res.status(404).json({ error: "GitHub is not connected" });

  let repos: { fullName: string; private: boolean }[] = [];
  try {
    repos = (await listInstallationRepos(workspaceId)).map((r) => ({ fullName: r.fullName, private: r.private }));
  } catch {
    // fall through to owned repos
  }
  if (repos.length === 0) {
    repos = (await listUserRepos(workspaceId, { per_page: 100 })).map((r) => ({ fullName: r.fullName, private: r.private }));
  }

  const scope = ((integration.metadata ?? {}) as Record<string, unknown>).scope as { repos?: string[] } | undefined;
  return res.json({ repos, selected: scope?.repos ?? [] });
});

// POST /api/integrations/github/scope { workspaceId, repos: string[] } — save the
// product boundary and re-sync. Empty array means "all". Admin-gated.
router.post("/scope", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { workspaceId, repos } = req.body ?? {};
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });
  if (!Array.isArray(repos)) return res.status(400).json({ error: "repos must be an array" });

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return res.status(403).json({ error: "Only workspace admins can manage scope" });
  }

  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
  });
  if (!integration) return res.status(404).json({ error: "GitHub is not connected" });

  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  await db.integration.update({
    where: { id: integration.id },
    data: { metadata: { ...meta, scope: { repos: (repos as string[]).filter(Boolean) } } },
  });

  await inngest.send({ name: "github/initial-sync", data: { userId: integration.userId, workspaceId } });
  return res.json({ success: true });
});

export default router;
