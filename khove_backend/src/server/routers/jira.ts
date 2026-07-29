import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceWriteProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { transitionJiraIssue } from "@backend/lib/integrations/jira";
import { publishWorkspaceEvent } from "@backend/lib/realtime";

export const jiraRouter = router({
  /**
   * Move a Jira issue to a new status category via the transitions API (the kanban
   * drag). Also caches the new category on the local Jira Task so the board survives
   * a refresh before the webhook/poll re-syncs.
   */
  transitionIssue: workspaceWriteProcedure
    .input(
      z.object({
        issueKey: z.string(),
        category: z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await transitionJiraIssue(ctx.workspace.id, input.issueKey, input.category);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Jira transition failed" });
      }

      // Reflect the move on the cached Task so the board doesn't snap back on refresh.
      const externalId = `jira-${input.issueKey}`;
      const task = await db.task.findFirst({
        where: { workspaceId: ctx.workspace.id, externalId },
        select: { id: true, metadata: true },
      });
      if (task) {
        const meta = (task.metadata ?? {}) as Record<string, unknown>;
        const jira = (meta.jira ?? {}) as Record<string, unknown>;
        jira.statusCategory = input.category;
        if (result.movedTo) jira.status = result.movedTo;
        meta.jira = jira;
        await db.task
          .update({ where: { id: task.id }, data: { metadata: meta as Prisma.InputJsonObject } })
          .catch(() => {});
      }
      await publishWorkspaceEvent(ctx.workspace.id, { type: "task.updated", taskId: externalId }).catch(() => {});

      return result;
    }),
});
