import { tool, zodSchema } from "ai";
import { z } from "zod";
import { jiraFetch, textToADF, transitionJiraIssue } from "@backend/lib/integrations/jira";

/**
 * Jira AI tools — available to all tiers when Jira is connected.
 * Reads are free; create/transition/comment are AI write actions. Every
 * execute() is wrapped in try/catch so a tool failure never crashes the chat.
 *
 * Rules: status changes go through the transitions API (never a raw status name);
 * descriptions/comments are sent as ADF, never plain text/markdown.
 */
export function getJiraTools(workspaceId: string) {
  return {
    listJiraProjects: tool({
      description: "List Jira projects (key + name). Use to find a project key before creating an issue.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          const data = await jiraFetch<{ values?: { key: string; name: string }[] }>(
            workspaceId,
            "/rest/api/3/project/search?maxResults=50",
          );
          return { success: true, projects: (data.values ?? []).map((p) => ({ key: p.key, name: p.name })) };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    listJiraIssues: tool({
      description:
        "Search Jira issues with JQL (e.g. 'project = ENG AND status != Done ORDER BY updated DESC'). Returns key, summary, status, and type.",
      inputSchema: zodSchema(
        z.object({
          jql: z.string().describe("A JQL query string"),
          limit: z.number().optional().default(20).describe("Max issues to return"),
        }),
      ),
      execute: async ({ jql, limit }) => {
        try {
          const data = await jiraFetch<{
            issues?: { key: string; fields: { summary?: string; status?: { name?: string }; issuetype?: { name?: string } } }[];
          }>(workspaceId, "/rest/api/3/search/jql", {
            method: "POST",
            body: JSON.stringify({ jql, maxResults: Math.min(limit ?? 20, 50), fields: ["summary", "status", "issuetype"] }),
          });
          return {
            success: true,
            issues: (data.issues ?? []).map((i) => ({
              key: i.key,
              summary: i.fields.summary,
              status: i.fields.status?.name,
              type: i.fields.issuetype?.name,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getJiraIssue: tool({
      description: "Get one Jira issue by key (e.g. 'ENG-123') — summary, status, type, and description.",
      inputSchema: zodSchema(z.object({ issueKey: z.string().describe("Issue key, e.g. ENG-123") })),
      execute: async ({ issueKey }) => {
        try {
          const data = await jiraFetch<{
            key: string;
            fields: {
              summary?: string;
              status?: { name?: string; statusCategory?: { name?: string } };
              issuetype?: { name?: string };
              priority?: { name?: string };
              labels?: string[];
              components?: { name?: string }[];
              fixVersions?: { name?: string }[];
              parent?: { key?: string };
              description?: unknown;
            };
          }>(
            workspaceId,
            `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,issuetype,priority,labels,components,fixVersions,parent,description`,
          );
          const f = data.fields;
          return {
            success: true,
            issue: {
              key: data.key,
              summary: f.summary,
              status: f.status?.name,
              statusCategory: f.status?.statusCategory?.name,
              type: f.issuetype?.name,
              priority: f.priority?.name,
              labels: f.labels ?? [],
              components: (f.components ?? []).map((c) => c.name).filter(Boolean),
              fixVersions: (f.fixVersions ?? []).map((v) => v.name).filter(Boolean),
              parent: f.parent?.key,
              description: adfToText(f.description),
            },
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    createJiraIssue: tool({
      description: "Create a Jira issue in a project. The description is sent as ADF automatically.",
      inputSchema: zodSchema(
        z.object({
          projectKey: z.string().describe("Project key, e.g. ENG"),
          summary: z.string().describe("Issue title"),
          description: z.string().optional().describe("Plain-text description (converted to ADF)"),
          issueType: z.string().optional().default("Task").describe("Issue type name, e.g. Task, Bug, Story"),
        }),
      ),
      execute: async ({ projectKey, summary, description, issueType }) => {
        try {
          const fields: Record<string, unknown> = {
            project: { key: projectKey },
            summary,
            issuetype: { name: issueType ?? "Task" },
          };
          if (description) fields.description = textToADF(description);
          const data = await jiraFetch<{ key: string }>(workspaceId, "/rest/api/3/issue", {
            method: "POST",
            body: JSON.stringify({ fields }),
          });
          return { success: true, issueKey: data.key };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    commentJiraIssue: tool({
      description: "Add a comment to a Jira issue. The body is sent as ADF automatically.",
      inputSchema: zodSchema(
        z.object({
          issueKey: z.string().describe("Issue key, e.g. ENG-123"),
          body: z.string().describe("Comment text (plain text, converted to ADF)"),
        }),
      ),
      execute: async ({ issueKey, body }) => {
        try {
          await jiraFetch(workspaceId, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
            method: "POST",
            body: JSON.stringify({ body: textToADF(body) }),
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    transitionJiraIssue: tool({
      description:
        "Move a Jira issue to a new state using the transitions API. Give the target StatusCategory — the matching workflow transition is chosen automatically.",
      inputSchema: zodSchema(
        z.object({
          issueKey: z.string().describe("Issue key, e.g. ENG-123"),
          category: z
            .enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"])
            .describe("Target StatusCategory"),
        }),
      ),
      execute: async ({ issueKey, category }) => {
        return transitionJiraIssue(workspaceId, issueKey, category);
      },
    }),
  };
}

/** Best-effort flatten of an ADF document to plain text (for read tools). */
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    const sep = n.type === "paragraph" ? "\n" : "";
    return n.content.map(adfToText).join("") + sep;
  }
  return "";
}
