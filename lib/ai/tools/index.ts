import type { PlanTier } from "@prisma/client";
import { getTaskTools } from "./task-tools";
import { getAvailableToolCategories } from "@/lib/billing/enforcement";

/**
 * Returns the tool set for the current user based on plan tier and connected integrations.
 * Tools are loaded per tier — FREE tier gets task tools only.
 * Integration tools are only loaded if the integration is actually connected.
 *
 * Phase 3+: calendar-tools, github-tools, jira-tools, standup-tools will be added here.
 */
export function getToolsForContext(
  userId: string,
  planTier: PlanTier,
  connectedIntegrations: string[]
) {
  const categories = getAvailableToolCategories(planTier, connectedIntegrations);
  const tools: Record<string, unknown> = {};

  if (categories.includes("tasks")) {
    Object.assign(tools, getTaskTools(userId));
  }

  // Phase 3: calendar tools
  // if (categories.includes("calendar")) {
  //   Object.assign(tools, getCalendarTools(userId));
  // }

  // Phase 4: github tools
  // if (categories.includes("github")) {
  //   Object.assign(tools, getGitHubTools(userId));
  // }

  // Phase 5: jira tools
  // if (categories.includes("jira")) {
  //   Object.assign(tools, getJiraTools(userId));
  // }

  return tools;
}
