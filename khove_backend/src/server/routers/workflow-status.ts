import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";

export const workflowStatusRouter = router({
  /** Workflow statuses for the workspace; falls back to system defaults if it has none. */
  list: workspaceProcedure.query(async ({ ctx }) => {
    const own = await db.workflowStatus.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { position: "asc" },
    });
    if (own.length > 0) return own;
    return db.workflowStatus.findMany({
      where: { workspaceId: null, isSystem: true },
      orderBy: { position: "asc" },
    });
  }),
});
