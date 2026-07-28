import type { Metadata } from "next";
import { LegalPage, Section, P, List } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions — Khove",
  description: "The terms governing your use of Khove.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated="28 July 2026">
      <Section heading="1. Agreement to these terms">
        <P>
          These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of Khove
          (the &ldquo;Service&rdquo;), an AI-native orchestration platform operated by Khove
          (&ldquo;Khove&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, checking the
          acceptance box during registration, or otherwise using the Service, you agree to be bound
          by these Terms. If you do not agree, do not use the Service.
        </P>
      </Section>

      <Section heading="2. The Service">
        <P>
          Khove connects your third-party tools — such as GitHub, Google Calendar, and other project
          and development platforms — and provides a conversational and agentic layer that helps you
          observe, understand, and act on work across them. Khove is an orchestrator: it coordinates
          and hands off work to connected tools; it is not a replacement for those tools and does not
          author or deploy code on your behalf without your authorization.
        </P>
      </Section>

      <Section heading="3. Accounts and eligibility">
        <List
          items={[
            "You must be at least 16 years old and able to form a binding contract to use the Service.",
            "You are responsible for the accuracy of your registration details and for all activity under your account.",
            "You are responsible for maintaining the security of your credentials and any connected-tool access tokens.",
            "You must notify us promptly of any unauthorized use of your account.",
          ]}
        />
      </Section>

      <Section heading="4. Connected integrations">
        <P>
          When you connect a third-party service, you authorize Khove to access, read, and — where you
          explicitly permit it — write data on your behalf through that service&rsquo;s API. Your use of
          each connected service remains subject to that provider&rsquo;s own terms. You may disconnect
          an integration at any time, which revokes Khove&rsquo;s stored access for that workspace.
        </P>
      </Section>

      <Section heading="5. Agents and automated actions">
        <P>
          Khove may act on your behalf through automated agents. By default, agent actions that write
          to or modify a connected system require human approval, and every action is recorded in an
          audit trail. You are responsible for reviewing and approving actions before they take effect
          where approval is requested.
        </P>
      </Section>

      <Section heading="6. Acceptable use">
        <P>You agree not to:</P>
        <List
          items={[
            "Use the Service to violate any law or the rights of others.",
            "Attempt to gain unauthorized access to the Service, other accounts, or connected systems.",
            "Interfere with or disrupt the integrity or performance of the Service.",
            "Reverse engineer or misuse the Service other than as permitted by these Terms.",
            "Upload content that is unlawful, infringing, or malicious.",
          ]}
        />
      </Section>

      <Section heading="7. Plans, billing, and usage">
        <P>
          Paid plans, usage entitlements, and metering are described in the Service. Where a plan meters
          AI actions or agent runs, those limits apply as stated for your plan tier. Fees are billed in
          advance and are non-refundable except where required by law.
        </P>
      </Section>

      <Section heading="8. Your content and data">
        <P>
          You retain all rights to the content and data you or your connected tools provide to the
          Service (&ldquo;Your Data&rdquo;). You grant Khove a limited license to process Your Data solely
          to provide and improve the Service for you, as described in our{" "}
          <a href="/privacy" className="text-white/75 underline underline-offset-2 hover:text-white">
            Privacy Policy
          </a>
          . We do not sell Your Data, and we do not use it to train third-party foundation models outside
          the no-training terms of our AI providers.
        </P>
      </Section>

      <Section heading="9. Intellectual property">
        <P>
          The Service, including its software, design, and trademarks, is owned by Khove and protected by
          law. These Terms do not grant you any right to our trademarks or branding.
        </P>
      </Section>

      <Section heading="10. Disclaimers">
        <P>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of
          any kind. AI-generated output may be inaccurate or incomplete; you are responsible for reviewing
          it before relying on or acting upon it. We do not warrant that the Service will be uninterrupted
          or error-free.
        </P>
      </Section>

      <Section heading="11. Limitation of liability">
        <P>
          To the maximum extent permitted by law, Khove will not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or for any loss of data, profits, or revenue,
          arising from your use of the Service.
        </P>
      </Section>

      <Section heading="12. Termination">
        <P>
          You may stop using the Service and delete your account at any time. We may suspend or terminate
          access if you breach these Terms or use the Service in a way that risks harm to others or to the
          Service. On termination, your right to use the Service ends.
        </P>
      </Section>

      <Section heading="13. Changes to these terms">
        <P>
          We may update these Terms from time to time. Material changes will be communicated through the
          Service or by email. Continued use after changes take effect constitutes acceptance.
        </P>
      </Section>

      <Section heading="14. Contact">
        <P>
          Questions about these Terms? Contact us at{" "}
          <a href="mailto:khove.io.dev@gmail.com" className="text-white/75 underline underline-offset-2 hover:text-white">
            khove.io.dev@gmail.com
          </a>
          .
        </P>
      </Section>
    </LegalPage>
  );
}
