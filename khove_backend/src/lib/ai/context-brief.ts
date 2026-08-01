import { redis } from "@backend/lib/redis";
import { db } from "@backend/lib/db";
import { computeInitiativeDelivery } from "@backend/lib/intelligence/delivery";
import { computeSprints } from "@backend/lib/intelligence/jira-sprints";

/**
 * A cheap "state of the workspace" brief folded into the system prompt so the AI
 * starts grounded in delivery reality (at-risk initiatives, active-sprint pace)
 * instead of blind — the Context-Builder step of the context engine. Pure
 * formatting over the existing intelligence layer (no LLM call); Redis-cached so
 * the fold runs at most once per TTL per workspace, not on every message.
 */
const BRIEF_TTL_SECONDS = 60 * 10; // 10 min — fresh enough for a prompt hint
const MAX_INITIATIVES = 8;
const briefKey = (workspaceId: string) => `ai:brief:${workspaceId}`;

/** Cached workspace brief for the system prompt, or undefined when there's nothing notable. */
export async function getWorkspaceBrief(workspaceId: string): Promise<string | undefined> {
  if (!workspaceId) return undefined;
  try {
    const cached = await redis.get<string>(briefKey(workspaceId));
    if (cached != null) return cached || undefined; // "" = computed-but-empty (skip recompute)
    const brief = await computeBrief(workspaceId);
    await redis.set(briefKey(workspaceId), brief ?? "", { ex: BRIEF_TTL_SECONDS });
    return brief || undefined;
  } catch (err) {
    console.error("[context-brief] failed:", err);
    return undefined;
  }
}

async function computeBrief(workspaceId: string): Promise<string> {
  const sections: string[] = [];

  // At-risk initiatives (Threads with a target date whose delivery is slipping).
  const initiatives = await db.thread.findMany({
    where: { workspaceId, targetDate: { not: null }, status: { in: ["OPEN", "ACTIVE"] } },
    select: { id: true, title: true },
    take: MAX_INITIATIVES,
  });
  const risky: string[] = [];
  for (const t of initiatives) {
    const d = await computeInitiativeDelivery(workspaceId, t.id);
    if (d && (d.health === "AT_RISK" || d.health === "SLIPPING")) {
      const late = d.daysProjectedVsTarget;
      const lateStr = late != null && late > 0 ? `, ~${late}d late` : "";
      const b = d.blockers[0];
      const blk = b ? ` — blocker: ${b.title} (${b.reason})` : "";
      risky.push(`- ${t.title}: ${d.health}${lateStr}${blk}`);
    }
  }
  if (risky.length) sections.push(`At-risk initiatives:\n${risky.join("\n")}`);

  // Active sprint pace.
  const sprints = await computeSprints(workspaceId);
  const active = sprints.find((s) => s.state === "active");
  if (active) {
    const unit = active.hasPoints
      ? `${active.donePoints}/${active.committedPoints} pts`
      : `${active.doneIssues}/${active.totalIssues} issues`;
    const days = active.daysRemaining != null ? `, ${active.daysRemaining}d left` : "";
    sections.push(`Active sprint "${active.name}": ${unit} done${days}.`);
  }

  return sections.join("\n\n");
}
