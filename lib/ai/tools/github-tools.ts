import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  listUserRepos,
  listPullRequests,
  getPullRequest,
  listIssues,
  createIssue,
  getRepoActivity,
} from "@/lib/integrations/github";

/**
 * GitHub AI tools — available to ALL tiers when GitHub is connected.
 * Read operations are free. Write operations (createIssue) are AI actions.
 * Every execute() is wrapped in try/catch — tool failures never crash the conversation.
 */
export function getGitHubTools(workspaceId: string) {
  return {
    listRepositories: tool({
      description:
        "List the user's GitHub repositories. Use this to find repo names before querying PRs or issues.",
      inputSchema: zodSchema(
        z.object({
          limit: z.number().optional().default(10).describe("Max repos to return"),
        })
      ),
      execute: async ({ limit }) => {
        try {
          const repos = await listUserRepos(workspaceId, { per_page: limit ?? 10 });
          return {
            success: true,
            count: repos.length,
            repos: repos.map((r) => ({
              name: r.name,
              fullName: r.fullName,
              description: r.description,
              language: r.language,
              stars: r.stargazersCount,
              openIssues: r.openIssuesCount,
              private: r.private,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    listPullRequests: tool({
      description:
        "List pull requests for a GitHub repository. Use owner/repo format (e.g. 'octocat/hello-world').",
      inputSchema: zodSchema(
        z.object({
          owner: z.string().describe("Repository owner (e.g. 'octocat')"),
          repo: z.string().describe("Repository name (e.g. 'hello-world')"),
          state: z
            .enum(["open", "closed", "all"])
            .optional()
            .default("open")
            .describe("PR state filter"),
          limit: z.number().optional().default(10),
        })
      ),
      execute: async ({ owner, repo, state, limit }) => {
        try {
          const prs = await listPullRequests(workspaceId, owner, repo, state ?? "open", limit ?? 10);
          return {
            success: true,
            count: prs.length,
            pullRequests: prs.map((pr) => ({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              draft: pr.draft,
              author: pr.author,
              url: pr.url,
              createdAt: pr.createdAt,
              updatedAt: pr.updatedAt,
              labels: pr.labels,
              reviewers: pr.reviewers,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getPullRequest: tool({
      description:
        "Get detailed information about a specific pull request, including reviews and diff stats.",
      inputSchema: zodSchema(
        z.object({
          owner: z.string(),
          repo: z.string(),
          pullNumber: z.number().describe("The PR number"),
        })
      ),
      execute: async ({ owner, repo, pullNumber }) => {
        try {
          const pr = await getPullRequest(workspaceId, owner, repo, pullNumber);
          return { success: true, pullRequest: pr };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    listIssues: tool({
      description:
        "List issues for a GitHub repository. Does not include pull requests.",
      inputSchema: zodSchema(
        z.object({
          owner: z.string(),
          repo: z.string(),
          state: z
            .enum(["open", "closed", "all"])
            .optional()
            .default("open"),
          limit: z.number().optional().default(10),
        })
      ),
      execute: async ({ owner, repo, state, limit }) => {
        try {
          const issues = await listIssues(workspaceId, owner, repo, state ?? "open", limit ?? 10);
          return {
            success: true,
            count: issues.length,
            issues: issues.map((i) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              author: i.author,
              url: i.url,
              createdAt: i.createdAt,
              labels: i.labels,
              assignees: i.assignees,
            })),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    createGitHubIssue: tool({
      description:
        "Create a new issue in a GitHub repository. This is an AI action (counts toward action limit).",
      inputSchema: zodSchema(
        z.object({
          owner: z.string(),
          repo: z.string(),
          title: z.string().describe("Issue title"),
          body: z.string().optional().describe("Issue body in markdown"),
          labels: z.array(z.string()).optional().describe("Labels to add"),
        })
      ),
      execute: async ({ owner, repo, title, body, labels }) => {
        try {
          const issue = await createIssue(workspaceId, owner, repo, title, body, labels);
          return {
            success: true,
            issue: {
              number: issue.number,
              title: issue.title,
              url: issue.url,
            },
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getRepoActivity: tool({
      description:
        "Get recent commit activity for a GitHub repository. Useful for status updates and standups.",
      inputSchema: zodSchema(
        z.object({
          owner: z.string(),
          repo: z.string(),
          limit: z.number().optional().default(10),
        })
      ),
      execute: async ({ owner, repo, limit }) => {
        try {
          const commits = await getRepoActivity(workspaceId, owner, repo, limit ?? 10);
          return {
            success: true,
            count: commits.length,
            commits,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}
