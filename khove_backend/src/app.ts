import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { clerkMiddleware } from "@clerk/express";
import { openApiSpec } from "@backend/openapi";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { serve as inngestServe } from "inngest/express";
import { env } from "@backend/env";
import { appRouter } from "@backend/server/routers/_app";
import { createTRPCContext } from "@backend/server/trpc";
import { inngest } from "@backend/lib/inngest";
import {
  initialCalendarSync,
  handleCalendarWebhook,
  refreshExpiringTokens,
  renewCalendarWebhooks,
  disconnectCalendarCleanup,
  handleCalendarTokenRevoked,
} from "@backend/lib/inngest/functions/calendar-sync";
import {
  initialGitHubSync,
  handleGitHubWebhook,
  githubDisconnectCleanup,
} from "@backend/lib/inngest/functions/github-sync";
import { calendarIntelligenceScan } from "@backend/lib/inngest/functions/agent-actions";
import { shepherdScan } from "@backend/lib/inngest/functions/shepherd";
import { deliveryRiskScan } from "@backend/lib/inngest/functions/delivery";
import {
  jiraInitialSync,
  jiraPollSync,
  handleJiraWebhook,
  refreshJiraTokens,
  renewJiraWebhooks,
  jiraDisconnectCleanup,
} from "@backend/lib/inngest/functions/jira-sync";
import {
  sendWelcomeSignupEmail,
  sendWelcomeBackEmail,
  sendOtpEmail,
  sendNewDeviceEmail,
} from "@backend/lib/inngest/functions/email";
import chatRouter from "@backend/routes/chat";
import tasksRouter from "@backend/routes/tasks";
import calendarRouter from "@backend/routes/calendar";
import onboardingRouter from "@backend/routes/onboarding";
import webhooksRouter from "@backend/routes/webhooks";
import githubIntegrationRouter from "@backend/routes/integrations-github";
import googleIntegrationRouter from "@backend/routes/integrations-google";
import jiraIntegrationRouter from "@backend/routes/integrations-jira";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
      allowedHeaders: ["authorization", "content-type", "x-workspace-id"],
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    })
  );

  // Populates req.auth from the forwarded Clerk session token. authorizedParties
  // pins the accepted `azp` to the frontend origin (cross-origin CSRF defense).
  app.use(clerkMiddleware({ authorizedParties: [env.FRONTEND_ORIGIN] }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // API docs — Swagger UI at /docs, raw spec at /openapi.json.
  app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // Inngest serve handler. `inngest/express` reads req.body, so it needs a JSON
  // parser in front of it (missing → "Missing body when syncing" on the Cloud PUT
  // sync). Raised limit because the sync payload carries every function's config.
  app.use(
    "/api/inngest",
    express.json({ limit: "5mb" }),
    inngestServe({
      client: inngest,
      functions: [
        initialCalendarSync,
        handleCalendarWebhook,
        refreshExpiringTokens,
        renewCalendarWebhooks,
        disconnectCalendarCleanup,
        handleCalendarTokenRevoked,
        initialGitHubSync,
        handleGitHubWebhook,
        githubDisconnectCleanup,
        calendarIntelligenceScan,
        shepherdScan,
        deliveryRiskScan,
        jiraInitialSync,
        jiraPollSync,
        handleJiraWebhook,
        refreshJiraTokens,
        renewJiraWebhooks,
        jiraDisconnectCleanup,
        sendWelcomeSignupEmail,
        sendWelcomeBackEmail,
        sendOtpEmail,
        sendNewDeviceEmail,
      ],
    })
  );

  // Webhooks — RAW body for signature verification (BEFORE any json parser).
  app.use("/api/webhooks", express.raw({ type: "*/*" }), webhooksRouter);

  // tRPC over Express (the adapter parses its own body; superjson on router init).
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req }) => createTRPCContext({ req }),
    })
  );

  // JSON REST API — express.json() applied per-router (GET routes ignore it).
  app.use("/api/chat", express.json(), chatRouter);
  app.use("/api/tasks", express.json(), tasksRouter);
  app.use("/api/calendar", express.json(), calendarRouter);
  app.use("/api/onboarding", express.json(), onboardingRouter);
  app.use("/api/integrations/github", express.json(), githubIntegrationRouter);
  app.use("/api/integrations/google", express.json(), googleIntegrationRouter);
  app.use("/api/integrations/jira", express.json(), jiraIntegrationRouter);

  return app;
}
