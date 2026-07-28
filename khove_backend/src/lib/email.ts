import { Resend } from "resend";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────
// Resend Client — Lazy Singleton
// ─────────────────────────────────────────────

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const EMAIL_FROM = "Teni from Khove <noreply@kalaharitech.xyz>";
const EMAIL_REPLY_TO = "khove.io.dev@gmail.com";

const TEMPLATES_DIR = path.join(process.cwd(), "mail_templates");

// ─────────────────────────────────────────────
// Template Rendering
// ─────────────────────────────────────────────

/**
 * Read an HTML template from mail-templates/ and replace {{key}} placeholders.
 */
export function renderTemplate(
  templateName: string,
  variables: Record<string, string>
): string {
  const filePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  let html = fs.readFileSync(filePath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  return html;
}

// ─────────────────────────────────────────────
// Send Email
// ─────────────────────────────────────────────

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  const resend = getResend();
  return resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to,
    subject,
    html,
  });
}
