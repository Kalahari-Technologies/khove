import type { PlanTier } from "@prisma/client";
import { getTaskTools } from "./task-tools";
import { getCalendarTools } from "./calendar-tools";
import { getGitHubTools } from "./github-tools";
import { getAvailableToolCategories } from "@backend/lib/billing/enforcement";

/**
 * Returns the tool set for the current user based on plan tier and connected integrations.
 * Tools are loaded per tier — FREE tier gets task tools only.
 * Integration tools are only loaded if the integration is actually connected.
 *
 * Task tools are workspace-scoped (workspaceId required).
 * Calendar tools are user-scoped (always see full calendar regardless of workspace).
 */
export function getToolsForContext(
  userId: string,
  workspaceId: string,
  planTier: PlanTier,
  connectedIntegrations: string[]
) {
  const categories = getAvailableToolCategories(planTier, connectedIntegrations);
  const tools: Record<string, unknown> = {};

  if (categories.includes("tasks")) {
    Object.assign(tools, getTaskTools(userId, workspaceId));
  }

  // Calendar and GitHub tools are workspace-scoped
  if (categories.includes("calendar")) {
    Object.assign(tools, getCalendarTools(workspaceId));
  }

  if (categories.includes("github")) {
    Object.assign(tools, getGitHubTools(workspaceId));
  }

  // Phase 5: jira tools
  // if (categories.includes("jira")) {
  //   Object.assign(tools, getJiraTools(userId));
  // }

  return tools;
}
