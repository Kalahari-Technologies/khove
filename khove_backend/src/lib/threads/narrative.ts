import { createHash } from "crypto";
import { generateText } from "ai";
import { db } from "@backend/lib/db";
import { redis } from "@backend/lib/redis";
import { getFlashModel } from "@backend/lib/ai/providers/google";
import { getThread } from "@backend/lib/threads";
import { computeInitiativeDelivery } from "@backend/lib/intelligence/delivery";

export interface ThreadNarrative {
  text: string;
  generatedAt: string;
  cached: boolean;
}

const KIND_LABEL: Record<string, string> = {
  GITHUB_PR: "Pull request",
  GITHUB_ISSUE: "GitHub issue",
  JIRA_ISSUE: "Jira ticket",
  TASK: "Task",
  CALENDAR_EVENT: "Meeting",
  PERSON: "Person",
};

/**
 * A context-aware narrative for a Connectivity Thread / initiative — what it's about,
 * where it stands, and (when code is linked) how the PRs relate to the tickets. Cached
 * in Redis keyed by a content hash so it regenerates only when the thread changes.
 */
export async function generateThreadNarrative(workspaceId: string, threadId: string): Promise<ThreadNarrative | null> {
  const thread = await getThread(workspaceId, threadId);
  if (!thread) return null;

  const delivery = thread.targetDate ? await computeInitiativeDelivery(workspaceId, threadId).catch(() => null) : null;
  const githubConnected = !!(await db.integration.findFirst({
    where: { workspaceId, provider: "GITHUB", isActive: true },
    select: { id: true },
  }));

  const links = thread.links.map((l) => ({ kind: l.kind as string, title: l.title ?? l.refId }));
  const prLinks = links.filter((l) => l.kind === "GITHUB_PR");
  const ticketLinks = links.filter((l) => l.kind === "JIRA_ISSUE" || l.kind === "GITHUB_ISSUE" || l.kind === "TASK");

  // Content hash — regenerate when any material fact changes.
  const hashInput = JSON.stringify({
    title: thread.title,
    summary: thread.summary,
    status: thread.status,
    targetDate: thread.targetDate,
    health: thread.health,
    links: links.map((l) => `${l.kind}:${l.title}`),
    d: delivery ? { total: delivery.total, done: delivery.done, health: delivery.health, proj: delivery.projectedFinish, late: delivery.daysProjectedVsTarget } : null,
  });
  const hash = createHash("sha1").update(hashInput).digest("hex").slice(0, 16);
  const cacheKey = `thread-narrative:${threadId}`;

  try {
    const raw = await redis.get<string>(cacheKey);
    if (raw) {
      const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as { text: string; hash: string; generatedAt: string };
      if (parsed.hash === hash) return { text: parsed.text, generatedAt: parsed.generatedAt, cached: true };
    }
  } catch {
    /* ignore cache read errors */
  }

  const facts = [
    `Thread: ${thread.title}`,
    thread.summary ? `Summary: ${thread.summary}` : "",
    `Status: ${thread.status}${thread.health ? ` · health ${thread.health}` : ""}`,
    delivery
      ? `Delivery: ${delivery.done}/${delivery.total} done, velocity ${delivery.velocityPerWeek}/wk, projected finish ${delivery.projectedFinish ?? "n/a"}${
          delivery.daysProjectedVsTarget != null ? `, ${Math.abs(delivery.daysProjectedVsTarget)} days ${delivery.daysProjectedVsTarget > 0 ? "late" : "early"} vs target` : ""
        }`
      : "",
    ticketLinks.length ? `Linked tickets/tasks (${ticketLinks.length}):` : "",
    ...ticketLinks.map((l) => `- [${KIND_LABEL[l.kind] ?? l.kind}] ${l.title}`),
    prLinks.length ? `Linked pull requests (${prLinks.length}):` : "",
    ...prLinks.map((l) => `- ${l.title}`),
    delivery?.blockers?.length ? `Blockers: ${delivery.blockers.map((b) => b.title).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  const codeClause = githubConnected
    ? "When pull requests are linked, relate the code work to the tickets it delivers and call out any tickets with no code yet or code with no ticket. "
    : "";

  let text: string;
  try {
    const res = await generateText({
      model: getFlashModel().model,
      prompt:
        "You are a delivery lead briefing a product team on one work thread. Using ONLY the facts below, " +
        "write a short Markdown briefing (3–5 sentences, no headers): what this thread is about, where it stands, " +
        "and what to watch (risk/slippage/blockers). " +
        codeClause +
        "Be specific and factual — never invent tickets, numbers, names, dates, or outcomes not present.\n\n" +
        `Facts:\n${facts}\n\nBriefing:`,
    });
    text = res.text.trim();
  } catch {
    text = "Couldn't generate a summary right now — please try again.";
  }

  const generatedAt = new Date().toISOString();
  await redis.set(cacheKey, JSON.stringify({ text, hash, generatedAt }), { ex: 30 * 86_400 }).catch(() => {});
  return { text, generatedAt, cached: false };
}
