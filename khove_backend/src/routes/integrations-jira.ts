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
import { performJiraSync } from "@backend/lib/inngest/functions/jira-sync";
import { publishEvent } from "@backend/lib/realtime";
import { inngest } from "@backend/lib/inngest";
import { redis } from "@backend/lib/redis";
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

    // Preserve any existing scope/config on re-connect (don't wipe the product boundary).
    const existing = await db.integration.findUnique({
      where: { provider_workspaceId: { provider: "JIRA", workspaceId } },
      select: { metadata: true },
    });
    const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>;
    const metadata = { ...existingMeta, cloudId: site.id, siteUrl: site.url, siteName: site.name };

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

    // Scope-first: don't sync here. If the workspace already chose projects (a
    // re-connect), kick a scoped background sync + syncing indicator; if not (first
    // connect), land on the dashboard and let the client open the project picker,
    // whose "save" triggers the first scoped sync. (This also guarantees the JQL is
    // always bounded — a sync never runs before a project scope exists.)
    const hasScope = existingMeta.scopeConfigured === true || existingMeta.scope !== undefined;
    if (hasScope) {
      await redis.set(`jira-sync:${workspaceId}`, "syncing", { ex: 600 }).catch(() => {});
      void performJiraSync(workspaceId, userId)
        .then(() => publishEvent(userId, { type: "refresh" }).catch(() => {}))
        .catch((e) => console.error("[Jira connect] background sync failed:", e instanceof Error ? e.message : e));
      return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?connected=jira`);
    }
    return res.redirect(`${env.FRONTEND_ORIGIN}${jiraPath}?connected=jira&setup=scope`);
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

  // Persist a "disconnecting" state so the full-screen loader shows across pages
  // and reloads while cleanup runs (mirrors the sync-status indicator).
  await redis.set(`jira-sync:${workspaceId}`, JSON.stringify({ status: "disconnecting" }), { ex: 120 }).catch(() => {});

  // Delete the dynamic webhook while the token is still valid, then deactivate.
  const meta = (integration.metadata ?? {}) as Record<string, unknown>;
  const webhookIds = Array.isArray(meta.webhookIds) ? (meta.webhookIds as number[]) : [];
  if (webhookIds.length) await deleteJiraWebhooks(workspaceId, webhookIds).catch(() => {});

  await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
  // Purge synced data inline so disconnect completes even if the Inngest runtime
  // isn't processing events (the cleanup job otherwise never runs).
  await db.task.deleteMany({ where: { workspaceId, source: { has: "JIRA" } } }).catch(() => {});
  await db.signal.deleteMany({ where: { workspaceId, provider: "JIRA" } }).catch(() => {});
  await db.entity.deleteMany({ where: { workspaceId, provider: "JIRA" } }).catch(() => {});
  await redis.del(`jira-sync:${workspaceId}`).catch(() => {});

  await inngest.send({ name: "jira/disconnected", data: { userId: user.id, workspaceId } }).catch(() => {});
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

  // Run the sync inline (single run — no concurrent Inngest job, which would race).
  try {
    const result = await performJiraSync(workspaceId, integration.userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(502).json({ success: false, error: err instanceof Error ? err.message : "Jira sync failed" });
  }
});

// GET /api/integrations/jira/sync-status?workspaceId=xxx — persistent sync state.
router.get("/sync-status", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const workspaceId = req.query.workspaceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const raw = await redis.get<string>(`jira-sync:${workspaceId}`);
  if (!raw) return res.json({ status: "idle" });
  if (raw === "syncing") return res.json({ status: "syncing" });
  try {
    return res.json(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return res.json({ status: raw });
  }
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
    data: {
      metadata: { ...meta, scope: { projects: (projects as string[]).filter(Boolean) }, scopeConfigured: true },
    },
  });

  // Saving scope is the sync trigger: run the scoped sync in the BACKGROUND (Inngest
  // isn't reliable in prod), with the syncing indicator, and return immediately.
  await redis.set(`jira-sync:${workspaceId}`, "syncing", { ex: 600 }).catch(() => {});
  void performJiraSync(workspaceId, integration.userId)
    .then(() => publishEvent(integration.userId, { type: "refresh" }).catch(() => {}))
    .catch((e) => console.error("[Jira scope] background sync failed:", e instanceof Error ? e.message : e));
  return res.json({ success: true });
});

export default router;
