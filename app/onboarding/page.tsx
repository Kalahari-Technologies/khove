"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { WORKSPACE_GRADIENTS, getGradientStyle, randomGradientKey } from "@/lib/workspace/gradients";

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

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [gradient, setGradient] = useState(() => randomGradientKey());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const initialized = useRef(false);

  // Auto-generate username from Clerk user's name
  useEffect(() => {
    if (!isLoaded || !user || initialized.current) return;
    initialized.current = true;

    // If user already has a username, they've completed onboarding — redirect
    if (user.username) {
      router.push("/");
      return;
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    if (name) {
      setUsername(sanitizeSlug(name));
    } else if (user.primaryEmailAddress?.emailAddress) {
      setUsername(sanitizeSlug(user.primaryEmailAddress.emailAddress.split("@")[0]));
    }
  }, [isLoaded, user, router]);

  async function handleSubmit() {
    if (!isLoaded || !user || !username.trim()) return;

    const slug = sanitizeSlug(username);
    if (!slug) {
      setError("Please enter a valid username");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // 1. Set Clerk username
      await user.update({ username: slug });

      // 2. Update personal workspace slug + name + gradient
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: slug, gradient }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data?.error ?? "Failed to set up workspace");
        // Revert Clerk username on failure
        try { await user.update({ username: "" }); } catch {}
        setSubmitting(false);
        return;
      }

      router.push(`/${slug}/chat`);
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] };
      setError(clerkError.errors?.[0]?.message ?? "Username may already be taken");
      setSubmitting(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4">
      <motion.div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div className="px-7 pt-7 pb-2">
          <motion.h2
            className="text-[20px] font-semibold text-white"
            variants={FADE_IN}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.05 }}
          >
            Choose your username
          </motion.h2>

          <motion.p
            className="text-[13px] text-white/45 leading-relaxed mt-2"
            variants={FADE_IN}
            initial="hidden"
            animate="show"
            transition={{ delay: 0.1 }}
          >
            This becomes your personal workspace URL. You can change it later.
          </motion.p>
        </div>

        <motion.div
          className="px-7 pt-4 pb-6 space-y-5"
          variants={FADE_IN}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.15 }}
        >
          {/* Username input */}
          <div>
            <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wide mb-1.5">
              Username
            </label>
            <div className="flex items-center h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] focus-within:border-white/[0.25] transition-colors duration-[120ms]">
              <span className="text-[13px] text-white/30 flex-shrink-0 select-none">khove.io/</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(sanitizeSlug(e.target.value))}
                autoFocus
                className="flex-1 bg-transparent text-[13px] text-white focus:outline-none ml-0.5"
                placeholder="your-username"
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

          {/* Submit */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={!username.trim() || submitting}
              className="w-full py-2.5 rounded-xl text-[13px] font-medium bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
              style={{ transitionTimingFunction: ease }}
            >
              {submitting ? "Setting up..." : "Continue"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
