/**
 * Tenant-safe memory scoping over mem0 (self-hosted / OSS).
 *
 * The isolation boundary is `workspaceId`. mem0 is NEVER called directly —
 * every read/write goes through `scopedMemory(workspaceId, userId)`, which
 * injects the workspace filter and refuses a call missing it. See the two
 * scopes (workspace vs personal) in Technical PRD §16.2.
 *
 * DRAFT — pilot direction (PRD §16). Not yet wired into `runAIConversation`.
 * `mem0ai` is loaded LAZILY (dynamic import) so importing this module never
 * requires the dependency; only actually calling a memory op needs it.
 * Setup before the memory ops run:
 *   1. `npm i mem0ai`.
 *   2. Enable pgvector on Supabase (`create extension if not exists vector;`).
 *   3. Verify the provider/config keys against the installed mem0ai version.
 */

const EMBED_DIM = 768; // gemini text-embedding-004
// Non-literal specifier — kept out of static analysis so the optional,
// draft-stage dependency is not required at module load.
const MEM0_MODULE = "mem0ai/oss";

export interface MemoryRecord {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface RememberOptions {
  threadId?: string; // → mem0 runId (Thread tier)
  agentId?: string; // → mem0 agentId (Agent tier)
  sources?: string[]; // citable refs — PR #, ticket key, taskId
}

export interface RecallOptions {
  threadId?: string;
  agentId?: string;
  limit?: number;
}

type Msg = { role: string; content: string };

// ---------------------------------------------------------------------------
// Lazy singleton client (self-hosted: pgvector + Gemini embeddings/LLM)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(): Promise<any> {
  if (_client) return _client;
  const { Memory } = await import(MEM0_MODULE);
  _client = new Memory({
    version: "v1.1",
    vectorStore: {
      provider: "pgvector",
      config: {
        connectionString: process.env.DATABASE_URL,
        collectionName: "khove_memories",
        dimension: EMBED_DIM,
      },
    },
    embedder: {
      provider: "google",
      config: {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        model: "text-embedding-004",
      },
    },
    llm: {
      provider: "google",
      config: {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        model: "gemini-2.5-flash-lite",
      },
    },
  });
  return _client;
}

// mem0 versions return either an array or `{ results: [...] }` — handle both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecords(res: any): MemoryRecord[] {
  const rows = Array.isArray(res) ? res : (res?.results ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    id: r.id,
    memory: r.memory ?? r.text ?? "",
    score: r.score,
    metadata: r.metadata,
  }));
}

// ---------------------------------------------------------------------------
// The scoped surface — the ONLY way to touch mem0
// ---------------------------------------------------------------------------

export function scopedMemory(workspaceId: string, userId: string) {
  if (!workspaceId) {
    throw new Error("scopedMemory: workspaceId is required (tenant boundary)");
  }
  if (!userId) {
    throw new Error("scopedMemory: userId is required");
  }

  return {
    /** Work content — scoped to this workspace, never crosses it. */
    async remember(messages: Msg[], opts: RememberOptions = {}): Promise<void> {
      await (await client()).add(messages, {
        userId,
        runId: opts.threadId,
        agentId: opts.agentId,
        metadata: { workspaceId, scope: "workspace", sources: opts.sources },
      });
    },

    /**
     * Preferences / working style only — MUST be content-free so it can safely
     * follow the user across their own workspaces. Do not pass work content here.
     */
    async rememberPreference(messages: Msg[]): Promise<void> {
      await (await client()).add(messages, {
        userId,
        metadata: { scope: "personal" },
      });
    },

    /** Recall work content for THIS workspace (optionally a thread/agent). */
    async recall(query: string, opts: RecallOptions = {}): Promise<MemoryRecord[]> {
      const res = await (await client()).search(query, {
        userId,
        runId: opts.threadId,
        agentId: opts.agentId,
        limit: opts.limit ?? 8,
        filters: { workspaceId, scope: "workspace" },
      });
      return toRecords(res);
    },

    /** Recall the user's cross-workspace preferences (content-free). */
    async recallPreferences(query: string, limit = 4): Promise<MemoryRecord[]> {
      const res = await (await client()).search(query, {
        userId,
        limit,
        filters: { scope: "personal" },
      });
      return toRecords(res);
    },

    /** Delete all memory for this workspace (disconnect / erasure request). */
    async forgetWorkspace(): Promise<void> {
      await (await client()).deleteAll({ userId, filters: { workspaceId } });
    },
  };
}

export type ScopedMemory = ReturnType<typeof scopedMemory>;
