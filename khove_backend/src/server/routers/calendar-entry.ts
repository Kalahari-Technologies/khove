import { z } from "zod";
import { router, workspaceProcedure } from "@backend/server/trpc";
import { db } from "@backend/lib/db";

export const calendarEntryRouter = router({
  /** External display-only calendar entries for the workspace (planner view). */
  list: workspaceProcedure
    .input(z.object({ from: z.date().optional(), to: z.date().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.calendarEntry.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          ...((input?.from || input?.to) && {
            startDate: {
              ...(input?.from && { gte: input.from }),
              ...(input?.to && { lte: input.to }),
            },
          }),
        },
        orderBy: { startDate: "asc" },
      });
    }),
});
