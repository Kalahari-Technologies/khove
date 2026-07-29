import { z } from "zod";
import { router, workspaceProcedure, workspaceWriteProcedure } from "@backend/server/trpc";
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
        // lastReadAt lets the client compute "unseen" (updatedAt > lastReadAt).
        select: { id: true, title: true, updatedAt: true, lastReadAt: true },
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

  /** Mark a conversation as read (clears its "unseen reply" indicator). */
  markRead: workspaceWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Raw UPDATE so we DON'T trigger @updatedAt — a normal Prisma update would
      // bump updatedAt to the write time, pushing it past lastReadAt and leaving
      // the conversation permanently "unseen" (updatedAt > lastReadAt).
      await db.$executeRaw`
        UPDATE "Conversation"
        SET "lastReadAt" = NOW()
        WHERE "id" = ${input.id}
          AND "userId" = ${ctx.user.id}
          AND "workspaceId" = ${ctx.workspace.id}`;
      return { ok: true };
    }),

  /** Rename a conversation (user-set title). */
  rename: workspaceWriteProcedure
    .input(z.object({ id: z.string(), title: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      // Raw UPDATE — renaming shouldn't mark the conversation unread either.
      await db.$executeRaw`
        UPDATE "Conversation"
        SET "title" = ${input.title}
        WHERE "id" = ${input.id}
          AND "userId" = ${ctx.user.id}
          AND "workspaceId" = ${ctx.workspace.id}`;
      return { ok: true, title: input.title };
    }),
});
