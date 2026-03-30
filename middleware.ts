import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/join(.*)",
  "/onboarding(.*)",
  "/sso-callback(.*)",
  "/api/webhooks/(.*)", // All webhook endpoints — must be unprotected
  "/api/inngest(.*)",   // Inngest serve endpoint — authenticated via signing key
]);

// Slugs that cannot be workspace slugs — static array for Edge compatibility
// (middleware runs in Edge runtime, cannot import from lib/)
const RESERVED_SLUGS = new Set([
  "login",
  "join",
  "onboarding",
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
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
