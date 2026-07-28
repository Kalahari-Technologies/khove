import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure, workspaceWriteProcedure } from "@backend/server/trpc";
import {
  createThread,
  listThreads,
  getThread,
  linkToThread,
  unlinkFromThread,
  autoLinkMeeting,
} from "@backend/lib/threads";
import { publishWorkspaceEvent } from "@backend/lib/realtime";

const LINK_KINDS = ["TASK", "CALENDAR_EVENT", "GITHUB_PR", "GITHUB_ISSUE", "PERSON", "JIRA_ISSUE"] as const;

export const threadRouter = router({
  list: workspaceProcedure
    .input(z.object({ status: z.enum(["OPEN", "ACTIVE", "RESOLVED", "ARCHIVED"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return listThreads(ctx.workspace.id, { status: input?.status });
    }),

  get: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const thread = await getThread(ctx.workspace.id, input.id);
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });
      return thread;
    }),

  create: workspaceWriteProcedure
    .input(z.object({ title: z.string().min(1), summary: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const thread = await createThread(ctx.workspace.id, input);
      await publishWorkspaceEvent(ctx.workspace.id, { type: "thread.updated", threadId: thread.id }).catch(() => {});
      return thread;
    }),

  link: workspaceWriteProcedure
    .input(
      z.object({
        threadId: z.string(),
        kind: z.enum(LINK_KINDS),
        refId: z.string(),
        refUrl: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await linkToThread(ctx.workspace.id, input.threadId, input);
      await publishWorkspaceEvent(ctx.workspace.id, { type: "thread.updated", threadId: input.threadId }).catch(() => {});
      return { ok: true };
    }),

  /** Attach a meeting Task and auto-derive its GitHub + people links. */
  attachMeeting: workspaceWriteProcedure
    .input(z.object({ threadId: z.string(), taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await autoLinkMeeting(ctx.workspace.id, input.threadId, input.taskId);
      await publishWorkspaceEvent(ctx.workspace.id, { type: "thread.updated", threadId: input.threadId }).catch(() => {});
      return result;
    }),

  unlink: workspaceWriteProcedure
    .input(z.object({ linkId: z.string(), threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await unlinkFromThread(ctx.workspace.id, input.linkId);
      await publishWorkspaceEvent(ctx.workspace.id, { type: "thread.updated", threadId: input.threadId }).catch(() => {});
      return { ok: true };
    }),
});
