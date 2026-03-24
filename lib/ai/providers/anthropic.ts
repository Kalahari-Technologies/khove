import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderConfig } from "./base";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * Claude Haiku — used for PRO/TEAM tiers and medium-complexity queries (score 3–6).
 */
export function getHaikuModel(): ProviderConfig {
  return {
    model: anthropic("claude-haiku-4-5-20251001"),
    tier: "haiku",
  };
}

/**
 * Claude Sonnet — used for SMB/ENTERPRISE and high-complexity queries (score 7+).
 */
export function getSonnetModel(): ProviderConfig {
  return {
    model: anthropic("claude-sonnet-4-6"),
    tier: "sonnet",
  };
}
