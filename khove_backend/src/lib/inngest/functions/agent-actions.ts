import { inngest } from "@backend/lib/inngest";
import { db } from "@backend/lib/db";
import { scanWorkspace } from "@backend/lib/agent/engine";

/**
 * Proactive scan — every morning, draft calendar agent actions (block focus,
 * reschedule conflicts, RSVP nudges, suggest threads) for each workspace with an
 * active Google Calendar connection. Read/observe is automatic; the drafted
 * actions stay PENDING until a human approves them.
 */
export const calendarIntelligenceScan = inngest.createFunction(
  {
    id: "calendar-intelligence-scan",
    triggers: [{ cron: "0 8 * * *" }], // daily 08:00 UTC
  },
  async ({ step }) => {
    const integrations = await step.run("find-connected-workspaces", async () => {
      const rows = await db.integration.findMany({
        where: { provider: "GOOGLE_CALENDAR", isActive: true },
        select: { workspaceId: true },
      });
      return [...new Set(rows.map((r) => r.workspaceId))];
    });

    let created = 0;
    for (const workspaceId of integrations) {
      const res = await step.run(`scan-${workspaceId}`, async () => {
        try {
          return await scanWorkspace(workspaceId);
        } catch (err) {
          console.error(`[agent-scan] ${workspaceId} failed`, err);
          return { created: 0, total: 0 };
        }
      });
      created += res.created;
    }

    return { workspaces: integrations.length, created };
  },
);
