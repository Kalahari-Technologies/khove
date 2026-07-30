import { router } from "@backend/server/trpc";
import { taskRouter } from "@backend/server/routers/task";
import { workspaceRouter } from "@backend/server/routers/workspace";
import { workflowStatusRouter } from "@backend/server/routers/workflow-status";
import { integrationRouter } from "@backend/server/routers/integration";
import { conversationRouter } from "@backend/server/routers/conversation";
import { calendarEntryRouter } from "@backend/server/routers/calendar-entry";
import { insightRouter } from "@backend/server/routers/insight";
import { threadRouter } from "@backend/server/routers/thread";
import { agentActionRouter } from "@backend/server/routers/agent-action";
import { metricsRouter } from "@backend/server/routers/metrics";
import { jiraRouter } from "@backend/server/routers/jira";
import { dashboardRouter } from "@backend/server/routers/dashboard";

export const appRouter = router({
  task: taskRouter,
  workspace: workspaceRouter,
  workflowStatus: workflowStatusRouter,
  integration: integrationRouter,
  conversation: conversationRouter,
  calendarEntry: calendarEntryRouter,
  insight: insightRouter,
  thread: threadRouter,
  agentAction: agentActionRouter,
  metrics: metricsRouter,
  jira: jiraRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
