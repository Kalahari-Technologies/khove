import { Router } from "express";
import { Webhook } from "svix";
import { verifyWebhookSignature } from "@backend/lib/integrations/github";
import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { redis } from "@backend/lib/redis";
import { ensurePersonalWorkspace } from "@backend/lib/workspace/create-personal";
import type { WebhookEvent } from "@clerk/backend";
import type { EmailJSON } from "@clerk/backend";

const router = Router();

// These routes are mounted with `express.raw()` — `req.body` is a Buffer.
function rawBody(req: import("express").Request): string {
  return Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
}

// POST /api/webhooks/github
router.post("/github", async (req, res) => {
  const body = rawBody(req);
  const signature = req.header("x-hub-signature-256") ?? "";

  const valid = await verifyWebhookSignature(body, signature);
  if (!valid) return res.status(401).json({ error: "Invalid signature" });

  const event = JSON.parse(body);
  const eventType = req.header("x-github-event") ?? "unknown";

  await inngest.send({
    name: "github/webhook.received",
    data: { eventType, payload: event, installationId: event.installation?.id },
  });

  return res.json({ received: true }); // 200 immediately — never process synchronously
});

// POST /api/webhooks/jira/:secret — the secret in the path is the auth check.
router.post("/jira/:secret", async (req, res) => {
  const secret = req.params.secret;
  if (!secret) return res.status(400).json({ error: "Missing secret" });

  const integration = await db.integration.findFirst({
    where: {
      provider: "JIRA",
      isActive: true,
      metadata: { path: ["webhookSecret"], equals: secret },
    },
    select: { userId: true, workspaceId: true },
  });
  // Always 200 (a non-2xx makes Atlassian back off / disable the webhook).
  if (!integration) return res.json({ ok: true });

  try {
    const payload = JSON.parse(rawBody(req));
    await inngest.send({
      name: "jira/webhook.received",
      data: { userId: integration.userId, workspaceId: integration.workspaceId, payload },
    });
  } catch {
    // ignore malformed payloads
  }

  return res.json({ ok: true });
});

// POST /api/webhooks/google-calendar
router.post("/google-calendar", async (req, res) => {
  const channelId = req.header("x-goog-channel-id");
  const resourceId = req.header("x-goog-resource-id");
  if (!channelId || !resourceId) return res.status(400).json({ error: "Missing headers" });

  const integration = await db.integration.findFirst({
    where: {
      provider: "GOOGLE_CALENDAR",
      isActive: true,
      metadata: { path: ["webhookChannelId"], equals: channelId },
    },
    select: { userId: true, workspaceId: true },
  });

  if (integration) {
    await inngest.send({
      name: "google-calendar/webhook.received",
      data: { userId: integration.userId, workspaceId: integration.workspaceId, channelId, resourceId },
    });
  }

  return res.json({ ok: true }); // always 200 — Google disables channels on non-2xx
});

// POST /api/webhooks/clerk
router.post("/clerk", async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ error: "CLERK_WEBHOOK_SECRET not configured" });
  }

  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: "Missing svix headers" });
  }

  const body = rawBody(req);
  let event: WebhookEvent;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  switch (event.type) {
    case "user.created": {
      const { id: clerkId, email_addresses, first_name, last_name } = event.data;
      const primaryEmail = email_addresses.find(
        (e) => e.id === event.data.primary_email_address_id
      );
      if (!primaryEmail) break;

      const user = await db.user.upsert({
        where: { clerkId },
        create: {
          clerkId,
          email: primaryEmail.email_address,
          name: [first_name, last_name].filter(Boolean).join(" ") || null,
          planTier: "FREE",
        },
        update: {
          email: primaryEmail.email_address,
          name: [first_name, last_name].filter(Boolean).join(" ") || null,
        },
      });

      await ensurePersonalWorkspace({ id: user.id, name: user.name, email: user.email });
      await inngest.send({ name: "user/welcome-signup", data: { clerkId } });
      break;
    }

    case "user.updated": {
      const { id: clerkId, email_addresses, first_name, last_name } = event.data;
      const primaryEmail = email_addresses.find(
        (e) => e.id === event.data.primary_email_address_id
      );
      if (!primaryEmail) break;
      await db.user.updateMany({
        where: { clerkId },
        data: {
          email: primaryEmail.email_address,
          name: [first_name, last_name].filter(Boolean).join(" ") || null,
        },
      });
      break;
    }

    case "user.deleted": {
      const { id: clerkId } = event.data;
      if (!clerkId) break;
      await db.user.deleteMany({ where: { clerkId } });
      break;
    }

    case "session.created": {
      const sessionData = event.data as {
        user_id: string;
        created_at: number;
        id: string;
        client_id: string;
        last_active_at?: number;
      };
      const userId = sessionData.user_id;
      if (!userId) break;

      const clientKey = `known-devices:${userId}`;
      const clientId = sessionData.client_id;
      if (clientId) {
        const isKnown = await redis.sismember(clientKey, clientId);
        if (!isKnown) {
          await redis.sadd(clientKey, clientId);
          await redis.expire(clientKey, 60 * 60 * 24 * 90);
          const createdAt = sessionData.created_at;
          const isNewUser = createdAt && Date.now() - createdAt * 1000 < 5 * 60 * 1000;
          if (!isNewUser) {
            await inngest.send({
              name: "user/new-device-login",
              data: { clerkId: userId, sessionId: sessionData.id, clientId },
            });
          }
        }
      }

      const cooldownKey = `welcome-back:${userId}`;
      const hasCooldown = await redis.get(cooldownKey);
      if (hasCooldown) break;
      const createdAt = sessionData.created_at;
      if (createdAt && Date.now() - createdAt * 1000 < 5 * 60 * 1000) break;
      await redis.set(cooldownKey, "1", { ex: 86400 });
      await inngest.send({ name: "user/welcome-back", data: { clerkId: userId } });
      break;
    }

    case "email.created": {
      const emailData = event.data as EmailJSON;
      if (emailData.delivered_by_clerk) break;
      const toEmail = emailData.to_email_address;
      if (!toEmail) break;
      const otp =
        emailData.data?.otp_code || emailData.data?.code || emailData.data?.verification_code;
      if (!otp) break;
      await inngest.send({
        name: "user/otp-email",
        data: { to: toEmail, otpCode: String(otp), slug: emailData.slug || null },
      });
      break;
    }

    default:
      break;
  }

  return res.json({ received: true });
});

export default router;
