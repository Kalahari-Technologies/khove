import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceFeatureAccess } from "@/lib/billing/enforcement";
import { createOAuth2Client, GOOGLE_CALENDAR_SCOPES } from "@/lib/integrations/google-calendar";

/**
 * GET /api/integrations/google/connect
 * Redirects the user to Google's OAuth consent screen.
 * Gated to PRO+ tiers via enforceFeatureAccess.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    enforceFeatureAccess(user.planTier, "calendarTools");
  } catch {
    return NextResponse.json(
      { error: "Calendar integration requires a Pro plan or above." },
      { status: 403 },
    );
  }

  const oauth2 = createOAuth2Client();

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces refresh token even on re-connect
    scope: GOOGLE_CALENDAR_SCOPES,
    state: user.id, // CSRF validation — verified in callback
  });

  return NextResponse.redirect(url);
}
