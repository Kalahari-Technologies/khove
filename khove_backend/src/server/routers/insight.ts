import { z } from "zod";
import { router, workspaceProcedure } from "@backend/server/trpc";
import { getInsightsForRange } from "@backend/lib/calendar/intelligence";

export const insightRouter = router({
  /**
   * Evidence-backed calendar insights (conflicts, focus gaps, overload) for a
   * range. Read-only; available to every tier. Powers the planner banner.
   */
  getForRange: workspaceProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      return getInsightsForRange(ctx.workspace.id, input.from, input.to);
    }),
});
