import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getWorkspaceBySlug,
  getWorkspaceMembership,
} from "@/lib/workspace/get-workspace";
import Link from "next/link";

export default async function WorkspaceSettingsPage({
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

  const isOwner = membership.role === "OWNER";
  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">
            Workspace Settings
          </h1>
          <p className="text-[13px] text-white/50 mt-1">
            {workspace.isPersonal ? "Your personal workspace" : workspace.name}
          </p>
        </div>

        {/* General */}
        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold text-white/70 uppercase tracking-wide">
            General
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-3 border-b border-white/[0.07]">
              <div>
                <p className="text-[13px] text-white/80">Name</p>
                <p className="text-[12px] text-white/40 mt-0.5">{workspace.name}</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/[0.07]">
              <div>
                <p className="text-[13px] text-white/80">URL slug</p>
                <p className="text-[12px] text-white/40 mt-0.5">/{workspace.slug}</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/[0.07]">
              <div>
                <p className="text-[13px] text-white/80">Plan</p>
                <p className="text-[12px] text-white/40 mt-0.5">{workspace.planTier}</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/[0.07]">
              <div>
                <p className="text-[13px] text-white/80">Your role</p>
                <p className="text-[12px] text-white/40 mt-0.5">{membership.role}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Members link */}
        {isAdmin && (
          <section className="space-y-4">
            <h2 className="text-[13px] font-semibold text-white/70 uppercase tracking-wide">
              Team
            </h2>
            <Link
              href={`/${slug}/settings/members`}
              className="flex items-center justify-between py-3 px-4 rounded-lg border border-white/[0.07] hover:bg-white/[0.03] transition-colors duration-[120ms]"
            >
              <div>
                <p className="text-[13px] text-white/80">Members</p>
                <p className="text-[12px] text-white/40 mt-0.5">Manage workspace members and roles</p>
              </div>
              <span className="text-white/30 text-[12px]">&rarr;</span>
            </Link>
          </section>
        )}

        {/* Danger zone */}
        {isOwner && !workspace.isPersonal && (
          <section className="space-y-4">
            <h2 className="text-[13px] font-semibold text-red-400/80 uppercase tracking-wide">
              Danger zone
            </h2>
            <div className="rounded-lg border border-red-400/20 p-4">
              <p className="text-[13px] text-white/70">Delete this workspace</p>
              <p className="text-[12px] text-white/40 mt-1">
                This will permanently delete the workspace and all its data. This action cannot be undone.
              </p>
              <button className="mt-3 px-3 py-1.5 rounded-md text-[12px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors duration-[120ms]">
                Delete workspace
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
