import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { sendEmail, renderTemplate } from "@/lib/email";

// ---------------------------------------------------------------------------
// Welcome Signup — dispatched after user.created webhook
// ---------------------------------------------------------------------------

export const sendWelcomeSignupEmail = inngest.createFunction(
  {
    id: "send-welcome-signup-email",
    triggers: [{ event: "user/welcome-signup" }],
  },
  async ({ event, step }) => {
    const { clerkId } = event.data as { clerkId: string };

    const user = await step.run("load-user", async () => {
      return db.user.findUnique({ where: { clerkId } });
    });

    if (!user) return { skipped: true, reason: "user not found" };

    const result = await step.run("send-email", async () => {
      const firstName = user.name?.split(" ")[0] || user.email.split("@")[0];
      const html = renderTemplate("welcome-signup", {
        first_name: firstName,
        current_year: new Date().getFullYear().toString(),
      });

      return sendEmail({
        to: user.email,
        subject: "Welcome to Khove",
        html,
      });
    });

    return { sent: true, to: user.email, result };
  },
);

// ---------------------------------------------------------------------------
// Welcome Back — dispatched after session.created webhook (with cooldown)
// ---------------------------------------------------------------------------

export const sendWelcomeBackEmail = inngest.createFunction(
  {
    id: "send-welcome-back-email",
    triggers: [{ event: "user/welcome-back" }],
  },
  async ({ event, step }) => {
    const { clerkId } = event.data as { clerkId: string };

    const user = await step.run("load-user", async () => {
      return db.user.findUnique({ where: { clerkId } });
    });

    if (!user) return { skipped: true, reason: "user not found" };

    const result = await step.run("send-email", async () => {
      const firstName = user.name?.split(" ")[0] || user.email.split("@")[0];
      const html = renderTemplate("welcome-back", {
        first_name: firstName,
        current_year: new Date().getFullYear().toString(),
      });

      return sendEmail({
        to: user.email,
        subject: "Welcome back to Khove",
        html,
      });
    });

    return { sent: true, to: user.email, result };
  },
);
