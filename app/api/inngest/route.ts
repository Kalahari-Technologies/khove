import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import {
  initialCalendarSync,
  handleCalendarWebhook,
  refreshExpiringTokens,
  renewCalendarWebhooks,
  disconnectCalendarCleanup,
} from "@/lib/inngest/functions/calendar-sync";
import {
  initialGitHubSync,
  handleGitHubWebhook,
} from "@/lib/inngest/functions/github-sync";
import {
  sendWelcomeSignupEmail,
  sendWelcomeBackEmail,
  sendOtpEmail,
  sendNewDeviceEmail,
} from "@/lib/inngest/functions/email";

export const { GET, POST, PUT } = serve({
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
});
