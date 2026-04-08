import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { inngest } from "@/lib/inngest";
import { ensurePersonalWorkspace } from "@/lib/workspace/create-personal";
import type { WebhookEvent } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  // Verify Svix signature
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  let event: WebhookEvent;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Handle events
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

      // Create personal workspace for new user
      await ensurePersonalWorkspace({
        id: user.id,
        name: user.name,
        email: user.email,
      });

      // Send welcome signup email (async via Inngest)
      await inngest.send({
        name: "user/welcome-signup",
        data: { clerkId },
      });
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
      // Hard delete — cascades to related records via Prisma relations
      await db.user.deleteMany({ where: { clerkId } });
      break;
    }

    case "session.created": {
      const userId = (event.data as { user_id: string }).user_id;
      if (!userId) break;

      // Skip if cooldown active (already sent within 24h)
      const cooldownKey = `welcome-back:${userId}`;
      const hasCooldown = await redis.get(cooldownKey);
      if (hasCooldown) break;

      // Skip brand-new users (signed up less than 5 minutes ago)
      const createdAt = (event.data as { created_at: number }).created_at;
      if (createdAt && Date.now() - createdAt * 1000 < 5 * 60 * 1000) break;

      // Set 24h cooldown and dispatch welcome back email
      await redis.set(cooldownKey, "1", { ex: 86400 });
      await inngest.send({
        name: "user/welcome-back",
        data: { clerkId: userId },
      });
      break;
    }

    default:
      // Ignore unhandled event types
      break;
  }

  return NextResponse.json({ received: true });
}
