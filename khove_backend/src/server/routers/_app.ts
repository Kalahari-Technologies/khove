import { router } from "@backend/server/trpc";
import { taskRouter } from "@backend/server/routers/task";
import { workspaceRouter } from "@backend/server/routers/workspace";
import { workflowStatusRouter } from "@backend/server/routers/workflow-status";
import { integrationRouter } from "@backend/server/routers/integration";
import { conversationRouter } from "@backend/server/routers/conversation";
import { calendarEntryRouter } from "@backend/server/routers/calendar-entry";

export const appRouter = router({
  task: taskRouter,
  workspace: workspaceRouter,
  workflowStatus: workflowStatusRouter,
  integration: integrationRouter,
  conversation: conversationRouter,
  calendarEntry: calendarEntryRouter,
});

export type AppRouter = typeof appRouter;
