import { cache } from "react";
import { db } from "@backend/lib/db";
import type { Workspace, WorkspaceMember } from "@prisma/client";

/**
 * Cached per-request workspace resolution by slug.
 * Uses React cache() to deduplicate DB queries within a single server render.
 */
export const getWorkspaceBySlug = cache(
  async (slug: string): Promise<Workspace | null> => {
    return db.workspace.findUnique({ where: { slug } });
  }
);

/**
 * Cached per-request workspace membership check.
 */
export const getWorkspaceMembership = cache(
  async (
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMember | null> => {
    return db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }
);

/**
 * Get the personal workspace for a user. Cached per request.
 */
export const getPersonalWorkspace = cache(
  async (userId: string): Promise<Workspace | null> => {
    return db.workspace.findFirst({
      where: { ownerId: userId, isPersonal: true },
    });
  }
);

/**
 * Get all workspaces a user is a member of. Cached per request.
 */
export const getUserWorkspaces = cache(
  async (
    userId: string
  ): Promise<(WorkspaceMember & { workspace: Workspace })[]> => {
    return db.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { workspace: { createdAt: "asc" } },
    });
  }
);
