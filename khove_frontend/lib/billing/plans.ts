import type { PlanTier } from "@prisma/client";

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  description: string;
  priceUsd: number; // per user/month, 0 = free
  annualPriceUsd: number; // per user/year, 0 = free
  aiActionsPerMonth: number; // -1 = unlimited. For TEAM/SMB this is per-workspace.
  maxWorkspaces: number; // -1 = unlimited
  maxWorkspaceMembers: number; // -1 = unlimited
  trialDays: number; // 0 = no trial
  features: {
    // Integrations — free for ALL tiers
    calendarTools: boolean;
    githubTools: boolean;
    jiraTools: boolean;
    // AI capabilities
    persistentMemory: boolean;
    memoryRetentionDays: number; // 7 for free, -1 = unlimited for paid
    standupAutomation: boolean;
    customAiInstructions: boolean;
    // Team features
    teamWorkspace: boolean;
    teamMemory: boolean;
    // SMB+ features
    sprintIntelligence: boolean;
    adminDashboard: boolean;
  };
}

/**
 * PLANS is the single source of truth for all plan logic.
 * Based on Concept Note V3, Table 3.
 *
 * Key V3 changes:
 * - ALL integrations free for ALL tiers (monetisation is via AI actions, not integration access)
 * - Action-based metering replaces message-based metering
 * - Free: 20 actions/month, 7-day memory, 2 workspaces, 4 members
 * - Pro: Unlimited actions, full memory, standup AI, custom instructions, 5 workspaces
 * - Team: 500 actions/workspace, 20 members, team memory, unlimited workspaces
 * - SMB: 2000 actions/workspace, 50 members, sprint intelligence, admin dashboard
 */
export const PLANS: Record<PlanTier, PlanConfig> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    description: "For getting started",
    priceUsd: 0,
    annualPriceUsd: 0,
    aiActionsPerMonth: 20,
    maxWorkspaces: 2,
    maxWorkspaceMembers: 4,
    trialDays: 0,
    features: {
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      persistentMemory: true,
      memoryRetentionDays: 7,
      standupAutomation: false,
      customAiInstructions: false,
      teamWorkspace: false,
      teamMemory: false,
      sprintIntelligence: false,
      adminDashboard: false,
    },
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    description: "For individuals",
    priceUsd: 9,
    annualPriceUsd: 90,
    aiActionsPerMonth: -1,
    maxWorkspaces: 5,
    maxWorkspaceMembers: 4,
    trialDays: 14,
    features: {
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      persistentMemory: true,
      memoryRetentionDays: -1,
      standupAutomation: true,
      customAiInstructions: true,
      teamWorkspace: false,
      teamMemory: false,
      sprintIntelligence: false,
      adminDashboard: false,
    },
  },
  TEAM: {
    tier: "TEAM",
    name: "Team",
    description: "For teams",
    priceUsd: 18,
    annualPriceUsd: 180,
    aiActionsPerMonth: 500,
    maxWorkspaces: -1,
    maxWorkspaceMembers: 20,
    trialDays: 14,
    features: {
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      persistentMemory: true,
      memoryRetentionDays: -1,
      standupAutomation: true,
      customAiInstructions: true,
      teamWorkspace: true,
      teamMemory: true,
      sprintIntelligence: false,
      adminDashboard: false,
    },
  },
  SMB: {
    tier: "SMB",
    name: "SMB",
    description: "For growing companies",
    priceUsd: 35,
    annualPriceUsd: 350,
    aiActionsPerMonth: 2000,
    maxWorkspaces: -1,
    maxWorkspaceMembers: 50,
    trialDays: 21,
    features: {
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      persistentMemory: true,
      memoryRetentionDays: -1,
      standupAutomation: true,
      customAiInstructions: true,
      teamWorkspace: true,
      teamMemory: true,
      sprintIntelligence: true,
      adminDashboard: true,
    },
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    description: "Custom solutions",
    priceUsd: 0, // custom pricing
    annualPriceUsd: 0,
    aiActionsPerMonth: -1,
    maxWorkspaces: -1,
    maxWorkspaceMembers: -1,
    trialDays: 0,
    features: {
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      persistentMemory: true,
      memoryRetentionDays: -1,
      standupAutomation: true,
      customAiInstructions: true,
      teamWorkspace: true,
      teamMemory: true,
      sprintIntelligence: true,
      adminDashboard: true,
    },
  },
};

export function getPlan(tier: PlanTier): PlanConfig {
  return PLANS[tier];
}

export function hasFeature(
  tier: PlanTier,
  feature: keyof PlanConfig["features"]
): boolean {
  return !!PLANS[tier].features[feature];
}
