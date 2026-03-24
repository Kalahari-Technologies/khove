import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderConfig } from "./base";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

/**
 * Gemini 2.5 Flash — used for FREE tier and low-complexity queries (score 0–2).
 * Fastest and cheapest model.
 */
export function getFlashModel(): ProviderConfig {
  return {
    model: google("gemini-2.0-flash-lite"),
    tier: "flash",
  };
}
