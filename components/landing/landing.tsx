import { LandingNav } from "./landing-nav";
import { Hero } from "./hero";
import { IntegrationsMarquee } from "./integrations-marquee";
import { BentoFeatures } from "./bento-features";
import { HowItWorks } from "./how-it-works";
import { Testimonials } from "./testimonials";
import { Pricing } from "./pricing";
import { Cta } from "./cta";
import { Footer } from "./footer";

/**
 * The marketing landing page shown at `/` to signed-out visitors.
 * Composed from the section components in this folder; each is on-brand
 * B&W with the subtle 5-accent signature. Adapted 21st.dev sources power the
 * aurora and bento; the rest are hand-built in the same language.
 */
export function Landing() {
  return (
    <main className="relative min-h-screen bg-[#09090B] text-white antialiased">
      <LandingNav />
      <Hero />
      <IntegrationsMarquee />
      <BentoFeatures />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <Cta />
      <Footer />
    </main>
  );
}
