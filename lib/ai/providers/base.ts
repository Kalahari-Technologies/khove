import type { LanguageModel } from "ai";

export type ModelTier = "flash" | "haiku" | "sonnet";

export interface ProviderConfig {
  model: LanguageModel;
  tier: ModelTier;
}
