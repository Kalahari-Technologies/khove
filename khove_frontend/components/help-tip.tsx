"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/**
 * A small info affordance: a help icon that reveals an animated tooltip on hover
 * or keyboard focus, explaining what a stat/widget means. Built on motion/react
 * (no tooltip lib in the app). Positions above-right by default.
 */
export function HelpTip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What is this?"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.preventDefault()}
        className="text-white/25 transition-colors hover:text-white/60"
      >
        <HelpCircle size={12.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute bottom-full right-0 z-50 mb-1.5 w-56 rounded-xl border border-white/[0.1] bg-[#0d0d0f] px-3 py-2 text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-white/70 shadow-2xl"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
