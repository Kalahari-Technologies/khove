import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { createOAuth2Client } from "@/lib/integrations/google-calendar";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";

/**
 * GET /api/integrations/google/callback
 * Exchanges the authorization code for tokens, encrypts them, and upserts the Integration record.
 * Redirects to /calendar on success.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Google returned an error (user denied consent, etc.)
  if (error) {
    return NextResponse.redirect(new URL(`/calendar?error=${error}`, req.url));
  }

  // CSRF: state must match the authenticated user's ID
  if (!code || state !== user.id) {
    return NextResponse.redirect(new URL("/calendar?error=invalid_state", req.url));
  }

  try {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/calendar?error=no_token", req.url));
    }

    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : undefined;
    const tokenExpiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : undefined;

    await db.integration.upsert({
      where: {
        provider_userId: { provider: "GOOGLE_CALENDAR", userId: user.id },
      },
      create: {
        provider: "GOOGLE_CALENDAR",
        userId: user.id,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        metadata: { calendarId: "primary" },
        isActive: true,
      },
      update: {
        accessTokenEnc,
        ...(refreshTokenEnc && { refreshTokenEnc }),
        tokenExpiresAt,
        isActive: true,
      },
    });

    // Dispatch initial sync as background job — don't block the redirect
    await inngest.send({
      name: "google-calendar/initial-sync",
      data: { userId: user.id },
    });

    return NextResponse.redirect(new URL("/calendar?syncing=true", req.url));
  } catch (err) {
    console.error("[Google Calendar] OAuth callback error:", err);
    return NextResponse.redirect(new URL("/calendar?error=auth_failed", req.url));
  }
}
