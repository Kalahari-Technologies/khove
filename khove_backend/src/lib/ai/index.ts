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
import { labelForTool } from "@backend/lib/ai/tool-labels";

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
  | { t: "step"; tool: string; label: string; detail?: string; category: string; status: "running" | "done" }
  | { t: "thought"; text: string; strip?: boolean }
  | { t: "text"; delta: string }
  | { t: "blocked"; response: string }
  | { t: "error"; message: string }
  | { t: "done"; model: string };

/** One entry in the assistant's process trail (persisted + rendered). */
export interface ProcessItem {
  kind: "thought" | "tool";
  label: string;
  detail?: string;
  tool?: string;
  category?: string;
}

/** Coarse tool category → drives the icon in the UI. */
function toolCategory(name: string): string {
  if (/task/i.test(name)) return "tasks";
  if (/calendar|event|availability|conflict|focus|reschedule/i.test(name)) return "calendar";
  if (/jira/i.test(name)) return "jira"; // before github — Jira tool names contain "Issue"
  if (/repo|pull|issue|github/i.test(name)) return "github";
  if (/thread/i.test(name)) return "threads";
  return "other";
}

/** A short human detail for a tool call, taken from its input (e.g. "owner/repo"). */
function stepDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  if (typeof o.owner === "string" && typeof o.repo === "string") {
    return `${o.owner}/${o.repo}${o.pullNumber != null ? `#${String(o.pullNumber)}` : ""}`;
  }
  const first = o.title ?? o.summary ?? o.issueKey ?? o.jql ?? o.query ?? o.repo ?? o.status ?? o.threadId ?? o.name;
  if (typeof first === "string" && first.trim()) return first.slice(0, 48);
  return undefined;
}

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
  const process: ProcessItem[] = [];
  let finalText = "";
  let stepText = ""; // text produced within the current step (narration until proven answer)
  let reasoningBuf = "";

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: stepCountIs(5),
    });

    for await (const part of result.fullStream) {
      const p = part as { type: string; toolName?: string; text?: string; input?: unknown; error?: unknown };
      switch (p.type) {
        case "start-step": {
          stepText = "";
          reasoningBuf = "";
          break;
        }
        case "text-delta": {
          const delta = p.text ?? "";
          if (delta) { stepText += delta; finalText += delta; write({ t: "text", delta }); }
          break;
        }
        case "reasoning-delta": {
          if (p.text) reasoningBuf += p.text;
          break;
        }
        case "tool-call": {
          // Any narration produced before this tool call is a "thought", not the
          // answer — flush it as such and strip it from the streamed answer.
          const thought = stepText.trim();
          if (thought) {
            process.push({ kind: "thought", label: "Thinking", detail: thought });
            write({ t: "thought", text: thought, strip: true });
            finalText = finalText.replace(stepText, "").replace(/^\s+/, "");
            stepText = "";
          }
          const tool = p.toolName ?? "tool";
          const label = labelForTool(tool);
          const detail = stepDetail(p.input);
          const category = toolCategory(tool);
          process.push({ kind: "tool", tool, label, detail, category });
          write({ t: "step", tool, label, detail, category, status: "running" });
          break;
        }
        case "tool-result": {
          const tool = p.toolName ?? "tool";
          write({ t: "step", tool, label: labelForTool(tool), category: toolCategory(tool), status: "done" });
          break;
        }
        case "finish-step": {
          const th = reasoningBuf.trim();
          if (th) {
            process.push({ kind: "thought", label: "Thinking", detail: th });
            write({ t: "thought", text: th });
            reasoningBuf = "";
          }
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
    { role: "assistant", content: finalText, timestamp: now, steps: process },
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
