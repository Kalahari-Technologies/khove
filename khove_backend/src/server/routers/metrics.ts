import { z } from "zod";
import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";
import { computeFlowMetrics } from "@backend/lib/intelligence/flow";
import { computeScopeIntegrity } from "@backend/lib/intelligence/correlate";
import { generateStatusReport } from "@backend/lib/intelligence/status-report";
import { computeSprints, computeSprintBurndown } from "@backend/lib/intelligence/jira-sprints";
import { computeEpics, computeReleases, entityIssues } from "@backend/lib/intelligence/jira-entities";
import {
  computeRepos,
  computeMilestones,
  computeGithubReleases,
  githubEntityIssues,
} from "@backend/lib/intelligence/github-entities";
import { computeEpicChain, computeCrossToolIntegrity } from "@backend/lib/intelligence/cross-links";

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

  /** Jira sprint intelligence — active sprint committed vs done points/issues. */
  sprints: workspaceProcedure.query(async ({ ctx }) => {
    return computeSprints(ctx.workspace.id);
  }),

  /** Sprint burndown — remaining points per day vs. the ideal line. */
  sprintBurndown: workspaceProcedure
    .input(z.object({ sprintName: z.string() }))
    .query(async ({ ctx, input }) => {
      return computeSprintBurndown(ctx.workspace.id, input.sprintName);
    }),

  /** Epic progress — % done + points, per epic. */
  epics: workspaceProcedure.query(async ({ ctx }) => {
    return computeEpics(ctx.workspace.id);
  }),

  /** Release readiness — issues done vs total, per fix version. */
  releases: workspaceProcedure.query(async ({ ctx }) => {
    return computeReleases(ctx.workspace.id);
  }),

  /** Drill-down — the Jira issues in a sprint / epic / release. */
  entityIssues: workspaceProcedure
    .input(z.object({ kind: z.enum(["SPRINT", "EPIC", "RELEASE"]), key: z.string() }))
    .query(async ({ ctx, input }) => {
      return entityIssues(ctx.workspace.id, input.kind, input.key);
    }),

  /** GitHub repositories (the product map) with open PR/issue counts. */
  githubRepos: workspaceProcedure.query(async ({ ctx }) => {
    return computeRepos(ctx.workspace.id);
  }),

  /** GitHub milestones — readiness (open vs closed issues + due date). */
  githubMilestones: workspaceProcedure.query(async ({ ctx }) => {
    return computeMilestones(ctx.workspace.id);
  }),

  /** GitHub recent releases. */
  githubReleases: workspaceProcedure.query(async ({ ctx }) => {
    return computeGithubReleases(ctx.workspace.id);
  }),

  /** Drill-down — the PRs/issues in a GitHub repository or milestone. */
  githubEntityIssues: workspaceProcedure
    .input(z.object({ kind: z.enum(["REPOSITORY", "MILESTONE"]), key: z.string() }))
    .query(async ({ ctx, input }) => {
      return githubEntityIssues(ctx.workspace.id, input.kind, input.key);
    }),

  /** Cross-tool: an epic's stories, each with the GitHub PRs implementing it. */
  epicChain: workspaceProcedure
    .input(z.object({ epicKey: z.string() }))
    .query(async ({ ctx, input }) => {
      return computeEpicChain(ctx.workspace.id, input.epicKey);
    }),

  /** Cross-tool delivery gaps — where Jira status and merged code disagree. */
  crossToolIntegrity: workspaceProcedure.query(async ({ ctx }) => {
    return computeCrossToolIntegrity(ctx.workspace.id);
  }),

  /** Generate a weekly status report (AI, cheapest model). Mutation — user-triggered. */
  statusReport: workspaceProcedure.mutation(async ({ ctx }) => {
    return generateStatusReport(ctx.workspace.id);
  }),
});
