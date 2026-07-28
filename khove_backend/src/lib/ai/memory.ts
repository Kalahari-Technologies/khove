/**
 * AI memory layer.
 *
 * PILOT DIRECTION (Technical PRD §16): memory moves to mem0, self-hosted and
 * workspace-scoped, via `./memory/scoped`. The mem0-backed API below is the
 * target; the legacy Redis blob (bottom of file) is kept only so the current
 * `runAIConversation` keeps compiling until the swap lands.
 *
 * To wire the new path into `lib/ai/index.ts`:
 *   - Step 2: `const recalled = await recallMemory(workspaceId, userId, newMessage)`
 *             then pass `formatRecalledMemories(recalled)` as `userMemorySummary`.
 *   - Step 8: replace `updateMemoryAsync(...)` with
 *             `rememberConversation(workspaceId, userId, updatedMessages).catch(()=>{})`.
 */

import { redis } from "@backend/lib/redis";
import { scopedMemory, type MemoryRecord } from "./memory/scoped";

type Msg = { role: string; content: string };

// ---------------------------------------------------------------------------
// Cadence — batch writes to bound extraction cost (mem0 makes an LLM call/add)
// ---------------------------------------------------------------------------

/**
 * Determine if memory should be written this turn. Every 10 messages, matching
 * the historical cadence, to avoid an extraction call on every turn.
 */
export function shouldUpdateMemory(messageCount: number): boolean {
  return messageCount > 0 && messageCount % 10 === 0;
}

// ---------------------------------------------------------------------------
// mem0-backed, workspace-scoped memory (target API). All calls are non-throwing
// — a memory failure must never crash a conversation (architecture rule).
// ---------------------------------------------------------------------------

/**
 * Recall memories relevant to a (workspace, user) request: workspace work
 * content + the user's content-free preferences. Returns [] on any failure.
 */
export async function recallMemory(
  workspaceId: string,
  userId: string,
  query: string,
  opts: { threadId?: string; agentId?: string; limit?: number } = {}
): Promise<MemoryRecord[]> {
  try {
    const mem = scopedMemory(workspaceId, userId);
    const [work, prefs] = await Promise.all([
      mem.recall(query, opts),
      mem.recallPreferences(query),
    ]);
    return [...work, ...prefs];
  } catch (err) {
    console.error("[memory] recall failed:", err);
    return [];
  }
}

/**
 * Persist recent conversation turns as workspace memory. Non-throwing.
 * Pass `threadId` to attach the memory to a Connectivity Thread (Thread tier).
 */
export async function rememberConversation(
  workspaceId: string,
  userId: string,
  messages: Msg[],
  opts: { threadId?: string; sources?: string[] } = {}
): Promise<void> {
  try {
    await scopedMemory(workspaceId, userId).remember(messages.slice(-20), opts);
  } catch (err) {
    console.error("[memory] remember failed:", err);
  }
}

/**
 * Record an agent's cross-thread learning (e.g. the PR Shepherd noticing a
 * team's review pattern), scoped per workspace (Agent tier). Non-throwing.
 */
export async function rememberAgentLearning(
  workspaceId: string,
  userId: string,
  agentId: string,
  note: string,
  sources: string[] = []
): Promise<void> {
  try {
    await scopedMemory(workspaceId, userId).remember(
      [{ role: "system", content: note }],
      { agentId, sources }
    );
  } catch (err) {
    console.error("[memory] agent learning failed:", err);
  }
}

/**
 * Format recalled memories for injection into the system prompt. Keeps source
 * refs so recalled context stays citable (evidence-backed posture, §12).
 */
export function formatRecalledMemories(records: MemoryRecord[]): string | undefined {
  if (!records.length) return undefined;
  return records
    .map((r) => {
      const sources = r.metadata?.sources as string[] | undefined;
      const src = sources?.length ? ` [${sources.join(", ")}]` : "";
      return `- ${r.memory}${src}`;
    })
    .join("\n");
}

/** Clear all memory for a workspace (disconnect / reset / erasure). Non-throwing. */
export async function clearWorkspaceMemory(
  workspaceId: string,
  userId: string
): Promise<void> {
  try {
    await scopedMemory(workspaceId, userId).forgetWorkspace();
  } catch (err) {
    console.error("[memory] clear failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Legacy Redis memory — DEPRECATED, replaced by the mem0 API above.
// Retained so `runAIConversation` compiles until the mem0 swap is wired in.
// ---------------------------------------------------------------------------

const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const MAX_MEMORY_LENGTH = 2000; // chars
const legacyKey = (userId: string) => `memory:user:${userId}`;

/** @deprecated user-scoped Redis blob — use {@link recallMemory} (workspace-scoped mem0). */
export async function getUserMemory(userId: string): Promise<string | null> {
  return redis.get<string>(legacyKey(userId));
}

/** @deprecated use {@link rememberConversation}. */
export async function updateUserMemory(userId: string, memorySummary: string): Promise<void> {
  const truncated = memorySummary.slice(0, MAX_MEMORY_LENGTH);
  await redis.set(legacyKey(userId), truncated, { ex: MEMORY_TTL_SECONDS });
}

/** @deprecated use {@link clearWorkspaceMemory}. */
export async function clearUserMemory(userId: string): Promise<void> {
  await redis.del(legacyKey(userId));
}
