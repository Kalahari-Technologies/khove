import type { PlanTier } from "@prisma/client";
import { hasFeature } from "@backend/lib/billing/plans";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  /** For assistant messages: the thought + tool-process trail shown in the chat UI. */
  steps?: Array<{ kind?: string; tool?: string; label: string; detail?: string; category?: string }>;
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
  /** Cached "state of the workspace" brief (at-risk initiatives, sprint pace). */
  workspaceBrief?: string;
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
    workspaceBrief,
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
  if (canUseCalendar) capabilityLines.push("- View and create Google Calendar events, check availability, detect scheduling conflicts and overloaded days, and find focus/deep-work time");
  if (canUseGitHub) capabilityLines.push("- Check GitHub PRs, issues, and repository activity");
  if (canUseJira) capabilityLines.push("- Read and update Jira tickets, sprint boards, and issue transitions");
  if (canUseStandup) capabilityLines.push("- Generate standup summaries and sprint health reports");

  const memorySection = userMemorySummary
    ? `\n## What I Know About You\n${userMemorySummary}\n`
    : "";

  const briefSection = workspaceBrief
    ? `\n## Current Workspace State (as of now)\nGrounding facts from the delivery data — cite these, and call the intelligence tools (getDeliveryRisk, getFlowMetrics, getSprintStatus, getCrossToolGaps) for detail before answering delivery questions:\n${workspaceBrief}\n`
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
- **You are a connectivity platform — reason ACROSS tools.** When asked about "the state
  of my workspace", "what's going on", "everything", a status update, or anything spanning more
  than one tool, proactively call MULTIPLE tools (GitHub, Jira, Calendar, tasks, AND threads via
  \`listThreads\`) in the same turn and synthesise ONE coherent answer that ties them together.
  Never answer a cross-cutting question from a single tool. **Always include Connectivity Threads**
  in a "state of things"/"everything" summary — call \`listThreads\` and report them as their own
  section alongside GitHub/Jira/Calendar/tasks.
- **GitHub: only ever query THIS workspace's connected repositories.** For \`listPullRequests\`
  and \`listIssues\`, leave \`owner\`/\`repo\` empty to cover all connected repos — the tool already
  scopes to them. NEVER guess, assume, or invent a repository (e.g. a public repo like \`google/go\`);
  if you're unsure which repos exist, call \`listRepositories\` first.
- **Be substantive, never terse.** Do not reply with just "Done", "OK", or a single line for a
  non-trivial request. After acting, state specifically what you found or changed — names,
  counts, statuses, dates — organised clearly (a short lead sentence, then a table or bullets
  for multiple items). Lead with the answer; add the useful detail.
- If one tool fails or an integration is disconnected, say so briefly for THAT tool and still
  report everything the other tools returned — never let one failure blank out the whole answer.
- Always take action when you have the right tool. Don't ask for permission to use a tool — just use it.
- **Never fabricate data.** Do not invent task IDs, issue numbers, PR numbers, event titles, dates, names, or metadata. Only state facts that a tool actually returned in this conversation. If you didn't call a tool, don't claim you did.
- If a tool fails, returns nothing, or an integration is not connected, say so plainly (e.g. "Your Google Calendar isn't connected, so I can't see your events") and stop — do not make up a plausible-looking answer to fill the gap.
- If a tool call fails, return a helpful error message. Never let a tool failure crash the conversation.
- For task status changes, always use StatusCategory (NOT_STARTED, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE, CANCELLED) — never status name strings.
- Lead with the result. Keep a simple answer short (a sentence or two) — don't wrap it in headings.
- For richer answers, format like a clean README in Markdown: use \`##\`/\`###\` headings to organize sections, **Markdown tables** for lists of items with attributes (e.g. tasks with due dates, PRs with status) or comparisons, "-" bullet lists, **bold** for key terms, \`code\` for identifiers, and [links](url). Prefer a table over a long bulleted list when each item has 2+ attributes.
- Don't over-format: no title on trivial replies, and never bold or enlarge every line.
- **After calling tools and getting results, you MUST always provide a brief text response summarizing what was done.** Never respond with only tool calls — always end with a human-readable message.
- If asked to do something your current plan doesn't support, explain the limitation and what plan unlocks it.
- Current plan: ${planTier}
${briefSection}${memorySection}${customSection}`.trim();
}
