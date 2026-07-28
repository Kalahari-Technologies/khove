import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  createThread,
  listThreads,
  getThread,
  autoLinkMeeting,
} from "@backend/lib/threads";

/**
 * Connectivity Thread tools — a Thread is one work item spanning Calendar /
 * GitHub / people. Every execute() is wrapped in try/catch so a tool failure
 * never crashes the conversation. Threads are formed explicitly (never auto).
 */
export function getThreadTools(workspaceId: string) {
  return {
    listThreads: tool({
      description:
        "List Connectivity Threads in the workspace. A thread groups a meeting, its related GitHub PRs/issues, and people. Use when the user asks about ongoing work items or threads.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          const threads = await listThreads(workspaceId);
          return {
            success: true,
            count: threads.length,
            threads: threads.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              linkCount: t.links.length,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getThread: tool({
      description: "Get a Connectivity Thread with all its linked work (tasks, PRs, issues, people).",
      inputSchema: zodSchema(z.object({ threadId: z.string() })),
      execute: async ({ threadId }) => {
        try {
          const thread = await getThread(workspaceId, threadId);
          if (!thread) return { success: false, error: "Thread not found" };
          return {
            success: true,
            thread: {
              id: thread.id,
              title: thread.title,
              summary: thread.summary,
              status: thread.status,
              links: thread.links.map((l) => ({ kind: l.kind, title: l.title, url: l.refUrl })),
            },
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    createThread: tool({
      description:
        "Create a Connectivity Thread. Optionally attach a meeting task, which auto-links its GitHub references and attendees. Use when the user wants to group related work around a meeting or initiative.",
      inputSchema: zodSchema(
        z.object({
          title: z.string().describe("Thread title"),
          summary: z.string().optional().describe("Optional summary"),
          meetingTaskId: z
            .string()
            .optional()
            .describe("Optional meeting Task id to attach and auto-link"),
        }),
      ),
      execute: async ({ title, summary, meetingTaskId }) => {
        try {
          const thread = await createThread(workspaceId, { title, summary });
          let linked: { github: number; people: number } | undefined;
          if (meetingTaskId) {
            linked = await autoLinkMeeting(workspaceId, thread.id, meetingTaskId);
          }
          return { success: true, threadId: thread.id, title: thread.title, linked };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}
