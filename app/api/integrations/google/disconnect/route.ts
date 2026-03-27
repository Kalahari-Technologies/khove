import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { createOAuth2Client } from "@/lib/integrations/google-calendar";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";

/**
 * POST /api/integrations/google/disconnect
 * Revokes the Google token and soft-deletes the integration (isActive: false).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await db.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE_CALENDAR", isActive: true },
  });

  if (!integration) {
    return NextResponse.json({ error: "No active Google Calendar integration found." }, { status: 404 });
  }

  // Best-effort token revocation — don't fail if Google rejects
  try {
    const accessToken = decrypt(integration.accessTokenEnc);
    const oauth2 = createOAuth2Client();
    await oauth2.revokeToken(accessToken);
  } catch {
    // Token may already be expired or revoked — continue with soft delete
  }

  await db.integration.update({
    where: { id: integration.id },
    data: { isActive: false },
  });

  // Clean up synced tasks + calendar entries in the background
  await inngest.send({
    name: "google-calendar/disconnected",
    data: { userId: user.id },
  });

  return NextResponse.json({ success: true });
}
