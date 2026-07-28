import type { Prisma, ThreadLinkKind } from "@prisma/client";
import { db } from "@backend/lib/db";
import { parseGitHubRefs } from "@backend/lib/threads/parse-github-refs";
import { resolvePeople } from "@backend/lib/threads/resolve-people";

export { parseGitHubRefs } from "@backend/lib/threads/parse-github-refs";
export { resolvePeople } from "@backend/lib/threads/resolve-people";
export { linkPRToThreads } from "@backend/lib/threads/link-pr";

const threadWithLinks = { include: { links: { orderBy: { createdAt: "asc" } } } } as const;

export type ThreadWithLinks = Prisma.ThreadGetPayload<typeof threadWithLinks>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createThread(
  workspaceId: string,
  input: { title: string; summary?: string | null },
): Promise<ThreadWithLinks> {
  return db.thread.create({
    data: { workspaceId, title: input.title, summary: input.summary ?? null },
    ...threadWithLinks,
  });
}

export async function listThreads(
  workspaceId: string,
  opts?: { status?: "OPEN" | "ACTIVE" | "RESOLVED" | "ARCHIVED" },
): Promise<ThreadWithLinks[]> {
  return db.thread.findMany({
    where: { workspaceId, ...(opts?.status && { status: opts.status }) },
    orderBy: { updatedAt: "desc" },
    ...threadWithLinks,
  });
}

export async function getThread(
  workspaceId: string,
  threadId: string,
): Promise<ThreadWithLinks | null> {
  const thread = await db.thread.findUnique({ where: { id: threadId }, ...threadWithLinks });
  if (!thread || thread.workspaceId !== workspaceId) return null;
  return thread;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export interface LinkInput {
  kind: ThreadLinkKind;
  refId: string;
  refUrl?: string | null;
  title?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Idempotently attach a link (unique on [threadId, kind, refId]). */
export async function linkToThread(
  workspaceId: string,
  threadId: string,
  link: LinkInput,
): Promise<void> {
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { workspaceId: true } });
  if (!thread || thread.workspaceId !== workspaceId) {
    throw new Error("Thread not found in this workspace");
  }
  await db.threadLink.upsert({
    where: { threadId_kind_refId: { threadId, kind: link.kind, refId: link.refId } },
    create: {
      threadId,
      kind: link.kind,
      refId: link.refId,
      refUrl: link.refUrl ?? null,
      title: link.title ?? null,
      metadata: link.metadata ?? {},
    },
    update: {
      refUrl: link.refUrl ?? null,
      title: link.title ?? null,
      ...(link.metadata !== undefined && { metadata: link.metadata }),
    },
  });
  await db.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
}

export async function unlinkFromThread(workspaceId: string, linkId: string): Promise<void> {
  const link = await db.threadLink.findUnique({
    where: { id: linkId },
    include: { thread: { select: { workspaceId: true } } },
  });
  if (!link || link.thread.workspaceId !== workspaceId) {
    throw new Error("Link not found in this workspace");
  }
  await db.threadLink.delete({ where: { id: linkId } });
}

// ---------------------------------------------------------------------------
// Auto-linking a meeting into a thread (runs only after a thread exists)
// ---------------------------------------------------------------------------

/**
 * Attach a meeting Task to a thread and derive its joins: GitHub PR/issue refs
 * found in the meeting's title/description (matched to stored GitHub Tasks), and
 * attendees resolved to workspace members. Returns a small summary of what linked.
 */
export async function autoLinkMeeting(
  workspaceId: string,
  threadId: string,
  taskId: string,
): Promise<{ github: number; people: number }> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.workspaceId !== workspaceId) {
    throw new Error("Task not found in this workspace");
  }

  // 1. The meeting itself.
  await linkToThread(workspaceId, threadId, {
    kind: "TASK",
    refId: task.id,
    refUrl: task.externalUrl,
    title: task.title,
  });

  // 2. GitHub refs from the meeting text → match stored GitHub Tasks.
  const refs = parseGitHubRefs(`${task.title}\n${task.description ?? ""}`);
  let github = 0;
  for (const ref of refs) {
    const ghTask = await db.task.findFirst({
      where: { workspaceId, source: { has: "GITHUB" }, externalId: ref.externalId },
      select: { id: true, externalUrl: true, title: true },
    });
    await linkToThread(workspaceId, threadId, {
      kind: ref.kind,
      refId: ghTask?.id ?? ref.externalId,
      refUrl: ghTask?.externalUrl ?? ref.url,
      title: ghTask?.title ?? `${ref.owner}/${ref.repo}#${ref.number}`,
      metadata: { externalId: ref.externalId, owner: ref.owner, repo: ref.repo, number: ref.number },
    });
    github++;
  }

  // 3. Attendees → people.
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const gcal = (meta.googleCalendar ?? {}) as Record<string, unknown>;
  const emails = Array.isArray(gcal.attendees) ? (gcal.attendees as string[]) : [];
  const people = await resolvePeople(workspaceId, emails);
  for (const p of people) {
    await linkToThread(workspaceId, threadId, {
      kind: "PERSON",
      refId: p.userId ?? p.email,
      title: p.name ?? p.email,
      metadata: { email: p.email, userId: p.userId },
    });
  }

  return { github, people: people.length };
}
