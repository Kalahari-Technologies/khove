import type { WorkspaceRole } from "@prisma/client";

/**
 * OWNER only — delete workspace, transfer ownership.
 */
export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

/**
 * OWNER or ADMIN — invite members, change settings.
 */
export function canAdminWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * OWNER, ADMIN, or MEMBER — CRUD tasks, conversations.
 */
export function canWriteWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

/**
 * Any role including VIEWER — read access.
 */
export function canReadWorkspace(role: WorkspaceRole): boolean {
  return true;
}

type PermissionLevel = "read" | "write" | "admin" | "manage";

const checkers: Record<PermissionLevel, (role: WorkspaceRole) => boolean> = {
  read: canReadWorkspace,
  write: canWriteWorkspace,
  admin: canAdminWorkspace,
  manage: canManageWorkspace,
};

/**
 * Assert that a user's workspace role meets the required permission level.
 * Throws an error with a descriptive message if insufficient.
 */
export function assertWorkspacePermission(
  role: WorkspaceRole,
  level: PermissionLevel
): void {
  if (!checkers[level](role)) {
    throw new Error(
      `Insufficient workspace permissions: requires '${level}', user role is '${role}'`
    );
  }
}
