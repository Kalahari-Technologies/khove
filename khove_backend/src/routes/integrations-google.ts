import { Router } from "express";
import { getCurrentUser } from "@backend/lib/auth";
import { db } from "@backend/lib/db";
import { redis } from "@backend/lib/redis";
import { encrypt, decrypt } from "@backend/lib/encryption";
import { canAdminWorkspace } from "@backend/lib/workspace/authorization";
import {
  createOAuth2Client,
  GOOGLE_CALENDAR_SCOPES,
} from "@backend/lib/integrations/google-calendar";
import { inngest } from "@backend/lib/inngest";
import { env } from "@backend/env";

const router = Router();

// GET /api/integrations/google/connect?workspaceId=xxx — requires OWNER/ADMIN
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

  const oauth2 = createOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CALENDAR_SCOPES,
    state: `${user.id}:${workspaceId}`,
  });
  // Return the OAuth URL as JSON — the authenticated frontend redirects to it.
  return res.json({ url });
});

// GET /api/integrations/google/callback — redirects back to the FRONTEND origin
router.get("/callback", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.redirect(`${env.FRONTEND_ORIGIN}/login`);

  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;
  const [stateUserId, stateWorkspaceId] = (state ?? "").split(":");

  const workspace = stateWorkspaceId
    ? await db.workspace.findUnique({ where: { id: stateWorkspaceId }, select: { slug: true } })
    : null;
  const plannerPath = workspace ? `/${workspace.slug}/planner` : "/planner";

  if (error) return res.redirect(`${env.FRONTEND_ORIGIN}${plannerPath}?error=${error}`);
  if (!code || !stateWorkspaceId || stateUserId !== user.id) {
    return res.redirect(`${env.FRONTEND_ORIGIN}${plannerPath}?error=invalid_state`);
  }

  try {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.access_token) {
      return res.redirect(`${env.FRONTEND_ORIGIN}${plannerPath}?error=no_token`);
    }

    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;
    const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;

    await db.integration.upsert({
      where: {
        provider_workspaceId: { provider: "GOOGLE_CALENDAR", workspaceId: stateWorkspaceId },
      },
      create: {
        provider: "GOOGLE_CALENDAR",
        userId: user.id,
        workspaceId: stateWorkspaceId,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        metadata: { calendarId: "primary" },
        isActive: true,
      },
      update: {
        userId: user.id,
        accessTokenEnc,
        ...(refreshTokenEnc && { refreshTokenEnc }),
        tokenExpiresAt,
        isActive: true,
      },
    });

    await inngest.send({
      name: "google-calendar/initial-sync",
      data: { userId: user.id, workspaceId: stateWorkspaceId },
    });

    return res.redirect(`${env.FRONTEND_ORIGIN}${plannerPath}?syncing=true`);
  } catch (err) {
    console.error("[Google Calendar] OAuth callback error:", err);
    return res.redirect(`${env.FRONTEND_ORIGIN}${plannerPath}?error=auth_failed`);
  }
});

// POST /api/integrations/google/disconnect — requires OWNER/ADMIN
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
    where: { workspaceId, provider: "GOOGLE_CALENDAR", isActive: true },
  });
  if (!integration) {
    return res.status(404).json({ error: "No active Google Calendar integration found." });
  }

  try {
    const accessToken = decrypt(integration.accessTokenEnc);
    const oauth2 = createOAuth2Client();
    await oauth2.revokeToken(accessToken);
  } catch {}

  await db.integration.update({ where: { id: integration.id }, data: { isActive: false } });
  await inngest.send({
    name: "google-calendar/disconnected",
    data: { userId: user.id, workspaceId },
  });

  return res.json({ success: true });
});

// GET /api/integrations/google/sync-status?workspaceId=xxx
router.get("/sync-status", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const workspaceId = req.query.workspaceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });

  const raw = await redis.get<string>(`cal-sync:${workspaceId}`);
  if (!raw) return res.json({ status: "idle" });
  if (raw === "syncing") return res.json({ status: "syncing" });

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res.json(parsed);
  } catch {
    return res.json({ status: raw });
  }
});

export default router;
