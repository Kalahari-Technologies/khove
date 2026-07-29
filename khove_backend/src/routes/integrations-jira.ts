import { Router } from "express";
import { getCurrentUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";
import { encrypt } from "@backend/lib/encryption";
import { canAdminWorkspace } from "@backend/lib/workspace/authorization";
import {
  createJiraOAuthUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  deleteJiraWebhooks,
  listProjects,
} from "@backend/lib/integrations/jira";
import { createOAuthState, consumeOAuthState } from "@backend/lib/integrations/oauth-state";
import { publishEvent } from "@backend/lib/realtime";
import { inngest } from "@backend/lib/inngest";
import { env } from "@backend/env";

const router = Router();

// GET /api/integrations/jira/connect?workspaceId=xxx — requires OWNER/ADMIN
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

  // Return the OAuth URL as JSON — the authenticated frontend redirects to it.
  const state = await createOAuthState("jira", { userId: user.id, workspaceId });
  return res.json({ url: createJiraOAuthUrl(state) });
});

// GET /api/integrations/jira/callback — redirects back to the FRONTEND origin.
// Identity comes from the single-use `state` nonce.
router.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const oauthError = req.query.error as string | undefined;
  const stateData = await consumeOAuthState("jira", req.query.state as string | undefined);

  const workspace = stateData
    ? await db.workspace.findUnique({ where: { id: stateData.workspaceId }, select: { slug: true } })
    : null;
  const jiraPath = workspace ? `/${workspace.slug}/jira` : "/jira";

  if (oauthError) return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?error=${oauthError}`);
  if (!code || !stateData) {
    return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?error=invalid_state`);
  }

  const { userId, workspaceId } = stateData;

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Resolve the accessible Jira site (cloudId + URL) — the first for the pilot.
    const resources = await getAccessibleResources(tokens.access_token);
    const site = resources[0];
    if (!site) {
      return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?error=no_jira_site`);
    }

    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const metadata = { cloudId: site.id, siteUrl: site.url, siteName: site.name };

    await db.integration.upsert({
      where: { provider_workspaceId: { provider: "JIRA", workspaceId } },
      create: {
        provider: "JIRA",
        userId,
        workspaceId,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        metadata,
        isActive: true,
      },
      update: {
        userId,
        accessTokenEnc,
        ...(refreshTokenEnc && { refreshTokenEnc }),
        tokenExpiresAt,
        metadata,
        isActive: true,
      },
    });

    await inngest.send({ name: "jira/initial-sync", data: { userId, workspaceId } });
    await publishEvent(userId, { type: "refresh" }).catch(() => {});

    return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?connected=jira`);
  } catch (err) {
    console.error("[Jira] OAuth callback error:", err);
    return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?error=jira_auth_failed`);
  }
});

// POST /api/integrations/jira/disconnect — requires OWNER/ADMIN
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
    where: { workspaceId, provider: "JIRA", isActive: true },
  });
  if (!integration) return res.status(404).json({ error: "No active Jira integration found." });

  // Delete the dynamic webhook while the token is still valid, then deactivate.
  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  const webhookIds = Array.isArray(meta.webhookIds) ? (meta.webhookIds as number[]) : [];
  if (webhookIds.length) await deleteJiraWebhooks(workspaceId, webhookIds).catch(() => {});

  await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
  await inngest.send({ name: "jira/disconnected", data: { userId: user.id, workspaceId } });
  await publishEvent(user.id, { type: "refresh" }).catch(() => {});

  return res.json({ success: true });
});

// POST /api/integrations/jira/resync — re-run the initial sync. Admin-gated.
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
    where: { workspaceId, provider: "JIRA", isActive: true },
  });
  if (!integration) return res.status(404).json({ error: "Jira is not connected" });

  await inngest.send({ name: "jira/initial-sync", data: { userId: integration.userId, workspaceId } });
  return res.json({ success: true });
});

// GET /api/integrations/jira/projects?workspaceId=xxx — projects + current selection.
router.get("/projects", async (req, res) => {
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
    where: { workspaceId, provider: "JIRA", isActive: true },
    select: { metadata: true },
  });
  if (!integration) return res.status(404).json({ error: "Jira is not connected" });

  try {
    const projects = await listProjects(workspaceId);
    const scope = ((integration.metadata ?? {}) as Record<string, unknown>).scope as { projects?: string[] } | undefined;
    return res.json({ projects, selected: scope?.projects ?? [] });
  } catch (err) {
    console.error("[jira/projects] listing failed:", err);
    return res.status(502).json({ error: "Couldn't list Jira projects", projects: [], selected: [] });
  }
});

// POST /api/integrations/jira/scope { workspaceId, projects: string[] } — save + re-sync.
router.post("/scope", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { workspaceId, projects } = req.body ?? {};
  if (!workspaceId) return res.status(400).json({ error: "workspaceId is required" });
  if (!Array.isArray(projects)) return res.status(400).json({ error: "projects must be an array" });

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !canAdminWorkspace(membership.role)) {
    return res.status(403).json({ error: "Only workspace admins can manage scope" });
  }

  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "JIRA", isActive: true },
  });
  if (!integration) return res.status(404).json({ error: "Jira is not connected" });

  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  await db.integration.update({
    where: { id: integration.id },
    data: { metadata: { ...meta, scope: { projects: (projects as string[]).filter(Boolean) } } },
  });

  await inngest.send({ name: "jira/initial-sync", data: { userId: integration.userId, workspaceId } });
  return res.json({ success: true });
});

export default router;
