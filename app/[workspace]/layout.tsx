import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getWorkspaceBySlug,
  getWorkspaceMembership,
  getPersonalWorkspace,
  getUserWorkspaces,
} from "@/lib/workspace/get-workspace";
import { WorkspaceProvider } from "@/lib/workspace/workspace-context";
import AppSidebar from "@/components/app-sidebar";
import { RealtimeProvider } from "@/components/realtime-provider";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;

  // Resolve workspace by slug
  let workspace = await getWorkspaceBySlug(slug);

  // If workspace not found, redirect to personal workspace
  if (!workspace) {
    const personal = await getPersonalWorkspace(user.id);
    if (personal) {
      redirect(`/${personal.slug}/chat`);
    }
    // Shouldn't happen — ensurePersonalWorkspace runs in auth
    redirect("/login");
  }

  // Check membership
  const membership = await getWorkspaceMembership(workspace.id, user.id);
  if (!membership) {
    // Not a member — redirect to personal workspace
    const personal = await getPersonalWorkspace(user.id);
    if (personal) {
      redirect(`/${personal.slug}/chat`);
    }
    redirect("/login");
  }

  // Fetch workspace-scoped conversations
  const recentConversations = await db.conversation.findMany({
    where: { userId: user.id, workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, title: true, updatedAt: true },
  });

  // Fetch all user's workspaces (for switcher)
  const userWorkspaces = await getUserWorkspaces(user.id);

  return (
    <WorkspaceProvider
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        isPersonal: workspace.isPersonal,
        role: membership.role,
      }}
    >
      <div className="flex h-screen bg-black overflow-hidden">
        <AppSidebar
          user={{
            name: user.name,
            email: user.email,
            planTier: user.planTier,
          }}
          workspace={{
            id: workspace.id,
            slug: workspace.slug,
            name: workspace.name,
            isPersonal: workspace.isPersonal,
            gradient: workspace.gradient,
          }}
          workspaces={userWorkspaces.map((wm) => ({
            id: wm.workspace.id,
            slug: wm.workspace.slug,
            name: wm.workspace.name,
            isPersonal: wm.workspace.isPersonal,
            gradient: wm.workspace.gradient,
            planTier: wm.workspace.planTier,
            role: wm.role,
          }))}
          recentConversations={recentConversations.map((c) => ({
            id: c.id,
            title: c.title ?? "Untitled conversation",
            updatedAt: c.updatedAt.toISOString(),
          }))}
        />
        <RealtimeProvider />
        <main className="flex-1 overflow-hidden bg-black">{children}</main>
      </div>
    </WorkspaceProvider>
  );
}
