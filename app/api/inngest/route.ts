import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import {
  initialCalendarSync,
  handleCalendarWebhook,
  refreshExpiringTokens,
  disconnectCalendarCleanup,
} from "@/lib/inngest/functions/calendar-sync";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [initialCalendarSync, handleCalendarWebhook, refreshExpiringTokens, disconnectCalendarCleanup],
});
