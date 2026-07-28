import type { PlanTier } from "@prisma/client";
import { hasFeature } from "@backend/lib/billing/plans";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

const MAX_CONVERSATION_MESSAGES = 40;

/**
 * Prune conversation history to the last MAX_CONVERSATION_MESSAGES messages.
 * Preserves the system message if present as the first item.
 */
export function pruneConversationHistory(messages: ChatMessage[]): ChatMessage[] {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const pruned = nonSystem.slice(-MAX_CONVERSATION_MESSAGES);
  return [...systemMessages, ...pruned];
}

interface SystemPromptOptions {
  userName: string;
  planTier: PlanTier;
  connectedIntegrations: string[];
  workspaceSettings?: Record<string, unknown>;
  userMemorySummary?: string;
  currentDate: string;
}

/**
 * Assemble the AI system prompt.
 * Adapts content to the user's plan and connected integrations.
 */
export function assembleSystemPrompt(opts: SystemPromptOptions): string {
  const {
    userName,
    planTier,
    connectedIntegrations,
    workspaceSettings,
    userMemorySummary,
    currentDate,
  } = opts;

  const aiInstructions = (workspaceSettings?.aiInstructions as string) ?? "";

  const integrationList =
    connectedIntegrations.length > 0
      ? connectedIntegrations.join(", ")
      : "none yet";

  const canUseCalendar = hasFeature(planTier, "calendarTools") && connectedIntegrations.includes("GOOGLE_CALENDAR");
  const canUseGitHub = hasFeature(planTier, "githubTools") && connectedIntegrations.includes("GITHUB");
  const canUseJira = hasFeature(planTier, "jiraTools") && connectedIntegrations.includes("JIRA");
  const canUseStandup = hasFeature(planTier, "standupAutomation");

  const capabilityLines: string[] = [
    "- Create, update, list, and manage tasks",
  ];
  if (canUseCalendar) capabilityLines.push("- View and create Google Calendar events, check availability");
  if (canUseGitHub) capabilityLines.push("- Check GitHub PRs, issues, and repository activity");
  if (canUseJira) capabilityLines.push("- Read and update Jira tickets, sprint boards, and issue transitions");
  if (canUseStandup) capabilityLines.push("- Generate standup summaries and sprint health reports");

  const memorySection = userMemorySummary
    ? `\n## What I Know About You\n${userMemorySummary}\n`
    : "";

  const customSection = aiInstructions
    ? `\n## Workspace Instructions\n${aiInstructions}\n`
    : "";

  return `You are Khove, an AI work assistant for ${userName}. Today is ${currentDate}.

You connect the tools teams already use — GitHub, Jira, and Google Calendar — into a single intelligent interface. You take action, not just talk. When asked to do something, do it using the available tools.

## Your Capabilities
${capabilityLines.join("\n")}

## Active Integrations
${integrationList}

## Behavior Rules
- Always take action when you have the right tool. Don't ask for permission to use a tool — just use it.
- If a tool call fails, return a helpful error message. Never let a tool failure crash the conversation.
- For task status changes, always use StatusCategory (NOT_STARTED, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE, CANCELLED) — never status name strings.
- Keep responses concise and direct. Lead with the result, not the reasoning.
- **After calling tools and getting results, you MUST always provide a brief text response summarizing what was done.** Never respond with only tool calls — always end with a human-readable message.
- If asked to do something your current plan doesn't support, explain the limitation and what plan unlocks it.
- Current plan: ${planTier}
${memorySection}${customSection}`.trim();
}
