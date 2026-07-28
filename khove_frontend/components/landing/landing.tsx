import { LandingNav } from "./landing-nav";
import { Hero } from "./hero";
import { IntegrationsMarquee } from "./integrations-marquee";
import { BentoFeatures } from "./bento-features";
import { HowItWorks } from "./how-it-works";
import { AiDemo } from "./ai-demo";
import { AgentActions } from "./agent-actions";
import { Testimonials } from "./testimonials";
import { Pricing } from "./pricing";
import { Cta } from "./cta";
import { Footer } from "./footer";
import { LandingThemeProvider } from "./theme";

/**
 * The marketing landing page shown at `/` to signed-out visitors.
 * Composed from the section components in this folder; each is on-brand
 * B&W with the subtle 5-accent signature. Adapted 21st.dev sources power the
 * aurora and bento; the rest are hand-built in the same language.
 */
export function Landing() {
  return (
    <LandingThemeProvider>
      <main className="relative min-h-screen bg-paper text-ink antialiased">
        <LandingNav />
        <Hero />
        <IntegrationsMarquee />
        <BentoFeatures />
        <HowItWorks />
        <AiDemo />
        <AgentActions />
        <Testimonials />
        <Pricing />
        <Cta />
        <Footer />
      </main>
    </LandingThemeProvider>
  );
}
