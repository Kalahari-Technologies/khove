import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * Get the current Prisma User from the Clerk session.
 * Returns null if not authenticated or user not yet synced to DB.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  return db.user.findUnique({ where: { clerkId } });
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
