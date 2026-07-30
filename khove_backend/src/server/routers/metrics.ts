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
import { computeKpis } from "@backend/lib/intelligence/kpis";
import { getShepherdClient, listPullRequests, listIssues } from "@backend/lib/integrations/github";

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

  /** Hero KPI cards — current-vs-previous-window deltas + sparklines from the Signal store. */
  kpis: workspaceProcedure
    .input(
      z
        .object({
          provider: z.enum(["github", "jira", "all"]).optional(),
          windowDays: z.number().min(14).max(180).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return computeKpis(ctx.workspace.id, { provider: input?.provider, windowDays: input?.windowDays });
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

  /**
   * Cross-tool activity timeline — the Signal store folded into a chronological,
   * provider-agnostic feed, joined to each work item's title/url. This is the
   * cockpit centerpiece: one stream showing Jira + GitHub events in order.
   */
  activity: workspaceProcedure
    .input(z.object({ limit: z.number().min(10).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 80;
      const signals = await db.signal.findMany({
        where: { workspaceId: ctx.workspace.id },
        orderBy: { occurredAt: "desc" },
        take: limit,
      });
      const keys = [...new Set(signals.map((s) => s.entityKey))];
      const tasks = keys.length
        ? await db.task.findMany({
            where: { workspaceId: ctx.workspace.id, externalId: { in: keys } },
            select: { externalId: true, title: true, externalUrl: true },
          })
        : [];
      const byKey = new Map(tasks.map((t) => [t.externalId ?? "", t]));
      return signals.map((s) => {
        const t = byKey.get(s.entityKey);
        return {
          id: s.id,
          provider: s.provider,
          kind: s.kind,
          entityType: s.entityType,
          entityKey: s.entityKey,
          title: t?.title ?? null,
          url: t?.externalUrl ?? null,
          source: s.source,
          actor: s.actorKey,
          occurredAt: s.occurredAt.toISOString(),
        };
      });
    }),

  /**
   * GitHub PRs / issues by state (open | closed | all), fetched LIVE from GitHub
   * across the workspace's scoped repos. The Task store only holds OPEN items
   * (closed become merge Signals), so the PRs/Issues sub-tabs read this to offer
   * an Open/Closed/All view.
   */
  githubItems: workspaceProcedure
    .input(z.object({ kind: z.enum(["pr", "issue"]), state: z.enum(["open", "closed", "all"]) }))
    .query(async ({ ctx, input }) => {
      const integ = await db.integration.findFirst({
        where: { workspaceId: ctx.workspace.id, provider: "GITHUB", isActive: true },
        select: { metadata: true },
      });
      if (!integ) return [];
      const meta = (integ.metadata ?? {}) as Record<string, unknown>;
      const scoped = (meta.scope as { repos?: string[] } | undefined)?.repos;
      const synced = meta.syncedRepos as string[] | undefined;
      const repos = (scoped && scoped.length ? scoped : synced) ?? [];
      const client = await getShepherdClient(ctx.workspace.id).catch(() => undefined);

      type Row = {
        id: string;
        number: number;
        title: string;
        repo: string;
        author: string | null;
        state: string;
        draft: boolean;
        url: string | null;
        labels: string[];
        updatedAt: string | null;
      };
      const rows: Row[] = [];
      for (const full of repos.slice(0, 15)) {
        const [owner, name] = full.split("/");
        if (!owner || !name) continue;
        try {
          if (input.kind === "pr") {
            const prs = await listPullRequests(ctx.workspace.id, owner, name, input.state, 30, client);
            for (const p of prs)
              rows.push({
                id: `${full}#${p.number}`,
                number: p.number,
                title: p.title,
                repo: full,
                author: p.author ?? null,
                state: p.mergedAt ? "merged" : p.state,
                draft: !!p.draft,
                url: p.url,
                labels: p.labels ?? [],
                updatedAt: p.updatedAt ?? null,
              });
          } else {
            const issues = await listIssues(ctx.workspace.id, owner, name, input.state, 30, client);
            for (const i of issues)
              rows.push({
                id: `${full}#${i.number}`,
                number: i.number,
                title: i.title,
                repo: full,
                author: i.author ?? null,
                state: i.state,
                draft: false,
                url: i.url,
                labels: i.labels ?? [],
                updatedAt: i.updatedAt ?? null,
              });
          }
        } catch {
          /* skip a repo that fails */
        }
      }
      rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      return rows;
    }),

  /** Generate a weekly status report (AI, cheapest model). Mutation — user-triggered. */
  statusReport: workspaceProcedure.mutation(async ({ ctx }) => {
    return generateStatusReport(ctx.workspace.id);
  }),
});
