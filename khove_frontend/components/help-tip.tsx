"use client";

import { useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const TIP_W = 224; // must match `w-56`
const MARGIN = 8;

/**
 * A help affordance: a help icon that reveals an animated tooltip on hover/focus.
 * The tooltip is positioned `fixed` from the trigger's rect so it is NOT clipped by
 * a widget card's `overflow-hidden` — it always floats above everything. Its position
 * is clamped to the viewport (horizontally) and flips above/below the trigger based on
 * available room, so it never spills past a screen edge.
 */
export function HelpTip({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "above" | "below" } | null>(null);

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Horizontal: extend leftwards from the trigger, then clamp inside the viewport.
    const left = Math.min(Math.max(r.right - TIP_W, MARGIN), vw - TIP_W - MARGIN);
    // Vertical: prefer above; flip below when there isn't more room above than below.
    const placement = r.top > vh - r.bottom ? "above" : "below";
    const top = placement === "above" ? r.top - MARGIN : r.bottom + MARGIN;
    setPos({ top, left, placement });
  };
  const close = () => setPos(null);

  return (
    <span className={`inline-flex ${className}`} onMouseEnter={open} onMouseLeave={close}>
      <button
        ref={ref}
        type="button"
        aria-label="What is this?"
        onFocus={open}
        onBlur={close}
        onClick={(e) => e.preventDefault()}
        className="text-white/25 transition-colors hover:text-white/60"
      >
        <HelpCircle size={12.5} />
      </button>
      <AnimatePresence>
        {pos && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: pos.placement === "above" ? "translateY(-100%)" : "none",
            }}
            className="pointer-events-none z-[100] w-56 rounded-xl border border-white/[0.1] bg-[#0d0d0f] px-3 py-2 text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-white/70 shadow-2xl"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
