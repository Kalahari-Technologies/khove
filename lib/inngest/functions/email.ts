import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { sendEmail, renderTemplate } from "@/lib/email";
import { clerkClient } from "@clerk/nextjs/server";

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

// ---------------------------------------------------------------------------
// OTP Email — dispatched after email.created webhook (delivered_by_clerk=false)
// ---------------------------------------------------------------------------

export const sendOtpEmail = inngest.createFunction(
  {
    id: "send-otp-email",
    triggers: [{ event: "user/otp-email" }],
  },
  async ({ event, step }) => {
    const { to, otpCode } = event.data as {
      to: string;
      otpCode: string;
      slug: string | null;
    };

    const result = await step.run("send-email", async () => {
      const html = renderTemplate("otp-email", {
        otp_code: otpCode,
        requested_from: "your browser",
        requested_at: new Date().toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        current_year: new Date().getFullYear().toString(),
      });

      return sendEmail({
        to,
        subject: "Your Khove verification code",
        html,
      });
    });

    return { sent: true, to, result };
  },
);

// ---------------------------------------------------------------------------
// New Device Login — dispatched when an unknown client_id is detected
// ---------------------------------------------------------------------------

export const sendNewDeviceEmail = inngest.createFunction(
  {
    id: "send-new-device-email",
    triggers: [{ event: "user/new-device-login" }],
  },
  async ({ event, step }) => {
    const { clerkId, sessionId } = event.data as {
      clerkId: string;
      sessionId: string;
      clientId: string;
    };

    const user = await step.run("load-user", async () => {
      return db.user.findUnique({ where: { clerkId } });
    });

    if (!user) return { skipped: true, reason: "user not found" };

    // Fetch session details from Clerk Backend API for device info
    const deviceInfo = await step.run("fetch-session-details", async () => {
      try {
        const clerk = await clerkClient();
        const session = await clerk.sessions.getSession(sessionId);
        const activity = session.latestActivity;

        return {
          deviceType: activity?.deviceType || "Unknown",
          browserName: activity?.browserName || "Unknown",
          browserVersion: activity?.browserVersion || "",
          isMobile: activity?.isMobile || false,
          ipAddress: activity?.ipAddress || "Unknown",
          city: activity?.city || "",
          country: activity?.country || "",
        };
      } catch {
        return {
          deviceType: "Unknown",
          browserName: "Unknown",
          browserVersion: "",
          isMobile: false,
          ipAddress: "Unknown",
          city: "",
          country: "",
        };
      }
    });

    const result = await step.run("send-email", async () => {
      const location = [deviceInfo.city, deviceInfo.country]
        .filter(Boolean)
        .join(", ") || "Unknown";

      const os = deviceInfo.isMobile ? "Mobile" : "Desktop";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://khove.xyz";

      const html = renderTemplate("new-device-email", {
        sign_in_method: "Browser session",
        device_type: deviceInfo.deviceType,
        browser_name: deviceInfo.browserName,
        operating_system: os,
        location,
        ip_address: deviceInfo.ipAddress,
        session_created_at: new Date().toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        sign_out_url: `${appUrl}/settings/security`,
        support_email: "hello@khove.xyz",
        current_year: new Date().getFullYear().toString(),
      });

      return sendEmail({
        to: user.email,
        subject: "New sign in to your Khove account",
        html,
      });
    });

    return { sent: true, to: user.email, result };
  },
);
