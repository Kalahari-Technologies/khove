import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
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
} from "@backend/lib/inngest/functions/calendar-sync";
import {
  initialGitHubSync,
  handleGitHubWebhook,
} from "@backend/lib/inngest/functions/github-sync";
import {
  sendWelcomeSignupEmail,
  sendWelcomeBackEmail,
  sendOtpEmail,
  sendNewDeviceEmail,
} from "@backend/lib/inngest/functions/email";

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

  // Inngest serve handler (manages its own body parsing). 11 functions.
  app.use(
    "/api/inngest",
    inngestServe({
      client: inngest,
      functions: [
        initialCalendarSync,
        handleCalendarWebhook,
        refreshExpiringTokens,
        renewCalendarWebhooks,
        disconnectCalendarCleanup,
        initialGitHubSync,
        handleGitHubWebhook,
        sendWelcomeSignupEmail,
        sendWelcomeBackEmail,
        sendOtpEmail,
        sendNewDeviceEmail,
      ],
    })
  );

  // tRPC over Express (superjson transformer is set on the router init).
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req }) => createTRPCContext({ req }),
    })
  );

  // NOTE: migrated REST / webhook / OAuth routes are mounted in Stage 4,
  // including raw-body parsers on webhook paths before any global json parser.

  return app;
}
