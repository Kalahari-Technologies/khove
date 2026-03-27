"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Transition } from "motion/react";
import { Check, X, Star } from "lucide-react";

// ---------------------------------------------------------------------------
// BorderTrail — orbiting particle effect for highlighted card
// From 21st.dev pricing component, adapted for B&W
// ---------------------------------------------------------------------------

function BorderTrail({
  className,
  size = 60,
  transition,
  delay,
  style,
}: {
  className?: string;
  size?: number;
  transition?: Transition;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const BASE_TRANSITION = { repeat: Infinity, duration: 5, ease: "linear" as const };

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className={`absolute aspect-square bg-zinc-500 ${className ?? ""}`}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          ...style,
        }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ ...(transition ?? BASE_TRANSITION), delay }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan data — client-safe subset (no billingProvider or external IDs)
// ---------------------------------------------------------------------------

interface PlanCard {
  name: string;
  info: string;
  price: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  current?: boolean;
  cta: string;
}

const PLAN_CARDS: PlanCard[] = [
  {
    name: "Free",
    info: "For getting started",
    price: "$0",
    period: "",
    current: true,
    features: [
      "30 AI messages / month",
      "Task management",
      "Workflow statuses",
    ],
    cta: "Your plan",
  },
  {
    name: "Pro",
    info: "For individuals",
    price: "$9",
    period: "/month",
    highlighted: true,
    features: [
      "Unlimited AI messages",
      "Google Calendar sync",
      "GitHub integration",
      "Persistent AI memory",
    ],
    cta: "Upgrade to Pro",
  },
  {
    name: "Team",
    info: "For organizations",
    price: "$18",
    period: "/month",
    features: [
      "Everything in Pro",
      "Up to 25 team members",
      "Jira integration",
      "Standup automation",
      "Team workspace",
    ],
    cta: "Upgrade to Team",
  },
];

// ---------------------------------------------------------------------------
// Feature context descriptions
// ---------------------------------------------------------------------------

const FEATURE_CONTEXT: Record<string, { title: string; description: string }> = {
  calendarTools: {
    title: "Google Calendar",
    description: "Sync your calendar events, check availability, and schedule meetings — all through Khove.",
  },
  githubTools: {
    title: "GitHub",
    description: "Track PRs, issues, and repository activity directly from your Khove workspace.",
  },
  jiraTools: {
    title: "Jira",
    description: "Read and update Jira tickets, sprint boards, and manage issue transitions.",
  },
  standupAutomation: {
    title: "Standup Automation",
    description: "Generate standup summaries and sprint health reports automatically.",
  },
  persistentMemory: {
    title: "AI Memory",
    description: "Khove remembers your preferences, context, and past conversations across sessions.",
  },
  teamWorkspace: {
    title: "Team Workspace",
    description: "Collaborate with your team in a shared workspace with role-based access.",
  },
};

// ---------------------------------------------------------------------------
// Animation variants (newsletter-dialog pattern)
// ---------------------------------------------------------------------------

const FADE_IN = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const } },
};

// ---------------------------------------------------------------------------
// UpgradeDialog
// ---------------------------------------------------------------------------

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  /** The feature key that triggered the gate (e.g. "calendarTools") */
  feature?: string;
}

export function UpgradeDialog({ open, onClose, feature }: UpgradeDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const context = feature ? FEATURE_CONTEXT[feature] : null;

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
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Dialog panel */}
          <motion.div
            className="relative w-full max-w-3xl rounded-2xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl overflow-hidden"
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

            {/* Header */}
            <div className="px-8 pt-7 pb-1">
              <motion.div
                variants={FADE_IN}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.1 }}
              >
                <h2 className="text-[22px] font-bold text-white tracking-tight">
                  Plans that Scale with You
                </h2>
              </motion.div>

              <motion.div
                variants={FADE_IN}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.15 }}
              >
                {context ? (
                  <p className="text-[13px] text-white/40 mt-1.5 max-w-lg">
                    <span className="text-white/60 font-medium">{context.title}</span>{" "}
                    requires a paid plan. {context.description}
                  </p>
                ) : (
                  <p className="text-[13px] text-white/40 mt-1.5 max-w-lg">
                    Upgrade to access integrations, unlimited AI messages, and more.
                  </p>
                )}
              </motion.div>
            </div>

            {/* Plan cards */}
            <motion.div
              className="px-8 pt-5 pb-6"
              variants={FADE_IN}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.2 }}
            >
              <div className="grid grid-cols-3 gap-3">
                {PLAN_CARDS.map((plan) => (
                  <div
                    key={plan.name}
                    className={`relative flex flex-col rounded-lg border overflow-hidden ${
                      plan.highlighted
                        ? "border-white/[0.20]"
                        : "border-white/[0.08]"
                    }`}
                  >
                    {/* BorderTrail on highlighted */}
                    {plan.highlighted && (
                      <BorderTrail
                        size={100}
                        style={{
                          boxShadow:
                            "0px 0px 60px 30px rgb(255 255 255 / 50%), 0 0 100px 60px rgb(0 0 0 / 50%), 0 0 140px 90px rgb(0 0 0 / 50%)",
                        }}
                      />
                    )}

                    {/* Card header */}
                    <div
                      className={`relative rounded-t-lg border-b border-white/[0.06] p-4 ${
                        plan.highlighted ? "bg-white/[0.04]" : "bg-white/[0.02]"
                      }`}
                    >
                      {/* Badges */}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        {plan.highlighted && (
                          <span className="flex items-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/70 font-medium">
                            <Star size={10} className="fill-current" />
                            Popular
                          </span>
                        )}
                        {plan.current && (
                          <span className="rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/40 font-medium">
                            Current
                          </span>
                        )}
                      </div>

                      <p className="text-[15px] font-semibold text-white">{plan.name}</p>
                      <p className="text-[12px] text-white/35 mt-0.5">{plan.info}</p>
                      <div className="mt-2.5 flex items-end gap-0.5">
                        <span className="text-[28px] font-bold text-white leading-none">
                          {plan.price}
                        </span>
                        {plan.period && (
                          <span className="text-[12px] text-white/30 mb-0.5">
                            {plan.period}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    <div
                      className={`flex-1 space-y-3 px-4 py-5 text-[12px] ${
                        plan.highlighted ? "bg-white/[0.015]" : ""
                      }`}
                    >
                      {plan.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Check size={13} className="text-white/40 flex-shrink-0" />
                          <span className="text-white/50">{f}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <div
                      className={`border-t border-white/[0.06] p-3 mt-auto ${
                        plan.highlighted ? "bg-white/[0.04]" : ""
                      }`}
                    >
                      {plan.current ? (
                        <div className="w-full py-2 text-center text-[12px] text-white/25 font-medium">
                          {plan.cta}
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            // TODO: Link to billing/checkout when Phase 6 is built
                            onClose();
                          }}
                          className={`w-full py-2 rounded-lg text-[12px] font-medium transition-colors ${
                            plan.highlighted
                              ? "bg-white text-black hover:bg-white/90"
                              : "border border-white/[0.15] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                          }`}
                        >
                          {plan.cta}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Dismiss */}
            <motion.div
              className="px-8 pb-5"
              variants={FADE_IN}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.3 }}
            >
              <button
                onClick={onClose}
                className="w-full py-2 text-[12px] text-white/25 hover:text-white/45 transition-colors"
              >
                Maybe later
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
