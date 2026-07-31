import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure, workspaceWriteProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { hasFeature } from "@backend/lib/billing/plans";
import { executeAgentAction } from "@backend/lib/agent/execute";
import { scanWorkspace } from "@backend/lib/agent/engine";
import { actionButtons } from "@backend/lib/agent/action-spec";
import { writeAudit } from "@backend/lib/agent/audit";
import { publishWorkspaceEvent } from "@backend/lib/realtime";

export const agentActionRouter = router({
  /** Proposed actions for the feed. Defaults to still-open (PENDING/FAILED). */
  list: workspaceProcedure
    .input(z.object({ includeResolved: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await db.agentAction.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          ...(input?.includeResolved ? {} : { status: { in: ["PENDING", "FAILED"] } }),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      // Attach the self-describing action buttons (concrete verb + polarity) so the
      // feed shows what approving does instead of a vague "Approve".
      return rows.map((r) => ({ ...r, buttons: actionButtons(r.type) }));
    }),

  /** Count of open (PENDING) actions — powers the nav badge. */
  pendingCount: workspaceProcedure.query(async ({ ctx }) => {
    return db.agentAction.count({ where: { workspaceId: ctx.workspace.id, status: "PENDING" } });
  }),

  /** Approve → execute the write (PRO+) → audit. */
  approve: workspaceWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const action = await db.agentAction.findUnique({ where: { id: input.id } });
      if (!action || action.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (action.status !== "PENDING" && action.status !== "FAILED") {
        return { ok: false, reason: "not_pending" as const };
      }

      // Execution is the plan-gated "write" step. Reads/proposals are free.
      const allowed =
        hasFeature(ctx.workspace.planTier, "agentActions") ||
        hasFeature(ctx.user.planTier, "agentActions");
      if (!allowed) {
        return { ok: false, upgradeRequired: true as const };
      }

      await db.agentAction.update({
        where: { id: action.id },
        data: { status: "APPROVED", approvedBy: ctx.user.id, approvedAt: new Date() },
      });

      try {
        const result = await executeAgentAction(action);
        await db.agentAction.update({
          where: { id: action.id },
          data: { status: "EXECUTED", executedAt: new Date(), error: null },
        });
        await writeAudit({
          workspaceId: ctx.workspace.id,
          actorType: "USER",
          actorId: ctx.user.id,
          action: "agent_action.approved",
          targetType: "AgentAction",
          targetId: action.id,
          metadata: { type: action.type, summary: result.summary },
        });
        await publishWorkspaceEvent(ctx.workspace.id, { type: "refresh" }).catch(() => {});
        return { ok: true, summary: result.summary };
      } catch (err) {
        await db.agentAction.update({
          where: { id: action.id },
          data: { status: "FAILED", error: String(err) },
        });
        await writeAudit({
          workspaceId: ctx.workspace.id,
          actorType: "USER",
          actorId: ctx.user.id,
          action: "agent_action.failed",
          targetType: "AgentAction",
          targetId: action.id,
          metadata: { type: action.type, error: String(err) },
        });
        return { ok: false, error: String(err) };
      }
    }),

  reject: workspaceWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const action = await db.agentAction.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
      });
      if (!action) throw new TRPCError({ code: "NOT_FOUND" });
      await db.agentAction.update({ where: { id: action.id }, data: { status: "REJECTED" } });
      await writeAudit({
        workspaceId: ctx.workspace.id,
        actorType: "USER",
        actorId: ctx.user.id,
        action: "agent_action.rejected",
        targetType: "AgentAction",
        targetId: action.id,
        metadata: { type: action.type },
      });
      await publishWorkspaceEvent(ctx.workspace.id, { type: "refresh" }).catch(() => {});
      return { ok: true };
    }),

  dismiss: workspaceWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const action = await db.agentAction.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
      });
      if (!action) throw new TRPCError({ code: "NOT_FOUND" });
      await db.agentAction.update({ where: { id: action.id }, data: { status: "DISMISSED" } });
      await publishWorkspaceEvent(ctx.workspace.id, { type: "refresh" }).catch(() => {});
      return { ok: true };
    }),

  /** Manually run the proactive scan now (useful before the cron fires). */
  scanNow: workspaceWriteProcedure.mutation(async ({ ctx }) => {
    const res = await scanWorkspace(ctx.workspace.id);
    await publishWorkspaceEvent(ctx.workspace.id, { type: "refresh" }).catch(() => {});
    return res;
  }),
});
