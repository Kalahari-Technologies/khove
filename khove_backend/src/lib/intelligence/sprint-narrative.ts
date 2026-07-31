import { createHash } from "crypto";
import { generateText } from "ai";
import { redis } from "@backend/lib/redis";
import { getFlashModel } from "@backend/lib/ai/providers/google";
import { computeSprints, computeSprintBurndown } from "@backend/lib/intelligence/jira-sprints";

export interface WidgetNarrative {
  text: string;
  generatedAt: string;
  cached: boolean;
}

const TTL = 30 * 86_400; // 30 days — content hash forces regen sooner when data moves.

/**
 * Cached Flash generation keyed by a content hash: return the stored text when the
 * hash still matches (data unchanged), otherwise regenerate once and re-cache. Never
 * throws — a failed generation degrades to null so the widget just hides the blurb.
 */
async function cachedNarrative(cacheKey: string, hashInput: string, prompt: string): Promise<WidgetNarrative | null> {
  const hash = createHash("sha1").update(hashInput).digest("hex").slice(0, 16);

  try {
    const raw = await redis.get<string>(cacheKey);
    if (raw) {
      const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as { text: string; hash: string; generatedAt: string };
      if (parsed.hash === hash) return { text: parsed.text, generatedAt: parsed.generatedAt, cached: true };
    }
  } catch {
    /* ignore cache read errors */
  }

  let text: string;
  try {
    const res = await generateText({ model: getFlashModel().model, prompt });
    text = res.text.trim();
  } catch {
    return null;
  }
  if (!text) return null;

  const generatedAt = new Date().toISOString();
  await redis.set(cacheKey, JSON.stringify({ text, hash, generatedAt }), { ex: TTL }).catch(() => {});
  return { text, generatedAt, cached: false };
}

/**
 * Plain-language reading of the active-sprint burndown widget — what the chart means
 * and how this sprint is actually tracking (ahead/behind the ideal line). Cached per
 * workspace; regenerates only when the underlying sprint numbers change.
 */
export async function sprintBurndownNarrative(workspaceId: string): Promise<WidgetNarrative | null> {
  const sprints = await computeSprints(workspaceId);
  const active = sprints.find((s) => s.state === "active") ?? sprints[0];
  if (!active) return null;

  const bd = await computeSprintBurndown(workspaceId, active.name);
  if (!bd) return null;

  // Current actual remaining = last non-null point; the ideal at that same day.
  let remaining: number | null = null;
  let idealNow: number | null = null;
  for (const p of bd.series) {
    if (p.remaining != null) {
      remaining = p.remaining;
      idealNow = p.ideal;
    }
  }
  const unit = bd.unit === "points" ? "story points" : "issues";
  const pace =
    remaining != null && idealNow != null
      ? remaining < idealNow - 0.01
        ? "ahead of the ideal pace"
        : remaining > idealNow + 0.01
          ? "behind the ideal pace"
          : "on the ideal pace"
      : "with no burn recorded yet";

  const facts = [
    `Sprint: ${active.name} (${active.state ?? "active"})`,
    active.daysRemaining != null ? `Days remaining: ${active.daysRemaining}` : "",
    `Committed ${unit}: ${bd.committed}`,
    remaining != null ? `Remaining now: ${remaining}` : "",
    idealNow != null ? `Ideal remaining today: ${Math.round(idealNow * 10) / 10}` : "",
    `Issues done: ${active.doneIssues}/${active.totalIssues}`,
    `Currently ${pace}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt =
    "You are explaining a sprint burndown chart to a product manager who may be new to it. " +
    "In 2 short sentences using ONLY the facts below: (1) say what the chart shows — the solid line is work remaining, " +
    "the dashed line is the ideal even pace to reach zero by the sprint end; (2) state how THIS sprint is tracking " +
    "(ahead/behind/on pace) using the real numbers. Plain language, no headers, no markdown, never invent numbers.\n\n" +
    `Facts:\n${facts}\n\nExplanation:`;

  return cachedNarrative(`sprint-burndown-narrative:${workspaceId}`, facts, prompt);
}

/**
 * Plain-language reading of the velocity widget — what committed-vs-completed points
 * per closed sprint means and what the recent trend implies for planning. Cached per
 * workspace; regenerates only when the closed-sprint numbers change.
 */
export async function velocityNarrative(workspaceId: string): Promise<WidgetNarrative | null> {
  const sprints = await computeSprints(workspaceId);
  const closed = sprints.filter((s) => s.state === "closed" && s.hasPoints).slice(0, 8);
  if (closed.length < 2) return null;

  const rows = closed.map((s) => ({ name: s.name, committed: s.committedPoints, done: s.donePoints }));
  const avgDone = Math.round((rows.reduce((n, r) => n + r.done, 0) / rows.length) * 10) / 10;

  const facts = [
    `Closed sprints (newest first): ${rows.length}`,
    ...rows.map((r) => `- ${r.name}: committed ${r.committed}, completed ${r.done}`),
    `Average completed points: ${avgDone}`,
  ].join("\n");

  const prompt =
    "You are explaining a sprint velocity chart to a product manager. In 2 short sentences using ONLY the facts below: " +
    "(1) say what it shows — completed story points per finished sprint versus what was committed, i.e. the team's delivery pace; " +
    "(2) note the recent trend and roughly how many points the team reliably completes per sprint (useful for planning the next one). " +
    "Plain language, no headers, no markdown, never invent numbers.\n\n" +
    `Facts:\n${facts}\n\nExplanation:`;

  return cachedNarrative(`velocity-narrative:${workspaceId}`, facts, prompt);
}
