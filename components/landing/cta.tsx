"use client";

import { motion } from "motion/react";
import { CtaButton } from "./cta-button";
import { GradientText } from "./gradient-text";
import { ACCENTS } from "./constants";

/**
 * Closing hero — the finale. A full-bleed section where the 5 nav-accent glows
 * bloom into a single soft aurora behind a gradient headline (rendered as SVG
 * via <GradientText>, so it never drops out under GPU compositing). One last
 * signature colour beat before the footer, over the strict B&W base.
 */
export function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="relative isolate overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] px-6 py-24 text-center sm:py-32">
        {/* Aurora signature — the 5 nav accents as one soft bloom */}
        <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,black,transparent)]">
          <div
            className="absolute left-1/2 top-1/2 h-[360px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]"
            style={{
              background: `radial-gradient(circle, ${ACCENTS.chat}33, transparent 70%)`,
            }}
          />
          <div
            className="absolute left-[30%] top-[35%] h-[240px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
            style={{
              background: `radial-gradient(circle, ${ACCENTS.github}26, transparent 70%)`,
            }}
          />
          <div
            className="absolute left-[70%] top-[60%] h-[240px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
            style={{
              background: `radial-gradient(circle, ${ACCENTS.planner}22, transparent 70%)`,
            }}
          />
        </div>

        {/* Faint grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.25] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex flex-col items-center"
        >
          <img
            src="/assets/khove-white.png"
            alt="Khove"
            width={48}
            height={48}
            className="mb-6 h-12 w-12 object-contain"
          />
          <h2 className="w-full max-w-lg">
            <GradientText lines={["Give your tools", "a shared brain"]} />
          </h2>
          <p className="mt-5 max-w-lg text-balance text-[16px] leading-relaxed text-white/55">
            Connect GitHub, Calendar and Jira and start asking. Free forever
            plan, no credit card required.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <CtaButton href="/join" size="lg">
              Start free →
            </CtaButton>
            <CtaButton href="/login" variant="secondary" size="lg">
              Log in
            </CtaButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
