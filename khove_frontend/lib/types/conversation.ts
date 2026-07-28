import type { Conversation } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type { Conversation };

export type ConversationWithMessages = Prisma.ConversationGetPayload<{
  select: { id: true; messages: true };
}>;

export type ConversationSummary = Prisma.ConversationGetPayload<{
  select: { id: true; title: true; updatedAt: true };
}>;

/**
 * A single message stored in the `Conversation.messages` JSON column.
 * Since Prisma types JSON as `Prisma.JsonValue`, callers must cast:
 *   `conversation.messages as unknown as ChatMessage[]`
 */
export interface ChatStep {
  tool: string;
  label: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** ISO string — optional for backward compatibility with older records. */
  timestamp?: string;
  model?: string;
  /** Assistant tool-process trail, shown as a collapsible block. */
  steps?: ChatStep[];
}

/**
 * Runtime message used in the chat UI (client-side only).
 * Has a stable `id` for React keys and a native `Date` timestamp.
 */
export interface ClientChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
  steps?: ChatStep[];
}
