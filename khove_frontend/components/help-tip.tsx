"use client";

import { useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/**
 * A help affordance: a help icon that reveals an animated tooltip on hover/focus.
 * The tooltip is positioned `fixed` from the trigger's rect so it is NOT clipped by
 * a widget card's `overflow-hidden` — it always floats above everything.
 */
export function HelpTip({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.right });
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
            style={{ position: "fixed", top: pos.top - 8, left: pos.left, transform: "translate(-100%, -100%)" }}
            className="pointer-events-none z-[100] w-56 rounded-xl border border-white/[0.1] bg-[#0d0d0f] px-3 py-2 text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-white/70 shadow-2xl"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
