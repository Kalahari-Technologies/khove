"use client";

import { motion } from "motion/react";
import { OrbitDisplay } from "@/components/auth/orbit-display";
import { AuroraBackground } from "./aurora-background";
import { CtaButton } from "./cta-button";
import { GradientText } from "./gradient-text";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-28 pb-16">
      <AuroraBackground />

      <div className="relative z-10 flex flex-col items-center text-center isolate">
        {/* Announcement pill */}
        <motion.a
          href="#features"
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="group mb-7 inline-flex items-center gap-2 rounded-full border border-ink/[0.08] bg-ink/[0.04] px-3 py-1.5 text-[12px] text-ink/60 backdrop-blur-sm transition-colors hover:border-ink/[0.15] hover:text-ink/80"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          GitHub · Google Calendar · Jira, in one place
          <span className="text-ink/30 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </motion.a>

        {/* Headline — gradient rendered as SVG (not bg-clip-text), so it can't
            drop out under GPU compositing on any browser. */}
        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="w-full max-w-3xl"
        >
          <GradientText lines={["Your tools, finally", "thinking together"]} />
        </motion.h1>

        {/* Subhead */}
        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6 max-w-xl text-balance text-[16px] leading-relaxed text-ink/55 sm:text-[17px]"
        >
          Khove is the AI-native workspace that connects GitHub, Google Calendar
          and Jira behind a single conversational interface — so you can plan,
          track and ship without switching tabs.
        </motion.p>

        {/* CTAs */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <CtaButton href="/join" size="lg">
            Start free →
          </CtaButton>
          <CtaButton href="/login" variant="secondary" size="lg">
            Log in
          </CtaButton>
        </motion.div>

        <motion.p
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-4 text-[12px] text-ink/35"
        >
          Free forever plan · No credit card required
        </motion.p>
      </div>

      {/* Signature visual — the integration orbit */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none relative z-10 mt-4 hidden h-[520px] w-full max-w-3xl md:block"
      >
        <OrbitDisplay />
      </motion.div>
    </section>
  );
}
