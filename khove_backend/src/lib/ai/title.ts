import { generateText } from "ai";
import { getFlashModel } from "./providers/google";

/**
 * Generate a concise conversation title from the first exchange, using the
 * cheapest model (Flash). Returns null on any failure — the caller keeps the
 * truncated-first-message fallback. Never throws.
 */
export async function generateTitle(userMessage: string, assistantText: string): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: getFlashModel().model,
      prompt:
        "Write a short, specific title for this conversation: 3–6 words, Title Case, " +
        "no quotes, no trailing punctuation. Capture the actual topic.\n\n" +
        `User: ${userMessage.slice(0, 600)}\n` +
        `Assistant: ${assistantText.slice(0, 600)}\n\n` +
        "Title:",
    });
    const title = text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[.\s]+$/g, "")
      .slice(0, 60);
    return title.length >= 2 ? title : null;
  } catch {
    return null;
  }
}
