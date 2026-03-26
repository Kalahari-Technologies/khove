import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ChatClient } from "./chat-client";
import type { ChatMessage } from "@/lib/types";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { conversationId?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { conversationId } = searchParams;

  let initialMessages: ChatMessage[] = [];
  let loadedConversationId: string | undefined;

  if (conversationId) {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
      select: { id: true, messages: true },
    });

    if (conversation) {
      loadedConversationId = conversation.id;
      const raw = conversation.messages as unknown as ChatMessage[];
      initialMessages = Array.isArray(raw)
        ? raw.filter((m) => m.role === "user" || m.role === "assistant")
        : [];
    }
  }

  return (
    <ChatClient
      key={loadedConversationId ?? "new"}
      userName={user.name ?? user.email.split("@")[0]}
      planTier={user.planTier}
      conversationId={loadedConversationId}
      initialMessages={initialMessages}
    />
  );
}
