import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { shepherdScanWorkspace } from "@backend/lib/agent/shepherd";

/**
 * PR Shepherd cron — twice a day, scan every workspace with an active GitHub
 * install for open PRs that warrant a nudge (stalled review, no reviewer, red
 * CI). Catches time-based staleness the webhook can't. Drafts stay PENDING until
 * a human approves them (execution is PRO+).
 */
export const shepherdScan = inngest.createFunction(
  {
    id: "pr-shepherd-scan",
    triggers: [{ cron: "0 9,13 * * *" }], // 09:00 & 13:00 UTC
  },
  async ({ step }) => {
    const workspaces = await step.run("find-github-workspaces", async () => {
      const rows = await db.integration.findMany({
        where: { provider: "GITHUB", isActive: true },
        select: { workspaceId: true },
      });
      return [...new Set(rows.map((r) => r.workspaceId))];
    });

    let created = 0;
    for (const workspaceId of workspaces) {
      const res = await step.run(`shepherd-${workspaceId}`, async () => {
        try {
          return await shepherdScanWorkspace(workspaceId);
        } catch (err) {
          console.error(`[pr-shepherd] ${workspaceId} failed`, err);
          return { created: 0, total: 0 };
        }
      });
      created += res.created;
    }

    return { workspaces: workspaces.length, created };
  },
);
