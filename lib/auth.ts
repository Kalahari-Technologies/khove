import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspace/create-personal";
import type { User } from "@prisma/client";

/**
 * Get the current Prisma User from the Clerk session.
 * Auto-creates the user record if Clerk session exists but DB record doesn't
 * (handles the case where the Clerk webhook hasn't fired yet).
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await db.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  // User is authenticated in Clerk but not yet in DB — upsert from Clerk session
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

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

  // Ensure personal workspace exists (handles webhook race condition)
  await ensurePersonalWorkspace({
    id: user.id,
    name: user.name,
    email: user.email,
  });

  return user;
}

/**
 * Get the current Prisma User — throws if not authenticated.
 * Use in server actions and API routes that require auth.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Get Clerk user ID from session — lightweight, no DB call.
 * Use when you only need the ID for a query.
 */
export async function requireClerkId(): Promise<string> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");
  return clerkId;
}
