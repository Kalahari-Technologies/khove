import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { canWriteWorkspace, canAdminWorkspace } from "@/lib/workspace/authorization";
import superjson from "superjson";
import type { User, Workspace, WorkspaceRole } from "@prisma/client";

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

export interface TRPCContext {
  user: User | null;
  clerkId: string | null;
  workspace: Workspace | null;
  workspaceRole: WorkspaceRole | null;
}

export async function createTRPCContext(opts?: {
  headers?: Headers;
}): Promise<TRPCContext> {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return { user: null, clerkId: null, workspace: null, workspaceRole: null };
  }

  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user) {
    return { user: null, clerkId, workspace: null, workspaceRole: null };
  }

  // Resolve workspace from x-workspace-id header
  let workspace: Workspace | null = null;
  let workspaceRole: WorkspaceRole | null = null;

  const workspaceId = opts?.headers?.get("x-workspace-id");
  if (workspaceId) {
    workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
    if (workspace) {
      const membership = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
        },
      });
      workspaceRole = membership?.role ?? null;

      // If user is not a member, clear workspace from context
      if (!membership) {
        workspace = null;
      }
    }
  }

  return { user, clerkId, workspace, workspaceRole };
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

// Requires an active workspace in context
const enforceWorkspace = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!ctx.workspace || !ctx.workspaceRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No workspace context",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspace: ctx.workspace,
      workspaceRole: ctx.workspaceRole,
    },
  });
});

export const workspaceProcedure = t.procedure.use(enforceWorkspace);

// Requires write permission (OWNER | ADMIN | MEMBER)
const enforceWorkspaceWrite = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!ctx.workspace || !ctx.workspaceRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No workspace context",
    });
  }
  if (!canWriteWorkspace(ctx.workspaceRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient workspace permissions",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspace: ctx.workspace,
      workspaceRole: ctx.workspaceRole,
    },
  });
});

export const workspaceWriteProcedure = t.procedure.use(enforceWorkspaceWrite);

// Requires admin permission (OWNER | ADMIN)
const enforceWorkspaceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!ctx.workspace || !ctx.workspaceRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No workspace context",
    });
  }
  if (!canAdminWorkspace(ctx.workspaceRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspace: ctx.workspace,
      workspaceRole: ctx.workspaceRole,
    },
  });
});

export const workspaceAdminProcedure = t.procedure.use(enforceWorkspaceAdmin);
