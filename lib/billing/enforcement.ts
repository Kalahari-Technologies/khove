import type { PlanTier } from "@prisma/client";
import { checkUsage, incrementUsage } from "@/lib/redis";
import { hasFeature, PLANS } from "@/lib/billing/plans";
import type { PlanConfig } from "@/lib/billing/plans";

export interface UsageCheckResult {
  allowed: boolean;
  blocked: boolean;
  current: number;
  limit: number;
  percentUsed: number;
}

/**
 * Check if a user/workspace can send an AI message.
 * Returns blocked:true if at limit — callers return 200 with blocked:true, not 4xx.
 */
export async function checkAndIncrementUsage(
  userId: string,
  planTier: PlanTier,
  workspaceId?: string
): Promise<UsageCheckResult> {
  const plan = PLANS[planTier];
  const limit = plan.aiMessagesPerMonth;

  // Unlimited tiers skip Redis
  if (limit === -1) {
    return { allowed: true, blocked: false, current: 0, limit: -1, percentUsed: 0 };
  }

  const result = await checkUsage(userId, planTier, workspaceId);

  if (!result.allowed) {
    return { blocked: true, allowed: false, current: result.current, limit: result.limit, percentUsed: result.percentUsed };
  }

  await incrementUsage(userId, planTier, workspaceId);
  return { blocked: false, allowed: true, current: result.current, limit: result.limit, percentUsed: result.percentUsed };
}

/**
 * Check if a tier has access to a specific feature.
 * Throws if not allowed — use in server actions/API routes.
 */
export function enforceFeatureAccess(
  tier: PlanTier,
  feature: keyof PlanConfig["features"]
): void {
  if (!hasFeature(tier, feature)) {
    throw new Error(
      `Feature '${feature}' is not available on the ${tier} plan. Upgrade to access this feature.`
    );
  }
}

/**
 * Returns which tool categories are available for a given tier + integrations.
 */
export function getAvailableToolCategories(
  tier: PlanTier,
  connectedIntegrations: string[]
): string[] {
  const features = PLANS[tier].features;
  const categories: string[] = [];

  if (features.taskTools) categories.push("tasks");
  if (features.calendarTools && connectedIntegrations.includes("GOOGLE_CALENDAR")) {
    categories.push("calendar");
  }
  if (features.githubTools && connectedIntegrations.includes("GITHUB")) {
    categories.push("github");
  }
  if (features.jiraTools && connectedIntegrations.includes("JIRA")) {
    categories.push("jira");
  }
  if (features.standupAutomation) categories.push("standup");

  return categories;
}
