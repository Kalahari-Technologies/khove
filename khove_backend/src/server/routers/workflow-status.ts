import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";

export const workflowStatusRouter = router({
  /** Workflow statuses available to the active workspace (its own + global defaults). */
  list: workspaceProcedure.query(async ({ ctx }) => {
    return db.workflowStatus.findMany({
      where: { OR: [{ workspaceId: ctx.workspace.id }, { workspaceId: null }] },
      orderBy: { position: "asc" },
    });
  }),
});
