import { tool, zodSchema } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";

type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
type TaskSource = "KHOVE" | "GITHUB" | "JIRA" | "AI";
type StatusCategory =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";

/**
 * Task tools — available to all tiers (FREE and above).
 * Every execute() is wrapped in try/catch — tool failures never crash the conversation.
 */
export function getTaskTools(userId: string) {
  return {
    createTask: tool({
      description:
        "Create a new task for the user. Use this when the user asks to add, create, or track something.",
      inputSchema: zodSchema(
        z.object({
          title: z.string().describe("The task title — clear and action-oriented"),
          priority: z
            .enum(["URGENT", "HIGH", "MEDIUM", "LOW"])
            .optional()
            .default("MEDIUM")
            .describe("Task priority"),
          dueDate: z
            .string()
            .optional()
            .describe("ISO 8601 due date, e.g. 2025-06-15"),
          workspaceId: z.string().optional().describe("Workspace to assign the task to"),
        })
      ),
      execute: async ({ title, priority, dueDate, workspaceId }) => {
        try {
          const defaultStatus = await db.workflowStatus.findFirst({
            where: { category: "NOT_STARTED", workspaceId: null, isDefault: true },
          });

          const task = await db.task.create({
            data: {
              title,
              priority: (priority ?? "MEDIUM") as Priority,
              dueDate: dueDate ? new Date(dueDate) : undefined,
              source: "AI" as TaskSource,
              userId,
              workspaceId: workspaceId ?? null,
              statusId: defaultStatus?.id ?? null,
            },
            include: { status: true },
          });

          return {
            success: true,
            task: {
              id: task.id,
              title: task.title,
              priority: task.priority,
              status: task.status?.name ?? "Todo",
              dueDate: task.dueDate?.toISOString() ?? null,
            },
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    listTasks: tool({
      description:
        "List the user's tasks. Filter by status category or show all.",
      inputSchema: zodSchema(
        z.object({
          statusCategory: z
            .enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"])
            .optional()
            .describe("Filter by status category"),
          limit: z
            .number()
            .optional()
            .default(10)
            .describe("Max tasks to return (default 10)"),
          workspaceId: z.string().optional(),
        })
      ),
      execute: async ({ statusCategory, limit, workspaceId }) => {
        try {
          const tasks = await db.task.findMany({
            where: {
              userId,
              ...(workspaceId && { workspaceId }),
              ...(statusCategory && {
                status: { category: statusCategory as StatusCategory },
              }),
              ...(!statusCategory && {
                NOT: { status: { category: "CANCELLED" as StatusCategory } },
              }),
            },
            include: { status: true },
            orderBy: [
              { status: { position: "asc" } },
              { createdAt: "desc" },
            ],
            take: limit ?? 10,
          });

          return {
            success: true,
            count: tasks.length,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              status: t.status?.name ?? "No Status",
              statusCategory: t.status?.category ?? null,
              dueDate: t.dueDate?.toISOString() ?? null,
              source: t.source,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    updateTask: tool({
      description:
        "Update a task's title, priority, due date, or status. Use the task ID from a previous listTasks call.",
      inputSchema: zodSchema(
        z.object({
          taskId: z.string().describe("The task ID to update"),
          title: z.string().optional().describe("New title"),
          priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
          dueDate: z
            .string()
            .optional()
            .describe("New due date (ISO 8601) or empty string to clear"),
          statusCategory: z
            .enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"])
            .optional()
            .describe(
              "New status category — AI always uses category, never status name strings"
            ),
          workspaceId: z.string().optional(),
        })
      ),
      execute: async ({ taskId, title, priority, dueDate, statusCategory, workspaceId }) => {
        try {
          const task = await db.task.findFirst({
            where: { id: taskId, userId },
          });
          if (!task) return { success: false, error: "Task not found" };

          let statusId = task.statusId;
          if (statusCategory) {
            const status = await db.workflowStatus.findFirst({
              where: {
                category: statusCategory as StatusCategory,
                OR: [
                  { workspaceId: workspaceId ?? task.workspaceId ?? null },
                  { workspaceId: null },
                ],
              },
              orderBy: { workspaceId: "desc" },
            });
            if (status) statusId = status.id;
          }

          const updated = await db.task.update({
            where: { id: taskId },
            data: {
              ...(title !== undefined && { title }),
              ...(priority !== undefined && { priority: priority as Priority }),
              ...(dueDate !== undefined && {
                dueDate: dueDate ? new Date(dueDate) : null,
              }),
              statusId,
            },
            include: { status: true },
          });

          return {
            success: true,
            task: {
              id: updated.id,
              title: updated.title,
              priority: updated.priority,
              status: updated.status?.name ?? "No Status",
              dueDate: updated.dueDate?.toISOString() ?? null,
            },
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    deleteTask: tool({
      description:
        "Mark a task as cancelled (soft delete). Tasks are never hard-deleted.",
      inputSchema: zodSchema(
        z.object({
          taskId: z.string().describe("The task ID to cancel"),
        })
      ),
      execute: async ({ taskId }) => {
        try {
          const task = await db.task.findFirst({
            where: { id: taskId, userId },
          });
          if (!task) return { success: false, error: "Task not found" };

          const cancelledStatus = await db.workflowStatus.findFirst({
            where: { category: "CANCELLED", workspaceId: null },
          });

          await db.task.update({
            where: { id: taskId },
            data: { statusId: cancelledStatus?.id ?? null },
          });

          return { success: true, taskId };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}
