import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";

/**
 * POST /api/webhooks/google-calendar
 * Receives Google Calendar push notifications.
 * MUST return 200 immediately — all processing dispatched to Inngest.
 * Only works in production (requires public HTTPS endpoint).
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const resourceId = req.headers.get("x-goog-resource-id");

  if (!channelId || !resourceId) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  // Look up the user from the channel ID stored in integration metadata
  const integration = await db.integration.findFirst({
    where: {
      provider: "GOOGLE_CALENDAR",
      isActive: true,
      metadata: { path: ["webhookChannelId"], equals: channelId },
    },
    select: { userId: true },
  });

  if (integration) {
    // Fire-and-forget — Inngest handles the processing
    await inngest.send({
      name: "google-calendar/webhook.received",
      data: {
        userId: integration.userId,
        channelId,
        resourceId,
      },
    });
  }

  // Always return 200 — Google retries on non-2xx and may disable the channel
  return NextResponse.json({ ok: true });
}
