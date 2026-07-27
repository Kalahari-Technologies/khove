"use client";

import { Plug, MessagesSquare, Rocket } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ACCENTS } from "./constants";
import { useLandingTheme } from "./theme";

const STEPS = [
  {
    icon: Plug,
    color: ACCENTS.github,
    step: "01",
    title: "Connect your tools",
    description:
      "Link GitHub, Google Calendar and Jira in a couple of clicks. Each workspace connects its own accounts — securely, with encrypted tokens.",
  },
  {
    icon: MessagesSquare,
    color: ACCENTS.chat,
    step: "02",
    title: "Ask in plain English",
    description:
      "“What did I miss on the web repo?” “Block two hours for deep work tomorrow.” Khove understands intent and pulls context across every tool.",
  },
  {
    icon: Rocket,
    color: ACCENTS.planner,
    step: "03",
    title: "Ship without switching",
    description:
      "Tasks created, events booked, issues opened, PRs summarised — all from the conversation. No tab-hopping, no copy-paste.",
  },
];

export function HowItWorks() {
  const { theme } = useLandingTheme();
  const light = theme === "light";

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-ink/35">
          How it works
        </p>
        <h2 className="text-balance text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-ink">
          From connected to shipping in three steps
        </h2>
      </div>

      <div className="relative mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Connecting line (desktop) */}
        <div className="absolute inset-x-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-ink/[0.1] to-transparent md:block" />

        {STEPS.map((s, i) => (
          <motion.div
            key={s.step}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center text-center md:items-start md:text-left"
          >
            <div className="relative">
              {/* transparent accent bloom — the glow/shadow, both themes */}
              <div
                className="absolute inset-0 rounded-xl blur-lg"
                style={{ backgroundColor: s.color, opacity: light ? 0.4 : 0.3 }}
              />
              {/* light: solid accent fill + white icon · dark: original glass chip */}
              <div
                className={cn(
                  "relative flex h-12 w-12 items-center justify-center rounded-xl border",
                  light ? "border-white/10" : "border-ink/[0.08] bg-ink/[0.04]"
                )}
                style={light ? { backgroundColor: s.color } : undefined}
              >
                <s.icon
                  className={cn("h-5 w-5", light ? "text-white" : "text-ink")}
                  strokeWidth={1.75}
                />
              </div>
            </div>

            <span className="mt-5 font-mono text-[12px] tracking-widest text-ink/30">
              {s.step}
            </span>
            <h3 className="mt-2 text-[18px] font-medium tracking-tight text-ink">
              {s.title}
            </h3>
            <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-ink/50">
              {s.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
