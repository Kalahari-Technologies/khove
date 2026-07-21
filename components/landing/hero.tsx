"use client";

import { motion } from "motion/react";
import { OrbitDisplay } from "@/components/auth/orbit-display";
import { AuroraBackground } from "./aurora-background";
import { CtaButton } from "./cta-button";

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
          className="group mb-7 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 backdrop-blur-sm transition-colors hover:border-white/[0.15] hover:text-white/80"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          GitHub · Google Calendar · Jira, in one place
          <span className="text-white/30 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </motion.a>

        {/* Headline — gradient text via bg-clip-text. Robustness recipe so the
            gradient never drops out under GPU compositing: the clipped <h1> is
            static (the entrance animates the wrapper, so no transform/will-change
            lands on the clip element) and -webkit-text-fill-color is set
            explicitly (Tailwind's text-transparent only sets `color`). The parent
            content is also `isolate`d from the Aurora's mix-blend layer. */}
        <motion.div
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="max-w-4xl"
        >
          <h1 className="text-balance bg-gradient-to-b from-white to-white/60 bg-clip-text text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[1.05] tracking-tight text-transparent [-webkit-text-fill-color:transparent]">
            Your tools, finally
            <br className="hidden sm:block" /> thinking together
          </h1>
        </motion.div>

        {/* Subhead */}
        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6 max-w-xl text-balance text-[16px] leading-relaxed text-white/55 sm:text-[17px]"
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
          className="mt-4 text-[12px] text-white/35"
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
