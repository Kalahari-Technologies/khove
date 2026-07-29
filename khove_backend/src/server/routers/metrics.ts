import { z } from "zod";
import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { computeFlowMetrics } from "@backend/lib/intelligence/flow";
import { computeScopeIntegrity } from "@backend/lib/intelligence/correlate";
import { generateStatusReport } from "@backend/lib/intelligence/status-report";

export const metricsRouter = router({
  /** Flow metrics (cycle time, throughput, DORA-lite) folded from the Signal store. */
  flow: workspaceProcedure
    .input(
      z
        .object({
          provider: z.enum(["GITHUB", "JIRA"]).optional(),
          windowDays: z.number().min(14).max(180).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const provider = input?.provider ?? "GITHUB";

      // Honor the GitHub workspace scope (the product boundary), if one is set.
      let sources: string[] | undefined;
      if (provider === "GITHUB") {
        const integ = await db.integration.findFirst({
          where: { workspaceId: ctx.workspace.id, provider: "GITHUB", isActive: true },
          select: { metadata: true },
        });
        const scope = ((integ?.metadata ?? {}) as Record<string, unknown>).scope as { repos?: string[] } | undefined;
        if (scope?.repos?.length) sources = scope.repos;
      }

      return computeFlowMetrics(ctx.workspace.id, {
        windowDays: input?.windowDays,
        providers: [provider],
        sources,
      });
    }),

  /** Scope integrity — merged PRs not linked to any Connectivity Thread. */
  scopeIntegrity: workspaceProcedure.query(async ({ ctx }) => {
    return computeScopeIntegrity(ctx.workspace.id);
  }),

  /** Generate a weekly status report (AI, cheapest model). Mutation — user-triggered. */
  statusReport: workspaceProcedure.mutation(async ({ ctx }) => {
    return generateStatusReport(ctx.workspace.id);
  }),
});
