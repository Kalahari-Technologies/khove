import { router } from "@/server/trpc";
import { taskRouter } from "@/server/routers/task";
import { workspaceRouter } from "@/server/routers/workspace";

export const appRouter = router({
  task: taskRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
