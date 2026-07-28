"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimation, useInView } from "motion/react";

/**
 * BoxReveal — the auth pages' signature entrance: content slides up from
 * behind a white curtain that wipes away. Ported from app/login for reuse
 * across the landing. Fires once, when scrolled into view.
 */
export function BoxReveal({
  children,
  width = "fit-content",
  duration = 0.5,
  delay = 0.25,
  className,
}: {
  children: React.ReactNode;
  width?: string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <div
      ref={ref}
      style={{ position: "relative", width, overflow: "hidden" }}
      className={className}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 75 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration, delay }}
      >
        {children}
      </motion.div>
      <motion.div
        variants={{ hidden: { left: 0 }, visible: { left: "100%" } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration, ease: "easeIn" }}
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 0,
          right: 0,
          zIndex: 20,
          background: "rgb(var(--ink) / 0.08)",
          borderRadius: 4,
        }}
      />
    </div>
  );
}
