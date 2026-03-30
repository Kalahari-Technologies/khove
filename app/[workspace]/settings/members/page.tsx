import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  getWorkspaceBySlug,
  getWorkspaceMembership,
} from "@/lib/workspace/get-workspace";
import { MembersManager } from "@/components/members-manager";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspace: slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) redirect("/login");

  const membership = await getWorkspaceMembership(workspace.id, user.id);
  if (!membership) redirect("/login");

  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";
  if (!isAdmin) redirect(`/${slug}/settings`);

  const members = await db.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">
            Members
          </h1>
          <p className="text-[13px] text-white/50 mt-1">
            Manage who has access to {workspace.isPersonal ? "your personal workspace" : workspace.name}
          </p>
        </div>

        <MembersManager
          workspaceId={workspace.id}
          currentUserId={user.id}
          currentUserRole={membership.role}
          members={members.map((m) => ({
            userId: m.userId,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            joinedAt: m.joinedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
