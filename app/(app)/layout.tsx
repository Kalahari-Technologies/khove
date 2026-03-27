import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import AppSidebar from "@/components/app-sidebar";
import { RealtimeProvider } from "@/components/realtime-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const recentConversations = await db.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, title: true, updatedAt: true },
  });

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      <AppSidebar
        user={{
          name: user.name,
          email: user.email,
          planTier: user.planTier,
        }}
        recentConversations={recentConversations.map((c) => ({
          id: c.id,
          title: c.title ?? "Untitled conversation",
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
      <RealtimeProvider />
      <main className="flex-1 overflow-hidden bg-black">{children}</main>
    </div>
  );
}
