import { redirect } from "next/navigation";
import { WorkspaceProvider } from "@/lib/workspace/workspace-context";
import { TRPCProvider } from "@/lib/trpc/Provider";
import AppSidebar from "@/components/app-sidebar";
import { RealtimeProvider } from "@/components/realtime-provider";
import { serverTRPC } from "@/lib/trpc/server";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();

  // Auth gate: current user + personal workspace (for fallbacks).
  const me = await base.workspace.me.query().catch(() => null);
  if (!me) redirect("/login");

  // Resolve the workspace by slug (throws if missing / not a member).
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) {
    if (me.personalWorkspaceSlug) redirect(`/${me.personalWorkspaceSlug}/chat`);
    redirect("/login");
  }

  // Workspace-scoped reads need x-workspace-id.
  const wsScoped = await serverTRPC(ws.id);
  const [recentConversations, userWorkspaces, pendingActions] = await Promise.all([
    wsScoped.conversation.list.query({ limit: 10 }),
    base.workspace.list.query(),
    wsScoped.agentAction.pendingCount.query().catch(() => 0),
  ]);

  return (
    <WorkspaceProvider
      workspace={{
        id: ws.id,
        slug: ws.slug,
        name: ws.name,
        isPersonal: ws.isPersonal,
        role: ws.currentRole,
      }}
    >
      <TRPCProvider>
        <div className="flex h-screen bg-black overflow-hidden">
          <AppSidebar
            user={{ name: me.user.name, email: me.user.email, planTier: me.user.planTier }}
            workspace={{
              id: ws.id,
              slug: ws.slug,
              name: ws.name,
              isPersonal: ws.isPersonal,
              gradient: ws.gradient,
            }}
            workspaces={userWorkspaces.map((w) => ({
              id: w.id,
              slug: w.slug,
              name: w.name,
              isPersonal: w.isPersonal,
              gradient: w.gradient,
              planTier: w.planTier,
              role: w.role,
            }))}
            recentConversations={recentConversations.map((c) => ({
              id: c.id,
              title: c.title ?? "Untitled conversation",
              updatedAt: c.updatedAt.toISOString(),
            }))}
            pendingActions={pendingActions}
          />
          <RealtimeProvider />
          <main className="flex-1 overflow-hidden bg-black">{children}</main>
        </div>
      </TRPCProvider>
    </WorkspaceProvider>
  );
}
