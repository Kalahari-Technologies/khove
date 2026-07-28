import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/home",             // resolver — self-guards (redirects to /login when signed out)
  "/login(.*)",
  "/join(.*)",
  "/onboarding(.*)",
  "/sso-callback(.*)",
  "/terms(.*)",
  "/privacy(.*)",
  "/api/webhooks/(.*)", // All webhook endpoints — must be unprotected
  "/api/inngest(.*)",   // Inngest serve endpoint — authenticated via signing key
]);

// Auth screens: a signed-in user has no business here — bounce them to the app.
const isAuthRoute = createRouteMatcher(["/login(.*)", "/join(.*)"]);

// Slugs that cannot be workspace slugs — static array for Edge compatibility
// (middleware runs in Edge runtime, cannot import from lib/)
const RESERVED_SLUGS = new Set([
  "login",
  "join",
  "onboarding",
  "home",
  "terms",
  "privacy",
  "api",
  "settings",
  "admin",
  "new",
  "invite",
  "_next",
  "assets",
  "favicon",
  "robots",
  "sitemap",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // The redirect only happens on the auth endpoints, and only when already
  // signed in — the marketing landing at `/` is never redirected.
  if (userId && isAuthRoute(req)) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static files and Next.js internals. `xml` + `txt` are excluded so the
    // generated /sitemap.xml and /robots.txt are served without auth interference.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|xml|txt|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
