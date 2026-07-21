"use client";

import { motion } from "motion/react";
import { ACCENTS } from "./constants";

/**
 * Adapted from 21st.dev "AuroraBackground" (@dhileepkumargm, id 8076).
 * Reworked for Khove: framer-motion → motion/react, and the original's
 * purple/fuchsia/indigo blobs are dialled down to a near-monochrome haze
 * with a faint multi-accent wash (the one deliberate colour moment on the
 * page). Sits behind the hero; foreground content renders above via z-index.
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Grid — echoes the app's surfaces, masked to fade toward the edges */}
      <div
        className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* Drifting accent blobs — very low opacity, screen-blended so they
          only tint the black rather than colour it. */}
      <div className="absolute inset-0 mix-blend-screen">
        <motion.div
          className="absolute -top-1/4 left-1/4 h-1/2 w-1/2 rounded-full blur-[120px]"
          style={{ backgroundColor: ACCENTS.chat, opacity: 0.12 }}
          animate={{ x: [-40, 40, -40], y: [-20, 20, -20], scale: [1, 1.15, 1] }}
          transition={{ duration: 32, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 right-1/4 h-1/2 w-1/2 rounded-full blur-[120px]"
          style={{ backgroundColor: ACCENTS.tasks, opacity: 0.1 }}
          animate={{ x: [40, -40, 40], y: [20, -20, 20], scale: [1, 1.2, 1] }}
          transition={{ duration: 40, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-1/3 h-1/2 w-1/2 rounded-full blur-[130px]"
          style={{ backgroundColor: ACCENTS.jira, opacity: 0.1 }}
          animate={{ x: [20, -20, 20], y: [-16, 16, -16], scale: [1, 1.1, 1] }}
          transition={{ duration: 48, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
      </div>

      {/* Vignette + bottom fade into the page background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,transparent,rgba(9,9,11,0.6))]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#09090B] to-transparent" />
    </div>
  );
}
