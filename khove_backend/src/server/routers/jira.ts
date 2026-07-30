import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure, workspaceWriteProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { transitionJiraIssue } from "@backend/lib/integrations/jira";
import { publishWorkspaceEvent } from "@backend/lib/realtime";

export const jiraRouter = router({
  /**
   * The workspace's inbound webhook URL (secret-in-path) for optional instant sprint
   * updates via a customer-configured Jira Automation → "send web request" rule.
   * Returns { url: null } when Jira isn't connected / no secret is provisioned yet.
   */
  webhookInfo: workspaceProcedure.query(async ({ ctx }) => {
    const integ = await db.integration.findFirst({
      where: { workspaceId: ctx.workspace.id, provider: "JIRA", isActive: true },
      select: { metadata: true },
    });
    const secret = ((integ?.metadata ?? {}) as Record<string, unknown>).webhookSecret as string | undefined;
    if (!secret) return { url: null as string | null };
    const base = process.env.BACKEND_URL ?? "http://localhost:4000";
    return { url: `${base}/api/webhooks/jira/${secret}` as string | null };
  }),

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
