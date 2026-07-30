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
import { generateThreadNarrative } from "@backend/lib/threads/narrative";
import { suggestThreads } from "@backend/lib/threads/suggest";
import { publishWorkspaceEvent } from "@backend/lib/realtime";
import { db } from "@backend/lib/db";
import { computeInitiativeDelivery, refreshInitiativeHealth } from "@backend/lib/intelligence/delivery";

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

  /** Make a thread an initiative (or clear it) by setting a target/start date. */
  setTarget: workspaceWriteProcedure
    .input(
      z.object({
        id: z.string(),
        targetDate: z.string().nullable(),
        startedAt: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const thread = await getThread(ctx.workspace.id, input.id);
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });
      await db.thread.update({
        where: { id: input.id },
        data: {
          targetDate: input.targetDate ? new Date(input.targetDate) : null,
          ...(input.startedAt !== undefined && { startedAt: input.startedAt ? new Date(input.startedAt) : null }),
        },
      });
      const delivery = await refreshInitiativeHealth(ctx.workspace.id, input.id);
      await publishWorkspaceEvent(ctx.workspace.id, { type: "thread.updated", threadId: input.id }).catch(() => {});
      return { ok: true, delivery };
    }),

  /** Delivery confidence for an initiative — burn-up, velocity, projection, health. */
  delivery: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return computeInitiativeDelivery(ctx.workspace.id, input.id);
    }),

  /** AI context-aware narrative for a thread — generated on open, cached until it changes. */
  narrative: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return generateThreadNarrative(ctx.workspace.id, input.id);
    }),

  /** Scan for related work and draft approval-gated SUGGEST_THREAD proposals. */
  suggestNow: workspaceWriteProcedure.mutation(async ({ ctx }) => {
    const result = await suggestThreads(ctx.workspace.id, ctx.user!.id);
    await publishWorkspaceEvent(ctx.workspace.id, { type: "agent-action.created", actionId: "suggest" }).catch(() => {});
    return result;
  }),
});
