import type { Workspace, WorkspaceMember } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type { Workspace, WorkspaceMember };

export type WorkspaceWithMembers = Prisma.WorkspaceGetPayload<{
  include: { members: true };
}>;
