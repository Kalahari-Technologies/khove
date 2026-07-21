"use client";

import { motion } from "motion/react";
import { CtaButton } from "./cta-button";
import { GradientText } from "./gradient-text";
import { ACCENTS } from "./constants";

/**
 * Closing CTA — the "CTA with glow" pattern (21st.dev @mikolajdobrucki, id
 * 1378) reimagined in B&W: a single soft accent glow blooms behind a
 * high-contrast white button. One last colour beat before the footer.
 */
export function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] px-6 py-20 text-center sm:py-28">
        {/* Glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
          style={{
            background: `radial-gradient(circle, ${ACCENTS.chat}33, transparent 70%)`,
          }}
        />
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
          <h2 className="w-full max-w-md">
            <GradientText lines={["Give your tools", "a shared brain"]} />
          </h2>
          <p className="mt-4 max-w-lg text-balance text-[16px] leading-relaxed text-white/55">
            Connect GitHub, Calendar and Jira and start asking. Free forever
            plan, no credit card required.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
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
