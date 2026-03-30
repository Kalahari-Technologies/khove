import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/integrations/github";
import { inngest } from "@/lib/inngest";

/**
 * POST /api/webhooks/github
 * Receives GitHub webhook events. Verifies signature, returns 200 immediately,
 * dispatches to Inngest for async processing.
 * NEVER process webhooks synchronously — architecture rule.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  // Verify webhook signature
  const valid = await verifyWebhookSignature(body, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body);
  const eventType = req.headers.get("x-github-event") ?? "unknown";

  // Dispatch to Inngest for async processing
  await inngest.send({
    name: "github/webhook.received",
    data: {
      eventType,
      payload: event,
      installationId: event.installation?.id,
    },
  });

  // Return 200 immediately — NEVER process synchronously
  return NextResponse.json({ received: true });
}
