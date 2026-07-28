import { db } from "@backend/lib/db";
import { generateUniqueSlug } from "@backend/lib/workspace/slug";
import { randomGradientKey } from "@backend/lib/workspace/gradients";
import type { Workspace, StatusCategory } from "@prisma/client";

const DEFAULT_STATUSES: {
  name: string;
  color: string;
  category: StatusCategory;
  position: number;
  isDefault: boolean;
}[] = [
  { name: "Todo", color: "#71717A", category: "NOT_STARTED", position: 0, isDefault: true },
  { name: "In Progress", color: "#6366F1", category: "IN_PROGRESS", position: 1, isDefault: false },
  { name: "In Review", color: "#F59E0B", category: "IN_REVIEW", position: 2, isDefault: false },
  { name: "Blocked", color: "#F43F5E", category: "BLOCKED", position: 3, isDefault: false },
  { name: "Done", color: "#10B981", category: "DONE", position: 4, isDefault: false },
  { name: "Cancelled", color: "#3F3F46", category: "CANCELLED", position: 5, isDefault: false },
];

/**
 * Ensure a personal workspace exists for the given user.
 * Idempotent — returns the existing personal workspace if one exists.
 * Creates workspace + OWNER membership + default workflow statuses in a transaction.
 */
export async function ensurePersonalWorkspace(user: {
  id: string;
  name: string | null;
  email: string;
}): Promise<Workspace> {
  // Check if personal workspace already exists
  const existing = await db.workspace.findFirst({
    where: { ownerId: user.id, isPersonal: true },
  });
  if (existing) return existing;

  // Generate slug from name or email prefix
  const baseName = user.name || user.email.split("@")[0];
  const slug = await generateUniqueSlug(baseName);

  // Create workspace + membership + statuses in a transaction
  const workspace = await db.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: "My Space",
        slug,
        isPersonal: true,
        gradient: randomGradientKey(),
        ownerId: user.id,
        planTier: "FREE",
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    // Seed default workflow statuses for this workspace
    await tx.workflowStatus.createMany({
      data: DEFAULT_STATUSES.map((s) => ({
        name: s.name,
        color: s.color,
        category: s.category,
        position: s.position,
        isDefault: s.isDefault,
        isSystem: false,
        workspaceId: ws.id,
      })),
    });

    return ws;
  });

  return workspace;
}
