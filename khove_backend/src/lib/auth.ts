import { getAuth } from "@clerk/express";
import { createClerkClient } from "@clerk/backend";
import type { Request } from "express";
import { db } from "@backend/lib/db";
import { ensurePersonalWorkspace } from "@backend/lib/workspace/create-personal";
import type { User } from "@prisma/client";

const clerkBackend = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Get the current Prisma User from the Express request's Clerk session
 * (populated by `@clerk/express` clerkMiddleware). Auto-creates the user record
 * if the Clerk session exists but the DB row doesn't (webhook race).
 */
export async function getCurrentUser(req: Request): Promise<User | null> {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) return null;

  const existing = await db.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  // Authenticated in Clerk but not yet in DB — upsert from the Clerk Backend API.
  const clerkUser = await clerkBackend.users.getUser(clerkId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  );
  if (!primaryEmail) return null;

  const user = await db.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      email: primaryEmail.emailAddress,
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null,
      planTier: "FREE",
    },
    update: {},
  });

  await ensurePersonalWorkspace({
    id: user.id,
    name: user.name,
    email: user.email,
  });

  return user;
}

/** Get the current Prisma User — throws "Unauthorized" if not authenticated. */
export async function requireUser(req: Request): Promise<User> {
  const user = await getCurrentUser(req);
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** Get the Clerk user ID from the request — throws if unauthenticated. */
export function requireClerkId(req: Request): string {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) throw new Error("Unauthorized");
  return clerkId;
}
