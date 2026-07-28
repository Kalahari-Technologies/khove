import { generateText, streamText, stepCountIs } from "ai";
import type { PlanTier, Prisma } from "@prisma/client";
import { db } from "@backend/lib/db";
import { checkAndIncrementUsage } from "@backend/lib/billing/enforcement";
import { scoreComplexity, routeToModel } from "./router";
import { assembleSystemPrompt, pruneConversationHistory } from "./context";
import type { ChatMessage } from "./context";
import { getUserMemory, updateUserMemory, shouldUpdateMemory } from "./memory";
import { getToolsForContext } from "./tools";
import { hasFeature } from "@backend/lib/billing/plans";
import { labelForTool } from "@khove/shared";

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

export type ChatStreamEvent =
  | { t: "meta"; conversationId: string }
  | { t: "step"; tool: string; label: string; status: "running" | "done" }
  | { t: "text"; delta: string }
  | { t: "reasoning"; delta: string }
  | { t: "blocked"; response: string }
  | { t: "error"; message: string }
  | { t: "done"; model: string };

interface PreparedContext {
  conversation: Awaited<ReturnType<typeof db.conversation.findFirst>>;
  history: ChatMessage[];
  systemPrompt: string;
  model: ReturnType<typeof routeToModel>["model"];
  modelTier: string;
  tools: ReturnType<typeof getToolsForContext>;
}

/** Shared context assembly (history + integrations + memory + model + tools). */
async function prepareContext(input: RunAIConversationInput): Promise<PreparedContext> {
  const { userId, conversationId, newMessage, planTier, workspaceId, userName } = input;

  const conversation = conversationId
    ? await db.conversation.findFirst({ where: { id: conversationId, userId } })
    : null;

  const rawHistory: ChatMessage[] =
    ((conversation?.messages as unknown) as ChatMessage[]) ?? [];
  const history = pruneConversationHistory(rawHistory).filter((m) => m.role !== "system");

  const integrations = workspaceId
    ? await db.integration.findMany({
        where: { workspaceId, isActive: true },
        select: { provider: true },
      })
    : [];
  const connectedIntegrations = integrations.map((i: { provider: string }) => i.provider);

  const workspace = workspaceId
    ? await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    : null;
  const workspaceSettings = workspace?.settings as Record<string, unknown> | undefined;

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

  const complexityScore = scoreComplexity(newMessage);
  const { model, tier: modelTier } = routeToModel(complexityScore, planTier);
  const tools = getToolsForContext(userId, workspaceId, planTier, connectedIntegrations);

  return { conversation, history, systemPrompt, model, modelTier, tools };
}

/**
 * Streaming orchestrator — same pipeline as runAIConversation, but streams the
 * tool-process trail + answer text live, and moves persistence/metering/memory
 * into the post-stream finalize step. `write` emits one ChatStreamEvent per line.
 */
export async function streamAIConversation(
  input: RunAIConversationInput,
  write: (e: ChatStreamEvent) => void,
): Promise<void> {
  const { userId, planTier, workspaceId, newMessage } = input;

  // Usage check happens before the stream starts.
  const usage = await checkAndIncrementUsage(userId, planTier, workspaceId);
  if (usage.blocked) {
    write({
      t: "blocked",
      response: `You've reached your ${planTier} plan limit for this month (${usage.limit} messages). Upgrade your plan to continue.`,
    });
    return;
  }

  const { conversation, history, systemPrompt, model, modelTier, tools } =
    await prepareContext(input);

  // Ensure a conversation row exists up front so its id + Recent-list entry are
  // available immediately (survives if the user navigates away mid-stream).
  let convId = conversation?.id;
  if (!convId) {
    const created = await db.conversation.create({
      data: { userId, workspaceId: workspaceId ?? null, messages: [], title: newMessage.slice(0, 60) },
    });
    convId = created.id;
  }
  write({ t: "meta", conversationId: convId });

  const messages = [...history, { role: "user" as const, content: newMessage }];
  const steps: Array<{ tool: string; label: string }> = [];
  let finalText = "";

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: stepCountIs(5),
    });

    for await (const part of result.fullStream) {
      const p = part as { type: string; toolName?: string; text?: string; error?: unknown };
      switch (p.type) {
        case "tool-call": {
          const tool = p.toolName ?? "tool";
          const label = labelForTool(tool);
          steps.push({ tool, label });
          write({ t: "step", tool, label, status: "running" });
          break;
        }
        case "tool-result": {
          write({ t: "step", tool: p.toolName ?? "tool", label: labelForTool(p.toolName ?? "tool"), status: "done" });
          break;
        }
        case "text-delta": {
          const delta = p.text ?? "";
          if (delta) { finalText += delta; write({ t: "text", delta }); }
          break;
        }
        case "reasoning-delta": {
          if (p.text) write({ t: "reasoning", delta: p.text });
          break;
        }
        case "error": {
          write({ t: "error", message: String(p.error) });
          break;
        }
      }
    }

    if (!finalText.trim()) {
      finalText = "Done! Let me know if there's anything else you need.";
      write({ t: "text", delta: finalText });
    }
  } catch (error) {
    console.error("[AI] streamText failed:", error);
    write({ t: "error", message: "I hit an error processing that. Please try again." });
    write({ t: "done", model: modelTier });
    return;
  }

  // Finalize: persist messages (with the process trail), meter, update memory.
  const now = new Date().toISOString();
  const updatedMessages: ChatMessage[] = [
    ...history,
    { role: "user", content: newMessage, timestamp: now },
    { role: "assistant", content: finalText, timestamp: now, steps },
  ];
  await db.conversation.update({
    where: { id: convId },
    data: {
      messages: updatedMessages as unknown as Prisma.InputJsonValue,
      title: conversation?.title ?? newMessage.slice(0, 60),
      updatedAt: new Date(),
    },
  });
  await db.aiUsageLog.create({
    data: { userId, workspaceId: workspaceId ?? null, model: modelTier, feature: "chat" },
  });
  if (hasFeature(planTier, "persistentMemory") && shouldUpdateMemory(updatedMessages.length)) {
    updateMemoryAsync(userId, updatedMessages, systemPrompt, model).catch(() => {});
  }

  write({ t: "done", model: modelTier });
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
