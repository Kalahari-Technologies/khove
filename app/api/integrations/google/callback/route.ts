import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { createOAuth2Client } from "@/lib/integrations/google-calendar";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";

/**
 * GET /api/integrations/google/callback
 * Exchanges the authorization code for tokens, encrypts them, and upserts the Integration record.
 * State carries userId:workspaceId for CSRF + workspace targeting.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Parse state → userId:workspaceId
  const [stateUserId, stateWorkspaceId] = (state ?? "").split(":");

  // Resolve workspace slug for redirect
  const workspace = stateWorkspaceId
    ? await db.workspace.findUnique({ where: { id: stateWorkspaceId }, select: { slug: true } })
    : null;
  const plannerPath = workspace ? `/${workspace.slug}/planner` : "/planner";

  if (error) {
    return NextResponse.redirect(new URL(`${plannerPath}?error=${error}`, req.url));
  }

  // CSRF: userId from state must match authenticated user
  if (!code || !stateWorkspaceId || stateUserId !== user.id) {
    return NextResponse.redirect(new URL(`${plannerPath}?error=invalid_state`, req.url));
  }

  try {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL(`${plannerPath}?error=no_token`, req.url));
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

    // Dispatch initial sync as background job
    await inngest.send({
      name: "google-calendar/initial-sync",
      data: { userId: user.id, workspaceId: stateWorkspaceId },
    });

    return NextResponse.redirect(new URL(`${plannerPath}?syncing=true`, req.url));
  } catch (err) {
    console.error("[Google Calendar] OAuth callback error:", err);
    return NextResponse.redirect(new URL(`${plannerPath}?error=auth_failed`, req.url));
  }
}
