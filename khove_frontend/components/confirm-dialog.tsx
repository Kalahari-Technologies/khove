"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

const FADE_IN = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const } },
};

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional secondary action (3-button mode) */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** "danger" = white confirm button, "warning" = outline */
  variant?: "danger" | "warning";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  secondaryLabel,
  onSecondary,
  variant = "danger",
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} />
            </button>

            <div className="px-7 pt-7 pb-2">
              <motion.h2
                className="text-[17px] font-semibold text-white pr-8"
                variants={FADE_IN}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.05 }}
              >
                {title}
              </motion.h2>

              <motion.p
                className="text-[13px] text-white/45 leading-relaxed mt-2"
                variants={FADE_IN}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.1 }}
              >
                {description}
              </motion.p>
            </div>

            <motion.div
              className="px-7 pt-4 pb-6 flex flex-col gap-2"
              variants={FADE_IN}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.15 }}
            >
              {/* Primary action */}
              <button
                onClick={() => { onConfirm(); onClose(); }}
                className={`w-full py-2.5 rounded-xl text-[13px] font-medium transition-colors active:scale-[0.98] ${
                  variant === "danger"
                    ? "bg-red-700 text-white hover:bg-red-500"
                    : "border border-white/[0.15] text-white/70 hover:bg-white/[0.06]"
                }`}
              >
                {confirmLabel}
              </button>

              {/* Secondary action (optional — 3-button mode) */}
              {secondaryLabel && onSecondary && (
                <button
                  onClick={() => { onSecondary(); onClose(); }}
                  className="w-full py-2.5 rounded-xl border border-white/[0.12] text-[13px] text-white/50 font-medium hover:bg-white/[0.04] hover:text-white/70 transition-colors active:scale-[0.98]"
                >
                  {secondaryLabel}
                </button>
              )}

              {/* Cancel */}
              <button
                onClick={onClose}
                className="w-full py-2 text-[12px] text-white/25 hover:text-white/45 transition-colors"
              >
                {cancelLabel}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
