import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <ChatClient
      userName={user.name ?? user.email.split("@")[0]}
      planTier={user.planTier}
    />
  );
}
