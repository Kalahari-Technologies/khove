import { router } from "@backend/server/trpc";
import { taskRouter } from "@backend/server/routers/task";
import { workspaceRouter } from "@backend/server/routers/workspace";

export const appRouter = router({
  task: taskRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
