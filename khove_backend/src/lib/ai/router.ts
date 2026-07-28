import type { PlanTier } from "@prisma/client";
import { getFlashModel, } from "./providers/google";
import { getHaikuModel, getSonnetModel } from "./providers/anthropic";
import type { ProviderConfig } from "./providers/base";

/**
 * Score the complexity of a user message (0–10).
 * 0–2 → Flash (free/simple)
 * 3–6 → Haiku (paid/medium)
 * 7+  → Sonnet (SMB/complex)
 *
 * Heuristics:
 * - Multi-step actions (and, then, also, after) add weight
 * - Integration keywords (jira, github, calendar, sprint, standup) add weight
 * - Short, conversational messages score low
 */
export function scoreComplexity(message: string): number {
  const lower = message.toLowerCase();
  let score = 0;

  // Multi-step connectors
  const multiStep = (lower.match(/\b(and|then|also|after|before|when|if)\b/g) ?? []).length;
  score += Math.min(multiStep, 3);

  // Integration keywords
  const integrationTerms = [
    "jira", "sprint", "ticket", "issue", "epic",
    "github", "pull request", "pr", "commit", "branch",
    "calendar", "meeting", "schedule", "event", "availability",
    "standup", "retrospective", "blocker", "velocity",
  ];
  for (const term of integrationTerms) {
    if (lower.includes(term)) score += 1;
  }

  // Length bonus (longer = likely more complex)
  if (message.length > 200) score += 2;
  else if (message.length > 100) score += 1;

  // Analysis/report requests
  if (/\b(analyse|analyze|summary|report|health|overview|status)\b/.test(lower)) {
    score += 2;
  }

  return Math.min(score, 10);
}

/**
 * Route to the correct model based on complexity score and plan tier.
 * FREE tier is always Flash regardless of complexity.
 * SMB/ENTERPRISE always get Sonnet for complex queries.
 */
export function routeToModel(
  complexityScore: number,
  planTier: PlanTier
): ProviderConfig {
  // FREE tier always uses Flash
  if (planTier === "FREE") {
    return getFlashModel();
  }

  // Score-based routing for paid tiers
  if (complexityScore <= 2) return getFlashModel();
  if (complexityScore <= 6) return getHaikuModel();

  // SMB/ENTERPRISE get Sonnet for complex queries
  if (planTier === "SMB" || planTier === "ENTERPRISE") {
    return getSonnetModel();
  }

  // TEAM gets Haiku even for high complexity (cost control)
  return getHaikuModel();
}
