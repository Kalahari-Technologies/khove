import type { MetadataRoute } from "next";

// Canonical production origin. Kept explicit (not env-derived) so the sitemap is
// stable for Google Search Console regardless of preview deployments.
const BASE_URL = "https://www.khove.xyz";

// Public, indexable routes only. App/workspace routes are auth-gated and are
// intentionally excluded (they also require sign-in, so crawlers can't reach them).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${BASE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/join`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
