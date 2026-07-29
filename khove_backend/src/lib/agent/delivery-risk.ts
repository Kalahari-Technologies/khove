import type { Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";
import { persistDrafts, type DraftAction } from "@backend/lib/agent/engine";
import { computeInitiativeDelivery } from "@backend/lib/intelligence/delivery";

const fmt = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

/**
 * Scan a workspace's initiatives (Threads with a targetDate) and draft an
 * evidence-backed delivery-risk proposal for any that are projected to land late.
 * Reuses the governed persistDrafts path (approve → execute → audit).
 */
export async function scanDeliveryRisks(workspaceId: string): Promise<{ created: number; total: number }> {
  const initiatives = await db.thread.findMany({
    where: { workspaceId, targetDate: { not: null }, status: { in: ["OPEN", "ACTIVE"] } },
    select: { id: true, title: true },
  });

  const drafts: DraftAction[] = [];
  for (const thread of initiatives) {
    const d = await computeInitiativeDelivery(workspaceId, thread.id);
    if (!d) continue;
    // Persist the recomputed verdict.
    await db.thread.update({ where: { id: thread.id }, data: { health: d.health } }).catch(() => {});

    if ((d.health !== "AT_RISK" && d.health !== "SLIPPING") || d.remaining === 0) continue;

    const late = d.daysProjectedVsTarget;
    const blockerLine = d.blockers.length
      ? `Top blocker: ${d.blockers[0].title} (${d.blockers[0].reason}).`
      : "No single blocker stands out — the merge rate is simply too low.";
    const projLine =
      d.projectedFinish && late != null
        ? `Projected finish ${fmt(d.projectedFinish)} — ${late} day${late === 1 ? "" : "s"} after the ${fmt(d.targetDate)} target.`
        : `Nothing has merged recently and ${d.remaining} item${d.remaining === 1 ? "" : "s"} remain before the ${fmt(d.targetDate)} target.`;

    drafts.push({
      type: "FLAG_RISK",
      dedupeKey: `risk:${thread.id}`,
      title: `"${thread.title}" is ${d.health === "SLIPPING" ? "slipping" : "at risk"}`,
      rationale: `${projLine} ${d.done}/${d.total} merged at ${d.velocityPerWeek}/week. ${blockerLine}`,
      confidence: d.health === "SLIPPING" ? 0.85 : 0.7,
      sources: [
        { kind: "thread", id: thread.id, title: thread.title },
        ...d.blockers.slice(0, 3).map((b) => ({ kind: "task", id: b.taskId, title: b.title })),
      ] as unknown as Prisma.InputJsonValue,
      payload: {
        threadId: thread.id,
        title: thread.title,
        projectedFinish: d.projectedFinish,
        targetDate: d.targetDate,
        daysLate: late,
        blockers: d.blockers.slice(0, 5),
      } as unknown as Prisma.InputJsonValue,
      threadId: thread.id,
    });
  }

  return persistDrafts(workspaceId, drafts, "agent:delivery-intelligence");
}
