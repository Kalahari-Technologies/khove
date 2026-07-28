import type { Metadata } from "next";
import { LegalPage, Section, P, List } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Khove",
  description: "How Khove collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="28 July 2026">
      <Section heading="1. Overview">
        <P>
          This Privacy Policy explains how Khove (&ldquo;Khove&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
          collects, uses, and protects your information when you use our orchestration platform (the
          &ldquo;Service&rdquo;). We built Khove around a simple principle: your work data stays yours and
          is used only to serve you.
        </P>
      </Section>

      <Section heading="2. Information we collect">
        <List
          items={[
            "Account information: your name, email address, and username, provided at registration (authentication is handled by our provider, Clerk).",
            "Connected-tool data: content and metadata from services you connect — for example GitHub repositories, pull requests, issues, and Google Calendar events — accessed via their APIs with your authorization.",
            "Workspace content: tasks, conversations, and other items you create in Khove.",
            "Usage data: logs and metrics about how you use the Service, used for reliability, security, and billing.",
            "Device and session data: information such as browser, approximate location, and IP address, used for account security (e.g. new-device notifications).",
          ]}
        />
      </Section>

      <Section heading="3. How we use your information">
        <List
          items={[
            "To provide, maintain, and improve the Service and its integrations.",
            "To operate AI features — routing your requests to our AI providers to generate responses and agent actions.",
            "To power memory and context features that make the Service more helpful over time.",
            "To secure your account, prevent abuse, and meet legal obligations.",
            "To communicate with you about your account, security, and the Service.",
          ]}
        />
      </Section>

      <Section heading="4. AI processing">
        <P>
          Khove uses AI models from Anthropic and Google, accessed directly under agreements that include
          no-training terms by default — meaning your data is not used to train their foundation models.
          We do not sell your data. Where an enterprise engagement requires stricter data-handling (such as
          zero-retention processing), that is arranged contractually.
        </P>
      </Section>

      <Section heading="5. Data isolation">
        <P>
          Your data is scoped to your workspace. Workspace content never crosses into another workspace.
          Personal preferences that travel across your own workspaces are kept content-free. Access to
          connected systems is governed by a read-automatically / write-with-approval / delete-explicitly
          model, and every agent action is audited.
        </P>
      </Section>

      <Section heading="6. How we store and protect your data">
        <List
          items={[
            "OAuth tokens for connected tools are encrypted at rest (AES-256-GCM); we never store them in plaintext.",
            "Data is hosted with reputable infrastructure providers (including Supabase and Upstash).",
            "Access to production data is restricted and monitored.",
            "No method of transmission or storage is perfectly secure, but we work to protect your data using industry-standard measures.",
          ]}
        />
      </Section>

      <Section heading="7. Sharing your information">
        <P>
          We share information only with service providers that help us operate the Service (for example,
          authentication, hosting, AI processing, and email delivery), each under obligations to protect
          your data; when required by law; or with your direction, such as when you connect a third-party
          tool. We do not sell your personal information.
        </P>
      </Section>

      <Section heading="8. Data retention">
        <P>
          We retain your data for as long as your account is active or as needed to provide the Service.
          Memory retention may vary by plan tier. When you delete your account or disconnect an integration,
          we delete or revoke the associated data and access, subject to any legal retention requirements.
        </P>
      </Section>

      <Section heading="9. Your rights">
        <P>
          Depending on your location, you may have rights to access, correct, export, or delete your
          personal data, and to object to or restrict certain processing. You can exercise these rights
          through your account settings or by contacting us.
        </P>
      </Section>

      <Section heading="10. International transfers">
        <P>
          Your data may be processed in countries other than your own. Where required, we rely on
          appropriate safeguards for such transfers.
        </P>
      </Section>

      <Section heading="11. Children's privacy">
        <P>
          The Service is not directed to children under 16, and we do not knowingly collect their personal
          data.
        </P>
      </Section>

      <Section heading="12. Changes to this policy">
        <P>
          We may update this Privacy Policy from time to time. Material changes will be communicated through
          the Service or by email. The &ldquo;Last updated&rdquo; date above reflects the latest revision.
        </P>
      </Section>

      <Section heading="13. Contact">
        <P>
          Questions about your privacy? Contact us at{" "}
          <a href="mailto:khove.io.dev@gmail.com" className="text-white/75 underline underline-offset-2 hover:text-white">
            khove.io.dev@gmail.com
          </a>
          .
        </P>
      </Section>
    </LegalPage>
  );
}
