import { redirect } from "next/navigation";
import { serverTRPC } from "@/lib/trpc/server";
import { MembersManager } from "@/components/members-manager";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const base = await serverTRPC();
  const me = await base.workspace.me.query().catch(() => null);
  if (!me) redirect("/login");
  const ws = await base.workspace.getBySlug.query({ slug }).catch(() => null);
  if (!ws) redirect("/login");

  const isAdmin = ws.currentRole === "OWNER" || ws.currentRole === "ADMIN";
  if (!isAdmin) redirect(`/${slug}/settings`);

  const trpc = await serverTRPC(ws.id);
  const members = await trpc.workspace.listMembers.query();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">
            Members
          </h1>
          <p className="text-[13px] text-white/50 mt-1">
            Manage who has access to{" "}
            {ws.isPersonal ? "your personal workspace" : ws.name}
          </p>
        </div>

        <MembersManager
          workspaceId={ws.id}
          currentUserId={me.user.id}
          currentUserRole={ws.currentRole}
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
