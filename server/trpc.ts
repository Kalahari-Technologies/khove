import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import superjson from "superjson";
import type { User } from "@prisma/client";

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

export interface TRPCContext {
  user: User | null;
  clerkId: string | null;
}

export async function createTRPCContext(): Promise<TRPCContext> {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return { user: null, clerkId: null };
  }

  const user = await db.user.findUnique({ where: { clerkId } });
  return { user, clerkId };
}

// ─────────────────────────────────────────────
// tRPC Init
// ─────────────────────────────────────────────

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
});

// ─────────────────────────────────────────────
// Procedures
// ─────────────────────────────────────────────

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
