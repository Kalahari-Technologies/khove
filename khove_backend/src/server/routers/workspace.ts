import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  workspaceProcedure,
  workspaceAdminProcedure,
} from "@backend/server/trpc";
import { publishEvent } from "@backend/lib/realtime";
import { db } from "@backend/lib/db";
import { generateUniqueSlug } from "@backend/lib/workspace/slug";
import { clearWorkspaceMemory } from "@backend/lib/ai/memory";
import {
  canManageWorkspace,
} from "@backend/lib/workspace/authorization";
import type { StatusCategory } from "@prisma/client";

const DEFAULT_STATUSES: {
  name: string;
  color: string;
  category: StatusCategory;
  position: number;
  isDefault: boolean;
}[] = [
  { name: "Todo", color: "#71717A", category: "NOT_STARTED", position: 0, isDefault: true },
  { name: "In Progress", color: "#6366F1", category: "IN_PROGRESS", position: 1, isDefault: false },
  { name: "In Review", color: "#F59E0B", category: "IN_REVIEW", position: 2, isDefault: false },
  { name: "Blocked", color: "#F43F5E", category: "BLOCKED", position: 3, isDefault: false },
  { name: "Done", color: "#10B981", category: "DONE", position: 4, isDefault: false },
  { name: "Cancelled", color: "#3F3F46", category: "CANCELLED", position: 5, isDefault: false },
];

export const workspaceRouter = router({
  /**
   * List all workspaces the user is a member of.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db.workspaceMember.findMany({
      where: { userId: ctx.user.id },
      include: { workspace: true },
      orderBy: { workspace: { createdAt: "asc" } },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      slug: m.workspace.slug,
      name: m.workspace.name,
      isPersonal: m.workspace.isPersonal,
      gradient: m.workspace.gradient,
      planTier: m.workspace.planTier,
      role: m.role,
    }));
  }),

  /** Current user + their personal workspace slug (for the root redirect page). */
  me: protectedProcedure.query(async ({ ctx }) => {
    const personal = await db.workspace.findFirst({
      where: { ownerId: ctx.user.id, isPersonal: true },
      select: { slug: true },
    });
    return {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        planTier: ctx.user.planTier,
      },
      personalWorkspaceSlug: personal?.slug ?? null,
    };
  }),

  /**
   * Get a workspace by slug (with membership check).
   */
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await db.workspace.findUnique({
        where: { slug: input.slug },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      if (!workspace) throw new TRPCError({ code: "NOT_FOUND" });

      const membership = workspace.members.find(
        (m) => m.userId === ctx.user.id
      );
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      return { ...workspace, currentRole: membership.role };
    }),

  /**
   * Create a new workspace.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(48).optional(),
        gradient: z.string().max(20).optional().default("sunset"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug
        ? await generateUniqueSlug(input.slug)
        : await generateUniqueSlug(input.name);

      const workspace = await db.$transaction(async (tx) => {
        const ws = await tx.workspace.create({
          data: {
            name: input.name,
            slug,
            isPersonal: false,
            gradient: input.gradient ?? "sunset",
            ownerId: ctx.user.id,
            planTier: "FREE",
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: ws.id,
            userId: ctx.user.id,
            role: "OWNER",
          },
        });

        // Seed default workflow statuses
        await tx.workflowStatus.createMany({
          data: DEFAULT_STATUSES.map((s) => ({
            name: s.name,
            color: s.color,
            category: s.category,
            position: s.position,
            isDefault: s.isDefault,
            isSystem: false,
            workspaceId: ws.id,
          })),
        });

        return ws;
      });

      // Notify user's SSE so sidebar workspace list refreshes
      await publishEvent(ctx.user.id, { type: "refresh" }).catch(() => {});

      return workspace;
    }),

  /**
   * Update workspace name/settings. Admin+ only.
   */
  update: workspaceAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        settings: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return db.workspace.update({
        where: { id: ctx.workspace.id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.settings && { settings: input.settings }),
        },
      });
    }),

  /**
   * Delete workspace. Owner only. Cannot delete personal workspace.
   */
  delete: workspaceProcedure
    .mutation(async ({ ctx }) => {
      if (!canManageWorkspace(ctx.workspaceRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete a workspace" });
      }
      if (ctx.workspace.isPersonal) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete personal workspace" });
      }

      // Purge the workspace's mem0 memory (erasure path) before the row is gone.
      // Non-throwing — a memory-store failure must not block the deletion.
      await clearWorkspaceMemory(ctx.workspace.id, ctx.user.id);
      await db.workspace.delete({ where: { id: ctx.workspace.id } });
      return { success: true };
    }),

  /**
   * List workspace members.
   */
  listMembers: workspaceProcedure.query(async ({ ctx }) => {
    return db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
  }),

  /**
   * Invite a member by email. Admin+ only.
   */
  inviteMember: workspaceAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUser = await db.user.findUnique({
        where: { email: input.email },
      });
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No user found with that email. They must sign up first.",
        });
      }

      // Check if already a member
      const existing = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspace.id,
            userId: targetUser.id,
          },
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this workspace",
        });
      }

      return db.workspaceMember.create({
        data: {
          workspaceId: ctx.workspace.id,
          userId: targetUser.id,
          role: input.role,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
    }),

  /**
   * Remove a member. Admin+ only. Cannot remove the owner.
   */
  removeMember: workspaceAdminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Cannot remove the owner
      const member = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspace.id,
            userId: input.userId,
          },
        },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });
      if (member.role === "OWNER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove the workspace owner",
        });
      }

      await db.workspaceMember.delete({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspace.id,
            userId: input.userId,
          },
        },
      });
      return { success: true };
    }),

  /**
   * Update a member's role. Admin+ only.
   */
  updateMemberRole: workspaceAdminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspace.id,
            userId: input.userId,
          },
        },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });
      if (member.role === "OWNER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change the owner's role",
        });
      }

      return db.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspace.id,
            userId: input.userId,
          },
        },
        data: { role: input.role },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
    }),

  /**
   * Leave a workspace. Any non-owner member.
   */
  leave: workspaceProcedure.mutation(async ({ ctx }) => {
    if (ctx.workspaceRole === "OWNER") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Owner cannot leave. Transfer ownership first.",
      });
    }

    await db.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspace.id,
          userId: ctx.user.id,
        },
      },
    });
    return { success: true };
  }),
});
