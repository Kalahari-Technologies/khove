import type { PlanTier } from "@prisma/client";
import { checkUsage, incrementUsage } from "@/lib/redis";
import { PLANS } from "@/lib/billing/plans";
import type { PlanConfig } from "@/lib/billing/plans";

export interface UsageCheckResult {
  allowed: boolean;
  blocked: boolean;
  current: number;
  limit: number;
  percentUsed: number;
}

/**
 * Check if a user/workspace can perform an AI action.
 * Returns blocked:true if at limit — callers return 200 with blocked:true, not 4xx.
 */
export async function checkAndIncrementUsage(
  userId: string,
  planTier: PlanTier,
  workspaceId?: string
): Promise<UsageCheckResult> {
  const plan = PLANS[planTier];
  const limit = plan.aiActionsPerMonth;

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
  if (!PLANS[tier].features[feature]) {
    throw new Error(
      `Feature '${feature}' is not available on the ${tier} plan. Upgrade to access this feature.`
    );
  }
}

/**
 * Returns which tool categories are available for a given tier + connected integrations.
 * Per V3: ALL integrations are free for ALL tiers. Tools load if the integration is connected.
 */
export function getAvailableToolCategories(
  tier: PlanTier,
  connectedIntegrations: string[]
): string[] {
  const categories: string[] = [];

  // Task tools — always available
  categories.push("tasks");

  // Integration tools — available to ALL tiers, gated only by connection status
  if (connectedIntegrations.includes("GOOGLE_CALENDAR")) {
    categories.push("calendar");
  }
  if (connectedIntegrations.includes("GITHUB")) {
    categories.push("github");
  }
  if (connectedIntegrations.includes("JIRA")) {
    categories.push("jira");
  }

  // Standup automation — PRO+ only
  if (PLANS[tier].features.standupAutomation) {
    categories.push("standup");
  }

  return categories;
}
