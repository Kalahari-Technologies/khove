"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Transition } from "motion/react";
import { Check, X, Star } from "lucide-react";

// ---------------------------------------------------------------------------
// BorderTrail — orbiting particle effect for highlighted card
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
// Plan data — V3 Concept Note pricing
// ---------------------------------------------------------------------------

interface PlanCard {
  name: string;
  info: string;
  price: string;
  period: string;
  annualPrice?: string;
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
      "Unlimited AI conversations",
      "20 AI actions / month",
      "All integrations (Calendar, GitHub, Jira)",
      "2 workspaces, up to 4 members",
      "7-day AI memory",
    ],
    cta: "Your plan",
  },
  {
    name: "Pro",
    info: "For individuals",
    price: "$9",
    period: "/month",
    annualPrice: "$7.50/mo billed annually",
    highlighted: true,
    features: [
      "Unlimited AI actions",
      "Full persistent AI memory",
      "Standup AI automation",
      "Custom AI instructions",
      "5 workspaces",
      "14-day free trial",
    ],
    cta: "Upgrade to Pro",
  },
  {
    name: "Team",
    info: "For teams",
    price: "$18",
    period: "/user/month",
    annualPrice: "$15/user/mo billed annually",
    features: [
      "Everything in Pro",
      "500 AI actions / workspace",
      "Up to 20 members",
      "Team memory",
      "Unlimited workspaces",
      "14-day free trial",
    ],
    cta: "Upgrade to Team",
  },
];

// ---------------------------------------------------------------------------
// Feature context — shown when a specific feature triggers the upgrade dialog
// ---------------------------------------------------------------------------

const FEATURE_CONTEXT: Record<string, { title: string; description: string }> = {
  standupAutomation: {
    title: "Standup AI",
    description: "Generate standup summaries and sprint health reports automatically from your activity.",
  },
  customAiInstructions: {
    title: "Custom AI Instructions",
    description: "Give Khove workspace-specific context so it understands your team's conventions.",
  },
  persistentMemory: {
    title: "Full AI Memory",
    description: "Khove remembers your context across sessions. Free tier retains 7 days; upgrade for unlimited.",
  },
  teamMemory: {
    title: "Team Memory",
    description: "Shared team context that helps Khove understand your team's patterns and preferences.",
  },
  teamWorkspace: {
    title: "Team Workspace",
    description: "Collaborate with your team in shared workspaces with role-based access.",
  },
  sprintIntelligence: {
    title: "Sprint Intelligence",
    description: "AI-powered sprint health reports, blocker detection, and retrospective generation.",
  },
  actionLimit: {
    title: "AI Action Limit",
    description: "You've used all your AI actions this month. Upgrade for more actions or unlimited access.",
  },
};

// ---------------------------------------------------------------------------
// Animation variants
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
  /** The feature key that triggered the gate (e.g. "standupAutomation", "actionLimit") */
  feature?: string;
}

export function UpgradeDialog({ open, onClose, feature }: UpgradeDialogProps) {
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          <motion.div
            className="relative w-full max-w-3xl rounded-2xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} />
            </button>

            {/* Header */}
            <div className="px-8 pt-7 pb-1">
              <motion.div variants={FADE_IN} initial="hidden" animate="show" transition={{ delay: 0.1 }}>
                <h2 className="text-[22px] font-bold text-white tracking-tight">
                  Plans that Scale with You
                </h2>
              </motion.div>

              <motion.div variants={FADE_IN} initial="hidden" animate="show" transition={{ delay: 0.15 }}>
                {context ? (
                  <p className="text-[13px] text-white/40 mt-1.5 max-w-lg">
                    <span className="text-white/60 font-medium">{context.title}</span>{" — "}
                    {context.description}
                  </p>
                ) : (
                  <p className="text-[13px] text-white/40 mt-1.5 max-w-lg">
                    All integrations are free on every plan. Upgrade for unlimited AI actions, persistent memory, and team features.
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
                      {plan.annualPrice && (
                        <p className="text-[11px] text-white/25 mt-1">{plan.annualPrice}</p>
                      )}
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
