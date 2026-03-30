import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspaceBySlug } from "@/lib/workspace/get-workspace";
import { ChatClient } from "./chat-client";
import type { ChatMessage } from "@/lib/types";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  const { conversationId } = await searchParams;

  let initialMessages: ChatMessage[] = [];
  let loadedConversationId: string | undefined;

  if (conversationId) {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, userId: user.id, workspaceId: workspace.id },
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
