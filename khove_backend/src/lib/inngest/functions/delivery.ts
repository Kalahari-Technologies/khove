import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { scanDeliveryRisks } from "@backend/lib/agent/delivery-risk";

/**
 * Delivery-intelligence cron — each morning, recompute every initiative's health
 * (Threads with a targetDate) and draft an evidence-backed delivery-risk proposal
 * for any projected to land late. Drafts stay PENDING until approved (execution is
 * PRO+, audited).
 */
export const deliveryRiskScan = inngest.createFunction(
  { id: "delivery-risk-scan", triggers: [{ cron: "0 7 * * *" }] }, // daily 07:00 UTC
  async ({ step }) => {
    const workspaces = await step.run("find-initiative-workspaces", async () => {
      const rows = await db.thread.findMany({
        where: { targetDate: { not: null }, status: { in: ["OPEN", "ACTIVE"] } },
        select: { workspaceId: true },
        distinct: ["workspaceId"],
      });
      return rows.map((r) => r.workspaceId);
    });

    let created = 0;
    for (const workspaceId of workspaces) {
      const res = await step.run(`risk-${workspaceId}`, async () => {
        try {
          return await scanDeliveryRisks(workspaceId);
        } catch (err) {
          console.error(`[delivery-risk] ${workspaceId} failed`, err);
          return { created: 0, total: 0 };
        }
      });
      created += res.created;
    }
    return { workspaces: workspaces.length, created };
  },
);
