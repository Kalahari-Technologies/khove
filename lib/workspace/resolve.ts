import { db } from "@/lib/db";
import type { Workspace, WorkspaceMember } from "@prisma/client";

/**
 * Look up a workspace by its URL slug.
 */
export async function resolveWorkspaceBySlug(
  slug: string
): Promise<Workspace | null> {
  return db.workspace.findUnique({ where: { slug } });
}

/**
 * Check if a user is a member of a workspace. Returns the membership record or null.
 */
export async function resolveWorkspaceMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMember | null> {
  return db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

/**
 * Require that a user is a member of a workspace.
 * Throws an error if the user is not a member.
 */
export async function requireWorkspaceMembership(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMember> {
  const membership = await resolveWorkspaceMembership(workspaceId, userId);
  if (!membership) {
    throw new Error("Not a member of this workspace");
  }
  return membership;
}
