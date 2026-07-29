import { generateText } from "ai";
import { db } from "@backend/lib/db";
import { getFlashModel } from "@backend/lib/ai/providers/google";

const DAY = 86_400_000;

export interface StatusReport {
  report: string;
  sources: { merged: number; completed: number; meetings: number };
  generatedAt: string;
}

/**
 * The weekly stakeholder update every PM hates writing — assembled from the last 7
 * days across GitHub (merges), tickets (done), and calendar (meetings), then phrased
 * by the cheapest model. Evidence-only: the prompt forbids invented detail.
 */
export async function generateStatusReport(workspaceId: string): Promise<StatusReport> {
  const from = new Date(Date.now() - 7 * DAY);
  const now = new Date();

  const merges = await db.signal.findMany({
    where: { workspaceId, provider: "GITHUB", kind: "WORK_MERGED", occurredAt: { gte: from } },
    select: { entityKey: true },
  });
  const mergedKeys = [...new Set(merges.map((m) => m.entityKey))];
  const mergedTasks = mergedKeys.length
    ? await db.task.findMany({ where: { workspaceId, externalId: { in: mergedKeys } }, select: { title: true }, take: 40 })
    : [];

  const completed = await db.task.findMany({
    where: { workspaceId, updatedAt: { gte: from }, status: { category: "DONE" }, source: { hasSome: ["GITHUB", "JIRA"] } },
    select: { title: true },
    take: 40,
  });

  const meetings = await db.task.findMany({
    where: { workspaceId, source: { has: "GOOGLE_CALENDAR" }, dueDate: { gte: from, lte: now } },
    select: { title: true },
    take: 30,
  });

  const sources = { merged: mergedTasks.length, completed: completed.length, meetings: meetings.length };
  if (sources.merged + sources.completed + sources.meetings === 0) {
    return {
      report: "No shipped work, completed tickets, or meetings recorded in the last 7 days.",
      sources,
      generatedAt: now.toISOString(),
    };
  }

  const facts = [
    `Merged pull requests (${mergedTasks.length}):`,
    ...mergedTasks.map((t) => `- ${t.title}`),
    `Completed tickets/issues (${completed.length}):`,
    ...completed.map((t) => `- ${t.title}`),
    `Meetings held (${meetings.length}):`,
    ...meetings.map((t) => `- ${t.title}`),
  ]
    .join("\n")
    .slice(0, 4000);

  let report: string;
  try {
    const { text } = await generateText({
      model: getFlashModel().model,
      prompt:
        "You are a product manager writing a concise weekly status update for stakeholders. " +
        "Using ONLY the facts below, write a short Markdown update: a one-line summary sentence, " +
        "then 2–4 bullets grouped under **Shipped** / **In motion** / **Notable** (skip empty groups). " +
        "Be specific and factual — never invent details, numbers, names, or outcomes not present.\n\n" +
        `Facts (last 7 days):\n${facts}\n\nWeekly update:`,
    });
    report = text.trim();
  } catch {
    report = "Couldn't generate the summary right now — please try again.";
  }

  return { report, sources, generatedAt: now.toISOString() };
}
