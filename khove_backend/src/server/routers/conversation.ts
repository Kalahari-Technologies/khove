import { z } from "zod";
import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";

export const conversationRouter = router({
  /** Recent conversations for the sidebar (current user, active workspace). */
  list: workspaceProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      return db.conversation.findMany({
        where: { workspaceId: ctx.workspace.id, userId: ctx.user.id },
        orderBy: { updatedAt: "desc" },
        take: input?.limit ?? 20,
        select: { id: true, title: true, updatedAt: true },
      });
    }),

  /** A single conversation (with messages) — current user, active workspace. */
  get: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return db.conversation.findFirst({
        where: { id: input.id, userId: ctx.user.id, workspaceId: ctx.workspace.id },
      });
    }),
});
