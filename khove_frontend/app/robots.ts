import type { MetadataRoute } from "next";

const BASE_URL = "https://www.khove.xyz";

// Served at /robots.txt. Allow the public marketing/auth/legal surface; keep
// crawlers out of the API and the authenticated app area.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/trpc/", "/home", "/onboarding", "/sso-callback"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
