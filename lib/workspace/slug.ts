import { db } from "@/lib/db";

export const RESERVED_SLUGS = [
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
] as const;

/**
 * Sanitize a string into a valid URL slug.
 * Lowercase, strip non-alphanumeric (keep hyphens), collapse consecutive hyphens, truncate to 48 chars.
 */
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * Generate a unique workspace slug from a base string.
 * Appends -1, -2, etc. if the slug is taken or reserved.
 */
export async function generateUniqueSlug(base: string): Promise<string> {
  let slug = sanitizeSlug(base);

  // If slug is empty after sanitization, use a fallback
  if (!slug) slug = "workspace";

  // If slug is reserved, append a suffix immediately
  if (RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number])) {
    slug = `${slug}-1`;
  }

  // Check uniqueness
  let candidate = slug;
  let counter = 1;

  while (await db.workspace.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${counter}`;
    counter++;
  }

  return candidate;
}
