"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";
import { GradientText } from "./gradient-text";
import { ACCENTS } from "./constants";

/**
 * Closing hero — the finale. A faithful port of the 21st.dev `cta-with-glow`
 * pattern (@mikolajdobrucki, id 1378): a centered pitch above a bottom-anchored
 * `Glow` — two stacked radial ellipses that bloom upward into the section like
 * light rising off the bottom edge. Recoloured from the shadcn brand token to
 * the Khove chat accent over the strict B&W base, with the headline rendered as
 * SVG via <GradientText> so it never drops out under GPU compositing.
 */

/** The signature glow from cta-with-glow — an upward bloom off the bottom edge. */
function Glow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-0 left-0 w-full",
        className
      )}
    >
      {/* wide, dim outer bloom */}
      <div
        className="absolute bottom-0 left-1/2 h-[420px] w-[80%] -translate-x-1/2 translate-y-1/3 rounded-[50%] blur-[6px]"
        style={{
          background: `radial-gradient(ellipse at center, ${ACCENTS.chat}55 8%, transparent 62%)`,
        }}
      />
      {/* tighter, brighter core */}
      <div
        className="absolute bottom-0 left-1/2 h-[240px] w-[48%] -translate-x-1/2 translate-y-1/4 rounded-[50%]"
        style={{
          background: `radial-gradient(ellipse at center, ${ACCENTS.chat}59 6%, transparent 60%)`,
        }}
      />
    </div>
  );
}

export function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="relative isolate overflow-hidden rounded-3xl border border-ink/[0.08] bg-ink/[0.02] px-6 pb-32 pt-24 text-center sm:pb-40 sm:pt-32">
        {/* Faint grid, masked to a soft center */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_55%_50%_at_50%_40%,black,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(var(--ink) / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--ink) / 0.04) 1px, transparent 1px)",
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
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-ink/[0.08] bg-ink/[0.04] px-3 py-1.5 text-[12px] text-ink/60 backdrop-blur-sm">
            <img
              src="/assets/khove-white.png"
              alt=""
              width={14}
              height={14}
              className="khove-mark h-3.5 w-3.5 object-contain opacity-80"
            />
            Ready when you are
          </span>
          <h2 className="w-full max-w-lg">
            <GradientText lines={["Give your tools", "a shared brain"]} />
          </h2>
          <p className="mt-5 max-w-lg text-balance text-[16px] leading-relaxed text-ink/55">
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

        {/* Signature: the upward glow beam off the bottom edge */}
        <Glow />
      </div>
    </section>
  );
}
