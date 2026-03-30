import { generateText, stepCountIs } from "ai";
import type { PlanTier } from "@prisma/client";
import { db } from "@/lib/db";
import { checkAndIncrementUsage } from "@/lib/billing/enforcement";
import { scoreComplexity, routeToModel } from "./router";
import { assembleSystemPrompt, pruneConversationHistory } from "./context";
import type { ChatMessage } from "./context";
import { getUserMemory, updateUserMemory, shouldUpdateMemory } from "./memory";
import { getToolsForContext } from "./tools";
import { hasFeature } from "@/lib/billing/plans";

export interface RunAIConversationInput {
  userId: string;
  conversationId?: string;
  newMessage: string;
  planTier: PlanTier;
  workspaceId: string;
  userName: string;
}

export interface RunAIConversationResult {
  blocked: boolean;
  response?: string;
  conversationId?: string;
  model?: string;
  error?: string;
}

/**
 * Main AI conversation orchestrator — the 8-step sequence:
 * 1. Redis usage check
 * 2. Context assembly (history + memory + workspace settings)
 * 3. Complexity scoring → model selection
 * 4. Tool loading (tier + integrations)
 * 5. AI provider call
 * 6. Tool execution loop (max 5 steps, handled by Vercel AI SDK)
 * 7. Response returned
 * 8. Post-processing (usage log, memory update, conversation save)
 */
export async function runAIConversation(
  input: RunAIConversationInput
): Promise<RunAIConversationResult> {
  const { userId, conversationId, newMessage, planTier, workspaceId, userName } = input;

  // ─── Step 1: Usage check ───────────────────────────────────────────────
  const usage = await checkAndIncrementUsage(userId, planTier, workspaceId);
  if (usage.blocked) {
    return {
      blocked: true,
      response: `You've reached your ${planTier} plan limit for this month (${usage.limit} messages). Upgrade your plan to continue.`,
    };
  }

  // ─── Step 2: Context assembly ──────────────────────────────────────────
  let conversation = conversationId
    ? await db.conversation.findFirst({ where: { id: conversationId, userId } })
    : null;

  const rawHistory: ChatMessage[] =
    ((conversation?.messages as unknown) as ChatMessage[]) ?? [];
  const history = pruneConversationHistory(rawHistory);

  // Load connected integrations — workspace-scoped
  const integrations = workspaceId
    ? await db.integration.findMany({
        where: { workspaceId, isActive: true },
        select: { provider: true },
      })
    : [];
  const connectedIntegrations = integrations.map((i: { provider: string }) => i.provider);

  // Load workspace settings
  const workspace = workspaceId
    ? await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    : null;
  const workspaceSettings = workspace?.settings as Record<string, unknown> | undefined;

  // Load user memory (paid tiers only)
  const userMemorySummary =
    hasFeature(planTier, "persistentMemory") ? await getUserMemory(userId) : null;

  const systemPrompt = assembleSystemPrompt({
    userName,
    planTier,
    connectedIntegrations,
    workspaceSettings,
    userMemorySummary: userMemorySummary ?? undefined,
    currentDate: new Date().toISOString().split("T")[0],
  });

  // ─── Step 3: Complexity scoring → model ───────────────────────────────
  const complexityScore = scoreComplexity(newMessage);
  const { model, tier: modelTier } = routeToModel(complexityScore, planTier);

  // ─── Step 4: Tool loading ──────────────────────────────────────────────
  const tools = getToolsForContext(userId, workspaceId, planTier, connectedIntegrations);

  // ─── Step 5–6: AI call + tool loop (max 5 steps) ──────────────────────
  const messages = [
    ...history.filter((m) => m.role !== "system"),
    { role: "user" as const, content: newMessage },
  ];

  let responseText: string;
  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools: tools as Parameters<typeof generateText>[0]["tools"],
      stopWhen: stepCountIs(5),
    });
    // `result.text` is empty when the model only called tools without a follow-up.
    // Fall back to the last step that has text, then a generic confirmation.
    responseText =
      result.text?.trim() ||
      result.steps?.findLast((s) => s.text?.trim())?.text?.trim() ||
      "Done! Let me know if there's anything else you need.";
  } catch (error) {
    console.error("[AI] generateText failed:", error);
    return {
      blocked: false,
      error: `AI request failed: ${String(error)}`,
      response: "I encountered an error processing your request. Please try again.",
    };
  }

  // ─── Step 7: Save conversation ─────────────────────────────────────────
  const updatedMessages: ChatMessage[] = [
    ...history.filter((m) => m.role !== "system"),
    { role: "user", content: newMessage, timestamp: new Date().toISOString() },
    { role: "assistant", content: responseText, timestamp: new Date().toISOString() },
  ];

  const messagesJson = updatedMessages as unknown as import("@prisma/client").Prisma.InputJsonValue;

  const savedConversation = conversation
    ? await db.conversation.update({
        where: { id: conversation.id },
        data: { messages: messagesJson, updatedAt: new Date() },
      })
    : await db.conversation.create({
        data: {
          userId,
          workspaceId: workspaceId ?? null,
          messages: messagesJson,
          title: newMessage.slice(0, 60),
        },
      });

  // ─── Step 8: Post-processing ───────────────────────────────────────────
  // Log usage
  await db.aiUsageLog.create({
    data: {
      userId,
      workspaceId: workspaceId ?? null,
      model: modelTier,
      feature: "chat",
    },
  });

  // Update memory every 10 messages on paid tiers
  if (
    hasFeature(planTier, "persistentMemory") &&
    shouldUpdateMemory(updatedMessages.length)
  ) {
    // Fire-and-forget memory update (non-blocking)
    updateMemoryAsync(userId, updatedMessages, systemPrompt, model).catch(() => {
      // Memory update failures are silent — not critical
    });
  }

  return {
    blocked: false,
    response: responseText,
    conversationId: savedConversation.id,
    model: modelTier,
  };
}

/**
 * Async memory update — generates a summary of recent conversation patterns.
 * Non-blocking, called after the response has been returned.
 */
async function updateMemoryAsync(
  userId: string,
  messages: ChatMessage[],
  _systemPrompt: string,
  model: Parameters<typeof generateText>[0]["model"]
): Promise<void> {
  const recentMessages = messages.slice(-20);
  const conversation = recentMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const { text: summary } = await generateText({
    model,
    system:
      "You are a memory system. Summarize key facts about the user from this conversation: their work style, preferences, recurring projects, team context, and anything worth remembering for future conversations. Be concise (max 200 words). Do not include specific task IDs or dates.",
    messages: [{ role: "user", content: conversation }],
  });

  await updateUserMemory(userId, summary);
}
