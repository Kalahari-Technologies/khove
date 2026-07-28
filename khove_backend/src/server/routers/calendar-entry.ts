import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";

export const calendarEntryRouter = router({
  /** External display-only calendar entries for the workspace (planner view). */
  list: workspaceProcedure.query(async ({ ctx }) => {
    return db.calendarEntry.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { startDate: "asc" },
    });
  }),
});
