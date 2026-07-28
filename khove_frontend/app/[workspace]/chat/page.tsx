import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { ChatClient } from "./chat-client";
import type { ChatMessage } from "@/lib/types";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const me = await base.workspace.me.query().catch(() => null);
  if (!me) redirect("/login");
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const { conversationId } = await searchParams;

  let initialMessages: ChatMessage[] = [];
  let loadedConversationId: string | undefined;

  if (conversationId) {
    const trpc = await serverTRPC(ws.id);
    const conversation = await trpc.conversation.get
      .query({ id: conversationId })
      .catch(() => null);
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
      userName={me.user.name ?? me.user.email.split("@")[0]}
      planTier={me.user.planTier}
      conversationId={loadedConversationId}
      initialMessages={initialMessages}
    />
  );
}
