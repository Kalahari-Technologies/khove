import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  workspaceProcedure,
  workspaceWriteProcedure,
} from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import type { Priority, TaskSource, AssigneeRole } from "@prisma/client";

const priorityEnum = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]);
const taskSourceEnum = z.enum(["KHOVE", "GITHUB", "JIRA", "AI", "GOOGLE_CALENDAR"]);
const assigneeRoleEnum = z.enum(["OWNER", "ASSIGNEE", "REVIEWER", "OBSERVER"]);

export const taskRouter = router({
  /**
   * List tasks — paginated, filterable by status, source.
   * Scoped to active workspace.
   */
  list: workspaceProcedure
    .input(
      z.object({
        statusId: z.string().optional(),
        source: taskSourceEnum.optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { statusId, source, cursor, limit } = input;

      const tasks = await db.task.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          ...(statusId && { statusId }),
          ...(source && { source: { has: source as TaskSource } }),
        },
        include: {
          status: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy: { createdAt: "desc" },
      });

      const hasMore = tasks.length > limit;
      const items = hasMore ? tasks.slice(0, -1) : tasks;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : undefined,
      };
    }),

  /**
   * Create a task — deduplicates by externalId to prevent double-imports from webhooks.
   * Automatically assigned to active workspace.
   */
  create: workspaceWriteProcedure
    .input(
      z.object({
        title: z.string().min(1).max(500),
        statusId: z.string().optional(),
        priority: priorityEnum.optional().default("MEDIUM"),
        dueDate: z.date().optional(),
        source: taskSourceEnum.optional().default("KHOVE"),
        externalId: z.string().optional(),
        externalUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Dedup check — prevent double-import from webhooks
      if (input.externalId) {
        const existing = await db.task.findFirst({
          where: {
            externalId: input.externalId,
            source: { has: input.source as TaskSource },
            workspaceId: ctx.workspace.id,
          },
        });
        if (existing) return existing;
      }

      return db.task.create({
        data: {
          title: input.title,
          statusId: input.statusId,
          priority: input.priority as Priority,
          dueDate: input.dueDate,
          source: [input.source as TaskSource],
          externalId: input.externalId,
          externalUrl: input.externalUrl,
          userId: ctx.user.id,
          workspaceId: ctx.workspace.id,
        },
        include: { status: true, assignees: true },
      });
    }),

  /**
   * Update a task's mutable fields. Task must belong to active workspace.
   */
  update: workspaceWriteProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500).optional(),
        statusId: z.string().optional(),
        priority: priorityEnum.optional(),
        dueDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const task = await db.task.findFirst({
        where: { id, workspaceId: ctx.workspace.id },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      return db.task.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.statusId !== undefined && { statusId: data.statusId }),
          ...(data.priority !== undefined && { priority: data.priority as Priority }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        },
        include: { status: true, assignees: true },
      });
    }),

  /**
   * Assign users to a task — upserts in a transaction.
   * Task must belong to active workspace.
   */
  assign: workspaceWriteProcedure
    .input(
      z.object({
        taskId: z.string(),
        assignees: z.array(
          z.object({
            userId: z.string(),
            role: assigneeRoleEnum.default("ASSIGNEE"),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.taskId, workspaceId: ctx.workspace.id },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      await db.$transaction(
        input.assignees.map((a) =>
          db.taskAssignee.upsert({
            where: { taskId_userId: { taskId: input.taskId, userId: a.userId } },
            create: {
              taskId: input.taskId,
              userId: a.userId,
              role: a.role as AssigneeRole,
              assignedBy: ctx.user.id,
            },
            update: { role: a.role as AssigneeRole },
          })
        )
      );

      return db.task.findUnique({
        where: { id: input.taskId },
        include: { status: true, assignees: { include: { user: true } } },
      });
    }),

  /**
   * Soft-delete a task by setting status to CANCELLED.
   * Task must belong to active workspace.
   */
  delete: workspaceWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      // Find cancelled status — prefer workspace-specific, fall back to system
      const cancelledStatus = await db.workflowStatus.findFirst({
        where: {
          category: "CANCELLED",
          OR: [
            { workspaceId: ctx.workspace.id },
            { workspaceId: null, isSystem: true },
          ],
        },
        orderBy: { workspaceId: "desc" }, // workspace-specific first (non-null sorts before null desc)
      });

      return db.task.update({
        where: { id: input.id },
        data: { statusId: cancelledStatus?.id ?? null },
      });
    }),
});
