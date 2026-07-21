"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import type { PlanTier } from "@prisma/client";
import { PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

/**
 * Pricing — driven entirely by the PLANS single-source-of-truth in
 * lib/billing/plans.ts, so prices, limits and features never drift from the
 * product. Structure (segmented interval toggle, highlighted popular plan)
 * follows the 21st.dev pricing patterns, restyled to B&W.
 */

const TIERS: PlanTier[] = ["FREE", "PRO", "TEAM", "SMB"];
const POPULAR: PlanTier = "PRO";

function actionsLabel(tier: PlanTier): string {
  const n = PLANS[tier].aiActionsPerMonth;
  if (n === -1) return "Unlimited AI actions";
  const scope = tier === "TEAM" || tier === "SMB" ? "per workspace" : "per month";
  return `${n.toLocaleString()} AI actions ${scope}`;
}

function limitLabel(v: number, noun: string): string {
  return v === -1 ? `Unlimited ${noun}` : `Up to ${v} ${noun}`;
}

/** Human-readable feature bullets per tier, derived from PLANS. */
function bullets(tier: PlanTier): string[] {
  const p = PLANS[tier];
  const f = p.features;
  const list: string[] = [
    actionsLabel(tier),
    limitLabel(p.maxWorkspaces, "workspaces"),
    limitLabel(p.maxWorkspaceMembers, "members / workspace"),
    "GitHub, Calendar & Jira included",
    f.memoryRetentionDays === -1 ? "Full persistent memory" : `${f.memoryRetentionDays}-day memory`,
  ];
  if (f.standupAutomation) list.push("Standup automation & custom AI");
  if (f.teamWorkspace) list.push("Team workspaces & shared memory");
  if (f.sprintIntelligence) list.push("Sprint intelligence & admin dashboard");
  return list;
}

function priceFor(tier: PlanTier, annual: boolean): { amount: string; suffix: string } {
  const p = PLANS[tier];
  if (p.priceUsd === 0) return { amount: "$0", suffix: "forever" };
  const monthly = annual ? Math.round((p.annualPriceUsd / 12) * 10) / 10 : p.priceUsd;
  const perUser = tier === "TEAM" || tier === "SMB" ? "/user" : "";
  return { amount: `$${monthly}`, suffix: `${perUser}/mo` };
}

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-white/35">
          Pricing
        </p>
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-white">
          Start free. Upgrade when it clicks.
        </h2>
        <p className="mt-4 text-[16px] text-white/50">
          Every integration is free on every plan — you only pay for AI actions.
        </p>

        {/* Interval toggle */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
          {[
            { key: false, label: "Monthly" },
            { key: true, label: "Annual" },
          ].map((opt) => (
            <button
              key={String(opt.key)}
              onClick={() => setAnnual(opt.key)}
              className={cn(
                "relative rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors",
                annual === opt.key ? "text-black" : "text-white/60 hover:text-white"
              )}
            >
              {annual === opt.key && (
                <motion.span
                  layoutId="pricing-toggle"
                  className="absolute inset-0 rounded-md bg-white"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative">{opt.label}</span>
              {opt.key && (
                <span className="relative ml-1.5 text-[11px] text-emerald-400">
                  −2 mo
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier, i) => {
          const p = PLANS[tier];
          const price = priceFor(tier, annual);
          const isPopular = tier === POPULAR;
          return (
            <motion.div
              key={tier}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6",
                isPopular
                  ? "border-white/[0.2] bg-white/[0.04]"
                  : "border-white/[0.08] bg-white/[0.02]"
              )}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-black">
                  Most popular
                </span>
              )}

              <h3 className="text-[15px] font-semibold text-white">{p.name}</h3>
              <p className="mt-1 text-[13px] text-white/45">{p.description}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-[34px] font-semibold tracking-tight text-white">
                  {price.amount}
                </span>
                <span className="text-[13px] text-white/40">{price.suffix}</span>
              </div>
              <div className="mt-1 h-4 text-[12px] text-white/35">
                {p.trialDays > 0 ? `${p.trialDays}-day free trial` : " "}
              </div>

              <CtaButton
                href="/join"
                variant={isPopular ? "primary" : "secondary"}
                className="mt-5 w-full"
              >
                {p.priceUsd === 0 ? "Start free" : "Start trial"}
              </CtaButton>

              <ul className="mt-6 flex flex-col gap-2.5">
                {bullets(tier).map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[13px] text-white/60">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" strokeWidth={2.5} />
                    {b}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>

      {/* Enterprise strip */}
      <div className="mt-4 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-5 sm:flex-row">
        <div>
          <h3 className="text-[15px] font-semibold text-white">Enterprise</h3>
          <p className="mt-0.5 text-[13px] text-white/45">
            Unlimited everything, SSO and a custom deployment. {PLANS.ENTERPRISE.description}.
          </p>
        </div>
        <CtaButton href="/join" variant="secondary">
          Contact sales
        </CtaButton>
      </div>
    </section>
  );
}
