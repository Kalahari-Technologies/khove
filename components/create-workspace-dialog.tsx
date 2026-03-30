"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { WORKSPACE_GRADIENTS, getGradientStyle } from "@/lib/workspace/gradients";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

const FADE_IN = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const } },
};

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkspaceDialog({ open, onClose }: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [gradient, setGradient] = useState("sunset");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-generate slug from name unless user edited it
  useEffect(() => {
    if (!slugEdited) {
      setSlug(sanitizeSlug(name));
    }
  }, [name, slugEdited]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setName("");
      setSlug("");
      setSlugEdited(false);
      setGradient("sunset");
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/trpc/workspace.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: { name: name.trim(), slug: slug || undefined, gradient },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message ?? "Failed to create workspace");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      const newSlug = data?.result?.data?.json?.slug ?? slug;
      onClose();
      router.push(`/${newSlug}/chat`);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

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
                Create workspace
              </motion.h2>

              <motion.p
                className="text-[13px] text-white/45 leading-relaxed mt-2"
                variants={FADE_IN}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.1 }}
              >
                Workspaces let you organise tasks, conversations, and integrations for different teams or projects.
              </motion.p>
            </div>

            <motion.div
              className="px-7 pt-4 pb-6 space-y-5"
              variants={FADE_IN}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.15 }}
            >
              {/* Workspace name */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wide mb-1.5">
                  Workspace name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kalahari Technologies"
                  autoFocus
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-white placeholder:text-white/30 focus:border-white/[0.25] focus:outline-none transition-colors duration-[120ms]"
                  style={{ transitionTimingFunction: ease }}
                />
              </div>

              {/* URL slug */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wide mb-1.5">
                  URL slug
                </label>
                <div className="flex items-center h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] focus-within:border-white/[0.25] transition-colors duration-[120ms]">
                  <span className="text-[13px] text-white/30 flex-shrink-0 select-none">khove.io/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(sanitizeSlug(e.target.value));
                      setSlugEdited(true);
                    }}
                    className="flex-1 bg-transparent text-[13px] text-white focus:outline-none ml-0.5"
                  />
                </div>
              </div>

              {/* Gradient picker */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wide mb-2.5">
                  Workspace colour
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {WORKSPACE_GRADIENTS.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      title={g.label}
                      onClick={() => setGradient(g.key)}
                      className={`w-8 h-8 rounded-full transition-all duration-200 flex-shrink-0 ${
                        gradient === g.key
                          ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a] scale-110"
                          : "ring-0 ring-white/0 ring-offset-0 hover:scale-105 hover:ring-1 hover:ring-white/20 hover:ring-offset-1 hover:ring-offset-[#0a0a0a]"
                      }`}
                      style={{
                        background: getGradientStyle(g.key),
                        transitionTimingFunction: ease,
                      }}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-[12px] text-red-400">{error}</p>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || submitting}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                  style={{ transitionTimingFunction: ease }}
                >
                  {submitting ? "Creating…" : "Create workspace"}
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 text-[12px] text-white/25 hover:text-white/45 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
