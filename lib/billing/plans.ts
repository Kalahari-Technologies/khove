import type { PlanTier } from "@prisma/client";

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  priceUsd: number; // per user/month, 0 = free
  aiMessagesPerMonth: number; // -1 = unlimited
  maxWorkspaceMembers: number; // -1 = unlimited
  features: {
    taskTools: boolean;
    calendarTools: boolean;
    githubTools: boolean;
    jiraTools: boolean;
    standupAutomation: boolean;
    persistentMemory: boolean;
    teamWorkspace: boolean;
  };
}

/**
 * PLANS is the single source of truth for all plan logic.
 * NEVER hardcode plan logic anywhere else — always import from here.
 */
export const PLANS: Record<PlanTier, PlanConfig> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    priceUsd: 0,
    aiMessagesPerMonth: 30,
    maxWorkspaceMembers: 1,
    features: {
      taskTools: true,
      calendarTools: false,
      githubTools: false,
      jiraTools: false,
      standupAutomation: false,
      persistentMemory: false,
      teamWorkspace: false,
    },
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    priceUsd: 9,
    aiMessagesPerMonth: -1,
    maxWorkspaceMembers: 1,
    features: {
      taskTools: true,
      calendarTools: true,
      githubTools: true,
      jiraTools: false,
      standupAutomation: false,
      persistentMemory: true,
      teamWorkspace: false,
    },
  },
  TEAM: {
    tier: "TEAM",
    name: "Team",
    priceUsd: 18,
    aiMessagesPerMonth: 500,
    maxWorkspaceMembers: 25,
    features: {
      taskTools: true,
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      standupAutomation: true,
      persistentMemory: true,
      teamWorkspace: true,
    },
  },
  SMB: {
    tier: "SMB",
    name: "SMB",
    priceUsd: 35,
    aiMessagesPerMonth: 2000,
    maxWorkspaceMembers: 50,
    features: {
      taskTools: true,
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      standupAutomation: true,
      persistentMemory: true,
      teamWorkspace: true,
    },
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    priceUsd: 0, // custom
    aiMessagesPerMonth: -1,
    maxWorkspaceMembers: -1,
    features: {
      taskTools: true,
      calendarTools: true,
      githubTools: true,
      jiraTools: true,
      standupAutomation: true,
      persistentMemory: true,
      teamWorkspace: true,
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
  return PLANS[tier].features[feature];
}
