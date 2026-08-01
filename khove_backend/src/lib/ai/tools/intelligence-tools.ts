import { tool, zodSchema } from "ai";
import { z } from "zod";
import { db } from "@backend/lib/db";
import { computeInitiativeDelivery } from "@backend/lib/intelligence/delivery";
import { computeFlowMetrics } from "@backend/lib/intelligence/flow";
import { computeScopeIntegrity } from "@backend/lib/intelligence/correlate";
import { computeCrossToolIntegrity } from "@backend/lib/intelligence/cross-links";
import { computeSprints } from "@backend/lib/intelligence/jira-sprints";

/**
 * Delivery-intelligence tools — the Level-6 "digital twin" (Signal event store +
 * Entity graph + Thread links), surfaced to the LLM. These wrap the SAME functions
 * the dashboard uses (`lib/intelligence/`), so the AI reasons over computed facts
 * (health, blockers, cross-tool gaps) instead of re-deriving them from raw tool
 * calls. Every execute() is try/caught — a tool failure never crashes the chat.
 *
 * Workspace-scoped. Loaded whenever GitHub or Jira is connected.
 */
export function getIntelligenceTools(workspaceId: string) {
  return {
    getDeliveryRisk: tool({
      description:
        "Assess whether the workspace's initiatives will land on time, and why. An initiative is a Connectivity Thread with a target date. Returns each initiative's health (ON_TRACK / AT_RISK / SLIPPING), projected finish vs target, remaining work, and the concrete blockers (e.g. a PR stuck in review). Use for 'is X on track?', 'what's at risk?', 'will we hit the deadline?', 'what's blocking us?'.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          const initiatives = await db.thread.findMany({
            where: { workspaceId, targetDate: { not: null }, status: { in: ["OPEN", "ACTIVE"] } },
            select: { id: true, title: true },
          });
          if (initiatives.length === 0) {
            return { success: true, count: 0, initiatives: [], note: "No initiatives with a target date yet." };
          }
          const rows = (
            await Promise.all(
              initiatives.map(async (t) => {
                const d = await computeInitiativeDelivery(workspaceId, t.id);
                if (!d) return null;
                return {
                  title: t.title,
                  health: d.health,
                  total: d.total,
                  done: d.done,
                  remaining: d.remaining,
                  velocityPerWeek: d.velocityPerWeek,
                  targetDate: d.targetDate,
                  projectedFinish: d.projectedFinish,
                  daysProjectedVsTarget: d.daysProjectedVsTarget, // + = late
                  blockers: d.blockers.map((b) => ({ title: b.title, reason: b.reason })),
                };
              }),
            )
          ).filter((r): r is NonNullable<typeof r> => r !== null);
          return { success: true, count: rows.length, initiatives: rows };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getFlowMetrics: tool({
      description:
        "Engineering flow / DORA-lite metrics for the workspace, folded from the Signal event store: throughput (merges/week), cycle time p50/p90, review latency, deploy frequency. Use for 'how fast are we shipping?', 'what's our cycle time?', 'are we slowing down?'.",
      inputSchema: zodSchema(
        z.object({
          windowDays: z.number().min(14).max(180).optional().describe("Look-back window in days (default 84)."),
          provider: z.enum(["GITHUB", "JIRA"]).optional().describe("Restrict to one source; omit for all."),
        }),
      ),
      execute: async ({ windowDays, provider }) => {
        try {
          const m = await computeFlowMetrics(workspaceId, {
            windowDays,
            providers: provider ? [provider] : undefined,
          });
          // Drop the per-week series arrays — the scalars are what the AI reasons over.
          const { throughputSeries: _t, cycleTimeSeries: _c, ...summary } = m;
          return { success: true, metrics: summary };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getCrossToolGaps: tool({
      description:
        "Where Jira intent and GitHub reality disagree — a cross-tool check only Khove can do. Returns tickets marked Done with no merged PR ('claimed-done fiction') and merged PRs whose ticket isn't Done ('code ahead of ticket'). Use for 'is what we say matching what's built?', 'any tickets done without code?'.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          const gaps = await computeCrossToolIntegrity(workspaceId);
          return {
            success: true,
            linkedTickets: gaps.linkedTickets,
            doneWithOpenPr: gaps.doneWithOpenPr,
            codeAheadOfTicket: gaps.codeAheadOfTicket,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getScopeIntegrity: tool({
      description:
        "Unplanned work: merged PRs not linked to any Connectivity Thread (work happening off-plan). Use for 'what's being built that we didn't plan?', 'how much unplanned work is there?'.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          const s = await computeScopeIntegrity(workspaceId);
          return {
            success: true,
            windowDays: s.windowDays,
            merged: s.merged,
            planned: s.planned,
            unplanned: s.unplanned,
            plannedPct: s.plannedPct,
            unplannedItems: s.unplannedItems.slice(0, 10),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getSprintStatus: tool({
      description:
        "Jira sprint intelligence — for each sprint: state, committed vs completed (story points or issues), and days remaining. Use for 'how's the sprint going?', 'are we on pace this sprint?', 'sprint burndown'.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          const sprints = await computeSprints(workspaceId);
          return {
            success: true,
            count: sprints.length,
            sprints: sprints.map((s) => ({
              name: s.name,
              state: s.state,
              committedPoints: s.committedPoints,
              donePoints: s.donePoints,
              totalIssues: s.totalIssues,
              doneIssues: s.doneIssues,
              daysRemaining: s.daysRemaining,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}
